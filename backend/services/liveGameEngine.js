const axios = require('axios');
const sportsApi = require('./sportsApi');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class LiveGameEngine {
  constructor() {
    this.io = null;
    this.intervalId = null;
    this.activeGames = new Map(); // Keep track of latest play IDs to detect new events
    this.lastPollTimes = new Map(); // gameId -> timestamp
  }

  init(io) {
    this.io = io;
    this.start();
  }

  start() {
    // Poll every 30 seconds
    this.intervalId = setInterval(() => this.processLiveGames(), 30000);
    console.log('LiveGameEngine started.');
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async processLiveGames() {
    try {
      // In a real scenario, we'd query our DB for active chatrooms or games happening today.
      // For this implementation, we will mock passing through leagues that likely have active games.
      const leaguesToCheck = ['mlb', 'nba', 'nfl']; // extend as needed
      
      for (const league of leaguesToCheck) {
        // Just checking standard scoreboard to find live games
        const scoreboard = await sportsApi.getScoreboard(league);
        const liveGames = scoreboard.filter(g => g.status === 'in' || g.status.toLowerCase().includes('half') || g.status.toLowerCase().includes('q'));
        
        for (const game of liveGames) {
          await this.processGame(league, game.id);
        }
      }
    } catch (error) {
      console.error('Error processing live games:', error.message);
    }
  }

  async processGame(league, gameId) {
    try {
      const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];
      if (!mapping) return;

      const res = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/summary?event=${gameId}`);
      const summary = res.data;
      if (!summary || !summary.plays) return;

      const plays = summary.plays;
      if (plays.length === 0) return;

      const latestPlay = plays[plays.length - 1];
      const trackingKey = `${league}-${gameId}`;

      // COOLDOWN LOGIC: Max 1 poll every 5 minutes per game
      const lastPoll = this.lastPollTimes.get(trackingKey) || 0;
      const now = Date.now();
      const COOLDOWN_MS = 5 * 60 * 1000;
      if (now - lastPoll < COOLDOWN_MS) return; // Skip if on cooldown

      // Check if there is a new play
      if (this.activeGames.get(trackingKey) !== latestPlay.id) {
        this.activeGames.set(trackingKey, latestPlay.id);
        
        let pollFired = false;

        // ADVANCED HEURISTICS based on boxscore.players
        if (summary.boxscore && summary.boxscore.players) {
          for (const teamData of summary.boxscore.players) {
            if (!teamData.statistics) continue;
            const teamName = teamData.team?.abbreviation || 'The Team';
            
            // MLB: Check Pitching
            if (league === 'mlb') {
              const pitchingStats = teamData.statistics.find(s => s.type === 'pitching');
              if (pitchingStats && pitchingStats.athletes) {
                for (const pitcher of pitchingStats.athletes) {
                  // Find ER index
                  const erIndex = pitchingStats.labels.indexOf('ER');
                  if (erIndex !== -1 && pitcher.stats[erIndex]) {
                    const earnedRuns = parseInt(pitcher.stats[erIndex]);
                    if (earnedRuns >= 4) { // Struggling pitcher
                      this.emitPoll(league, gameId, {
                        question: `${pitcher.athlete.displayName} has given up ${earnedRuns} ER. Should ${teamName} pull him from the game?`,
                        options: ['Yes, get to the bullpen!', 'No, let him work out of it', 'It\'s already too late']
                      });
                      pollFired = true;
                      break;
                    }
                  }
                }
              }
            }
            
            // NFL: Check Passing
            if (league === 'nfl') {
              const passingStats = teamData.statistics.find(s => s.type === 'passing');
              if (passingStats && passingStats.athletes) {
                for (const qb of passingStats.athletes) {
                  const tdIndex = passingStats.labels.indexOf('TD');
                  if (tdIndex !== -1 && qb.stats[tdIndex]) {
                    const passingTDs = parseInt(qb.stats[tdIndex]);
                    if (passingTDs >= 3) { // Great game
                      this.emitPoll(league, gameId, {
                        question: `${qb.athlete.displayName} is dealing with ${passingTDs} TDs! Will he throw for 5+ touchdowns today?`,
                        options: ['Absolutely, he\'s unstoppable', 'No, defense will adjust', 'They will run the ball to kill clock']
                      });
                      pollFired = true;
                      break;
                    }
                  }
                }
              }
            }

            // NBA: Check Scoring
            if (league === 'nba') {
              const scoringStats = teamData.statistics.find(s => s.names && s.names.includes('Points'));
              // Depending on ESPN NBA API, usually athletes just have a flat list where PTS is an index.
              // We'll approximate for demo robustness.
              if (teamData.statistics[0] && teamData.statistics[0].athletes) {
                const ptsIndex = teamData.statistics[0].labels.indexOf('PTS');
                for (const player of teamData.statistics[0].athletes) {
                  if (ptsIndex !== -1 && player.stats[ptsIndex]) {
                    const points = parseInt(player.stats[ptsIndex]);
                    if (points >= 30) {
                      this.emitPoll(league, gameId, {
                        question: `${player.athlete.displayName} already has ${points} PTS! Will they drop a 40-bomb tonight?`,
                        options: ['Easily!', 'They will get double-teamed', 'Coach will bench them in blowout']
                      });
                      pollFired = true;
                      break;
                    }
                  }
                }
              }
            }

            if (pollFired) break;
          }
        }

        if (pollFired) {
          this.lastPollTimes.set(trackingKey, Date.now());
          return;
        }

        // Generic momentum/score polls as fallback
        const isScoring = latestPlay.scoringPlay || (latestPlay.type && latestPlay.type.text && latestPlay.type.text.toLowerCase().includes('run'));
        if (isScoring && Math.random() > 0.5) {
          this.emitPoll(league, gameId, {
            question: `Huge play! What happens next?`,
            options: ['Momentum shifts entirely', 'Opponent answers back immediately', 'Game slows down']
          });
          this.lastPollTimes.set(trackingKey, Date.now());
          return;
        }

        // Randomly inject strategic polls if game is close and near the end
        if (summary.winprobability && summary.winprobability.length > 0) {
          const wp = summary.winprobability[summary.winprobability.length - 1];
          if (wp.homeWinPercentage > 0.4 && wp.homeWinPercentage < 0.6) {
            // Close game!
            if (Math.random() > 0.8) {
              this.emitPoll(league, gameId, {
                question: `It's a nailbiter! Who do you trust in the clutch?`,
                options: ['Home Team Star', 'Away Team Star', 'The Defense']
              });
              this.lastPollTimes.set(trackingKey, Date.now());
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors for individual games to prevent crashing the loop
    }
  }

  async emitPoll(league, gameId, pollData) {
    if (!this.io) return;
    const roomId = `game_${league}_${gameId}`;
    
    try {
      // Save poll to DB so it persists for users joining later
      const newPoll = await prisma.gameMessage.create({
        data: {
          gameId: String(gameId),
          league: league,
          userId: 1, // System/AI User ID (assuming 1 is system)
          content: 'New Live Poll!',
          type: 'poll',
          poll_question: pollData.question,
          poll_options: JSON.stringify(pollData.options),
          poll_results: JSON.stringify({})
        },
        include: { user: { select: { username: true } } }
      });

      // Parse JSON fields for socket emission
      const socketMsg = {
        ...newPoll,
        poll_options: JSON.parse(newPoll.poll_options),
        poll_results: JSON.parse(newPoll.poll_results)
      };

      // Emit to the specific game room
      this.io.to(roomId).emit('new_message', socketMsg);
    } catch (error) {
      console.error('Error emitting dynamic poll:', error.message);
    }
  }
}

module.exports = new LiveGameEngine();
