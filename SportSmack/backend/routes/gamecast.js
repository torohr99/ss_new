const express = require('express');
const router = express.Router();
const axios = require('axios');
const gameAI = require('../services/gameAI')
const sportsApi = require('../services/sportsApi');
const gameAnalysis = require('../services/gameAnalysis');

// @route GET /api/gamecast/:league/:gameId/pregame-analysis
// @desc Generate matchup-specific AI pre-game analysis

router.get(
  '/:league/:gameId/pregame-analysis',
  async (req, res) => {
    const { league, gameId } = req.params;

    try {
      const leagueKey =
        String(league).toLowerCase();

      const mapping =
        sportsApi.LEAGUE_MAP?.[leagueKey];

      if (!mapping) {
        return res.status(400).json({
          success: false,
          message: `Unsupported league: ${league}`
        });
      }

      const summary =
        await sportsApi.getGameSummary(
          mapping.sport,
          league,
          gameId
        );

      if (!summary) {
        return res.status(404).json({
          success: false,
          message: 'Game data unavailable'
        });
      }

      /*
       * IMPORTANT:
       * Use the centralized live-game builder.
       */
      const gameState =
        sportsApi.buildLiveGameState
          ? sportsApi.buildLiveGameState(
              summary,
              league,
              gameId
            )
          : summary;

      const result =
        await gameAI.getPregameAnalysis(
          gameState,
          league,
          gameId
        );

      res.json(result);

    } catch (error) {
      console.error(
        'AI analysis error:',
        error.response?.data ||
        error.message
      );

      res.status(503).json({
        success: false,
        code: 'AI_ANALYSIS_UNAVAILABLE',
        message:
          'AI analysis is temporarily unavailable.'
      });
    }
  }
);

// Helper to get raw ESPN summary
async function getGameSummary(league, gameId) {
  const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];
  if (!mapping) throw new Error('Invalid league mapping');
  
  const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/summary?event=${gameId}`);
  return response.data;
}

// @route GET /api/gamecast/:league/:gameId/timeline
// @desc  Generates AI Timeline from live plays and win probabilities
router.get('/:league/:gameId/timeline', async (req, res) => {
  try {
    const summary = await getGameSummary(req.params.league, req.params.gameId);
    
    // Fallback if the game hasn't started or summary is missing
    if (!summary || !summary.header) {
      return res.status(404).json({ message: 'Game data not found' });
    }

    const comp = summary.header?.competitions?.[0];

    if (!comp) {
        return res.status(404).json({
            message: 'Game data not available yet.'
        });
    }
    
    const status = comp.status?.type?.state || 'unknown';

    let timeline = [];

    if (status === 'pre') {

        const homeTeam =
            comp.competitors?.find(
                c => c.homeAway === 'home'
            );
    
        const awayTeam =
            comp.competitors?.find(
                c => c.homeAway === 'away'
            );
    
        timeline.push({
            id: 'pre-1',
            time: 'Pre-Game',
            title: 'AI Pre-Game Analysis',
            text:
                homeTeam && awayTeam
                    ? `${awayTeam.team?.displayName || 'Away Team'} at ${homeTeam.team?.displayName || 'Home Team'}. Detailed AI matchup analysis is available above.`
                    : 'Detailed AI matchup analysis is available above.',
            type: 'analysis'
        });
    
    } else {
      // Process live or completed plays
      const plays = summary.plays || [];
      const scoringPlays = plays.filter(p => p.scoringPlay || p.type?.text?.toLowerCase().includes('home run') || p.type?.text?.toLowerCase().includes('touchdown'));
      
      scoringPlays.forEach((p, idx) => {
        timeline.push({
          id: `play-${p.id || idx}`,
          time: p.clock?.displayValue || `Q${p.period?.number}`,
          title: 'Scoring Play',
          text: p.text,
          type: 'scoring'
        });
      });
      
      // If post-game, add recap
      if (status === 'post') {
        timeline.push({
          id: 'post-1',
          time: 'Final',
          title: 'Game Recap',
          text: `The game has concluded! Final score: ${comp.competitors.find(c=>c.homeAway==='away').team.abbreviation} ${comp.competitors.find(c=>c.homeAway==='away').score} - ${comp.competitors.find(c=>c.homeAway==='home').team.abbreviation} ${comp.competitors.find(c=>c.homeAway==='home').score}.`,
          type: 'recap'
        });
      }
    }

    res.json({ status, timeline, winProbability: summary.winprobability || [] });
  } catch (error) {
    console.error('Error fetching timeline:', error.message);
    res.status(500).json({ message: 'Server error fetching timeline' });
  }
});

// @route GET /api/gamecast/:league/:gameId/stats
// @desc  Returns continuous live boxscore stats
router.get('/:league/:gameId/stats', async (req, res) => {
  try {
    const summary = await getGameSummary(req.params.league, req.params.gameId);
    if (!summary || !summary.boxscore) {
      return res.status(404).json({ message: 'Stats not available yet' });
    }

    let teamRecords = {};
    try {
      const standings = await sportsApi.getStandings(req.params.league);
      const competitors = summary.header?.competitions?.[0]?.competitors || [];
      competitors.forEach(c => {
        const teamId = c.team.id;
        const standing = standings.find(s => String(s.id) === String(teamId));
        if (standing) {
          teamRecords[teamId] = standing;
        }
      });
    } catch (e) {
      console.error('Error attaching team records:', e.message);
    }

    res.json({
      ...summary.boxscore,
      teamRecords,
      competitors: summary.header?.competitions?.[0]?.competitors || [] // Need competitors for team names/logos if boxscore is empty
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
});

// @route GET /api/gamecast/:league/:gameId/polls
// @desc  Algorithmically generates polls based on live context
router.get('/:league/:gameId/polls', async (req, res) => {
  try {
    const summary = await getGameSummary(req.params.league, req.params.gameId);
    if (!summary || !summary.header) return res.json([]);

    const status = summary.header.competitions[0].status.type.state;
    const homeName = summary.header.competitions[0].competitors.find(c=>c.homeAway==='home').team.displayName;
    const awayName = summary.header.competitions[0].competitors.find(c=>c.homeAway==='away').team.displayName;

    let polls = [];

    if (status === 'pre') {
      polls.push({
        id: 'poll-pre-1',
        question: `Who will win today's game?`,
        options: [
          { text: homeName, votes: 12 },
          { text: awayName, votes: 9 }
        ]
      });
      polls.push({
        id: 'poll-pre-2',
        question: `Who will score first?`,
        options: [
          { text: homeName, votes: 15 },
          { text: awayName, votes: 15 }
        ]
      });
    } else if (status === 'in') {
      polls.push({
        id: 'poll-live-1',
        question: `What will be the turning point of the 2nd half?`,
        options: [
          { text: 'A major defensive stop', votes: 4 },
          { text: 'A clutch offensive drive', votes: 6 },
          { text: 'A crucial turnover', votes: 2 }
        ]
      });
    } else {
      polls.push({
        id: 'poll-post-1',
        question: `Who is your Player of the Game?`,
        options: [
          { text: `${homeName} MVP`, votes: 32 },
          { text: `${awayName} MVP`, votes: 5 }
        ]
      });
    }

    res.json(polls);
  } catch (error) {
    console.error('Error fetching polls:', error.message);
    res.status(500).json({ message: 'Server error fetching polls' });
  }
});

module.exports = router;
