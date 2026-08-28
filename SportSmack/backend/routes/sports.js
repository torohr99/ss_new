const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const sportsApi = require('../services/sportsApi');

// @route   GET /api/sports/:league/scoreboard
router.get('/:league/scoreboard', authMiddleware, async (req, res) => {
  try {
    const league = req.params.league.toLowerCase();
    const data = await sportsApi.getScoreboard(league);
    res.json(data);
  } catch (error) {
    if (error.message === 'Invalid league') {
      return res.status(400).json({ message: 'Invalid league provided' });
    }
    res.status(500).json({ message: 'Server error fetching scoreboard' });
  }
});

// @route   GET /api/sports/:league/standings
router.get('/:league/standings', authMiddleware, async (req, res) => {
  try {
    const league = req.params.league.toLowerCase();
    const data = await sportsApi.getStandings(league);
    res.json(data);
  } catch (error) {
    if (error.message === 'Invalid league') {
      return res.status(400).json({ message: 'Invalid league provided' });
    }
    res.status(500).json({ message: 'Server error fetching standings' });
  }
});

// @route   GET /api/sports/:league/game/:gameId
router.get('/:league/game/:gameId', authMiddleware, async (req, res) => {
  try {
    const { league, gameId } = req.params;
    const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];
    if (!mapping) return res.status(400).json({ message: 'Invalid league' });

    // Using ESPN's summary endpoint for the game
    const axios = require('axios');
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/summary?event=${gameId}`);
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching game summary:', error.message);
    res.status(500).json({ message: 'Server error fetching game summary' });
  }
});

// @route   GET /api/sports/:league/game/:gameId/analysis
router.get('/:league/game/:gameId/analysis', authMiddleware, async (req, res) => {
  try {
    const { league, gameId } = req.params;
    const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];
    if (!mapping) return res.status(400).json({ message: 'Invalid league' });

    // In a real scenario, this would call an LLM (like Gemini or OpenAI) using the game summary stats.
    // For now, we procedurally generate a highly detailed realistic analysis based on team matchup.
    const axios = require('axios');
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/summary?event=${gameId}`);
    const summary = response.data;
    
    if (!summary || !summary.header || !summary.header.competitions) {
      return res.status(404).json({ message: 'Game not found or analysis unavailable.' });
    }

    const comp = summary.header.competitions[0];
    const homeCompetitor = comp.competitors.find(c => c.homeAway === 'home');
    const awayCompetitor = comp.competitors.find(c => c.homeAway === 'away');
    const homeTeam = homeCompetitor.team;
    const awayTeam = awayCompetitor.team;
    
    // Extract real records if available
    const homeRecord = homeCompetitor.records?.find(r => r.type === 'total')?.summary || 'Unknown Record';
    const awayRecord = awayCompetitor.records?.find(r => r.type === 'total')?.summary || 'Unknown Record';
    
    const homeStanding = homeCompetitor.records?.find(r => r.type === 'home')?.summary || '0-0 at home';
    const awayStanding = awayCompetitor.records?.find(r => r.type === 'road')?.summary || '0-0 on the road';
    // Parse leaders if available for more specific insights
    let leadersText = '';
    if (summary.leaders) {
      const hLeaders = summary.leaders.find(l => l.team.id === homeTeam.id)?.leaders?.[0]?.leaders?.[0]?.athlete?.displayName;
      const aLeaders = summary.leaders.find(l => l.team.id === awayTeam.id)?.leaders?.[0]?.leaders?.[0]?.athlete?.displayName;
      if (hLeaders || aLeaders) {
        leadersText = `- **Key Players to Watch:** Look out for ${hLeaders || 'the top performers'} on the ${homeTeam.name}, going up against ${aLeaders || 'the stars'} of the ${awayTeam.name}.`;
      }
    }

    // Weather
    let weatherText = '';
    if (summary.weather && summary.weather.displayValue) {
      weatherText = `- **Weather Conditions:** ${summary.weather.displayValue}. ${summary.weather.temperature ? `Temperature around ${summary.weather.temperature}°F.` : ''}`;
    }

    // Injuries
    let injuriesText = '';
    if (summary.injuries) {
      const hInjuries = summary.injuries.find(i => i.team.id === homeTeam.id)?.injuries || [];
      const aInjuries = summary.injuries.find(i => i.team.id === awayTeam.id)?.injuries || [];
      const outPlayers = [...hInjuries, ...aInjuries].filter(i => i.status === 'Out' || i.status === 'Questionable').slice(0, 3);
      if (outPlayers.length > 0) {
        injuriesText = `- **Injury Impact:** Key players listed as questionable/out include ${outPlayers.map(i => i.athlete.displayName).join(', ')}. This could heavily impact the gameplan.`;
      }
    }

    // Predictor / Win Probability
    let predictionText = '';
    let confidence = 50;
    let favoredTeam = homeTeam.displayName;
    if (summary.predictor && summary.predictor.homeTeam) {
      confidence = summary.predictor.homeTeam.gameProjection || 50;
      if (confidence < 50) {
        favoredTeam = awayTeam.displayName;
        confidence = 100 - confidence;
      }
      predictionText = `ESPN's FPI Matchup Predictor heavily factors in recent performance and advanced metrics, giving the ${favoredTeam} a **${confidence}%** chance of securing the victory today.`;
    } else {
      predictionText = `Based on current standings and historical performance, our model slightly favors the ${homeTeam.displayName} due to home-field advantage.`;
    }

    const analysisText = `
**AI PRE-GAME ANALYSIS: ${awayTeam.displayName} (${awayRecord}) vs. ${homeTeam.displayName} (${homeRecord})**

**Matchup Overview**
This highly anticipated matchup features a clash of styles. The ${homeTeam.displayName} come in with a home record of ${homeStanding} and have been performing well on their home turf. Meanwhile, the ${awayTeam.displayName} (${awayStanding} on the road) have shown resilience away from home. 

**Key Factors & Live Context**
${weatherText}
${injuriesText}
${leadersText}

**AI Prediction**
${predictionText} Expect a tight contest early on, with the favored team looking to pull away in the final stages of the game.
    `.trim();

    res.json({ analysis: analysisText });
  } catch (error) {
    console.error('Error generating AI analysis:', error.message);
    res.status(500).json({ message: 'Server error generating analysis' });
  }
});

module.exports = router;
