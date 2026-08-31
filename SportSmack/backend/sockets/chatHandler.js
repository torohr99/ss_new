const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const gameAI = require('../services/gameAI');
const sportsApi = require('../services/sportsApi');
const gamePolls = require('../services/gamePolls');

const prisma = new PrismaClient();

async function userFollowsGameTeam(userId, competitors) {
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return {
      follows: false,
      teamId: null,
      team: null
    };
  }

  const userTeams = await prisma.userTeam.findMany({
    where: {
      user_id: userId
    },
    include: {
      team: true
    }
  });

  for (const competitor of competitors) {
    const espnTeamName = (
      competitor.team?.displayName ||
      competitor.team?.name ||
      competitor.team?.shortDisplayName ||
      ''
    ).toLowerCase();

    const espnShortName = (
      competitor.team?.name ||
      competitor.team?.shortDisplayName ||
      ''
    ).toLowerCase();

    for (const ut of userTeams) {
      const dbTeamName = (ut.team.name || '').toLowerCase();
      const dbCityName = (ut.team.city || '').toLowerCase();
      const dbAbbreviation = (ut.team.abbreviation || '').toLowerCase();

      const nameMatch =
        (dbTeamName && espnTeamName.includes(dbTeamName)) ||
        (dbTeamName && espnShortName.includes(dbTeamName));

      const cityMatch =
        dbCityName &&
        espnTeamName.includes(dbCityName);

      const abbreviationMatch =
        dbAbbreviation &&
        espnShortName.includes(dbAbbreviation);

      if (nameMatch || cityMatch || abbreviationMatch) {
        return {
          follows: true,
          teamId: ut.team.id,
          team: ut.team,
          competitorId: String(
            competitor.id || competitor.team?.id || ''
          )
        };
      }
    }
  }

  return {
    follows: false,
    teamId: null,
    team: null
  };
}

// Helper to parse cookies from handshake
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

module.exports = function(io) {
  // Middleware to authenticate socket
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      let token = cookies.smack_auth;
      
      // Fallback: Check explicit token passed in socket.auth
      if (!token && socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      }
      console.log('Handshake auth:', socket.handshake.auth, 'Token:', !!token);

      if (!token) {
        return next(new Error('Authentication error'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod');
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { teams: { include: { team: true } } }
      });

      if (!user) {
        console.error('Socket auth error: User not found in DB', decoded.id);
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket auth error CAUGHT:', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected to chat: ${socket.user.username}`);

    socket.on('join_game', async (data, callback) => {
      const league = String(data.league || '').trim();
      const gameId = String(data.gameId || '').trim();

      if (!league || !gameId) {
        return callback({
          success: false,
          message: 'League and gameId are required'
        });
    }

      const room = `game_${league}_${gameId}`;
      socket.join(room);

      try {
        // Fetch game state
        const leagueMapping = sportsApi.LEAGUE_MAP[String(league).toLowerCase()];

        if (!leagueMapping) {
            return callback({
                success: false,
                message: `Unsupported league: ${league}`
            });
        }
        
        const gameSummary = await sportsApi.getGameSummary(
            leagueMapping.sport,
            league,
            gameId
        );
        
        let readOnly = false;
        let readOnlyReason = '';
        
        if (
              !gameSummary ||
              !gameSummary.header ||
              !Array.isArray(gameSummary.header.competitions) ||
              gameSummary.header.competitions.length === 0
          ) {
              readOnly = true;
              readOnlyReason = 'Game data unavailable';
          } else {
          const comp = gameSummary.header.competitions[0];
          const state = comp.status.type.state; // 'pre', 'in', 'post'
          
          // Map user's followed teams to this game to see if they belong
          const followResult = await userFollowsGameTeam(
            socket.user.id,
            comp.competitors
          );
          
          const supportsHome = followResult.team
            ? String(comp.competitors.find(c =>
                c.homeAway === 'home'
              )?.team?.id || '') === followResult.competitorId
            : false;
          
          const supportsAway = followResult.team
            ? String(comp.competitors.find(c =>
                c.homeAway === 'away'
              )?.team?.id || '') === followResult.competitorId
            : false;
          
          const isNeutral = !followResult.follows;
          const followsGameTeam = supportsHome || supportsAway;

          // Get centralized AI analysis for this game
          let aiAnalysis = null;
          
          try {
            const gameState =
              sportsApi.buildSportSpecificState
                ? sportsApi.buildSportSpecificState(
                    summary,
                    league
                  )
                : summary;
                      
            aiAnalysis = await gameAI.getPregameAnalysis(
              gameState,
              league,
              gameId
            );
          } catch (error) {
            console.error(
              `Could not obtain shared AI analysis for ${league}/${gameId}:`,
              error.message
            );
          }

          // Save competitors array so send_message can use it
          socket.gameContext = {
            league,
            gameId,
            supportsHome,
            supportsAway,
            isNeutral,
            followsGameTeam,
            competitors: comp.competitors,
            readOnly: false
          };

          if (state === 'post') {
            const homeWinner = comp.competitors.find(c => c.homeAway === 'home').winner;
            const awayWinner = comp.competitors.find(c => c.homeAway === 'away').winner;
            
            // Check 24 hour rule
            // game.date is usually start time, but ESPN status might not have end time easily accessible.
            // We can just use the current time compared to game start time + ~3 hours, or if it's "post" and start date > 24h ago
            const gameStart = new Date(gameSummary.header.season.year ? comp.date : Date.now()); // Fallback
            const hoursSinceStart = (Date.now() - gameStart.getTime()) / (1000 * 60 * 60);

            if (hoursSinceStart > 30) { // Approx 24h after game ends (assuming 6h game duration buffer)
              readOnly = true;
              readOnlyReason = 'Chat has been closed (24 hours passed).';
            } else if (isNeutral) {
              readOnly = true;
              readOnlyReason = 'Read-Only: You do not follow either team.';
            } else if ((supportsHome && homeWinner) || (supportsAway && awayWinner)) {
              readOnly = false;
              readOnlyReason = 'Your team won! Smack talk enabled.';
            } else {
              readOnly = true;
              readOnlyReason = 'Read-Only: Your team lost.';
            }
          }
        }

        // Fetch recent messages
        let messages = await prisma.gameMessage.findMany({
          where: { gameId: String(gameId), league },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: { select: { id: true, username: true } }
          }
        });

        // Add badges to historic messages
        if (gameSummary && gameSummary.header && gameSummary.header.competitions) {
          const comp = gameSummary.header.competitions[0];
          // ESPN competitor team objects have .team.displayName, .team.name, .team.shortDisplayName
          const gameCompetitors = comp.competitors.map(c => ({
            espnId: String(c.team.id),
            displayName: (c.team.displayName || '').toLowerCase(),
            shortName: (c.team.name || '').toLowerCase(),
            color: c.team.color || '888888'
          }));
          
          const uniqueUserIds = [...new Set(messages.map(m => m.userId))];
          const userTeams = await prisma.userTeam.findMany({
            where: { user_id: { in: uniqueUserIds } },
            include: { team: true }
          });
          
          messages = messages.map(msg => {
            const uTeams = userTeams.filter(ut => ut.user_id === msg.userId);
            // Match by team name: check if any followed team's name appears in either competitor name
            const matchedCompetitor = (() => {
              for (const ut of uTeams) {
                const dbTeamName = ut.team.name.toLowerCase();
                const dbCityName = (ut.team.city || '').toLowerCase();
                for (const comp of gameCompetitors) {
                  if (comp.displayName.includes(dbTeamName) || 
                      comp.shortName.includes(dbTeamName) ||
                      (dbCityName && comp.displayName.includes(dbCityName))) {
                    return { teamName: ut.team.name, color: `#${comp.color}` };
                  }
                }
              }
              return null;
            })();
            return {
              ...msg,
              userTeamBadge: matchedCompetitor 
                ? { abbreviation: matchedCompetitor.teamName, color: matchedCompetitor.color }
                : { abbreviation: 'Neutral', color: '#666' }
            };
          });
        }

        // Auto-generate the live prompt poll if it doesn't exist
        const hasPoll = messages.some(m => m.content.startsWith('[POLL_JSON]'));
        if (!hasPoll) {
          // Determine the poll question based on league
          // Generate a matchup-specific AI poll for this game.
          let generatedPoll = null;
          
          try {
            const leagueKey = String(league).toLowerCase();
          
            const leagueMapping =
              sportsApi.LEAGUE_MAP?.[leagueKey];
          
            if (!leagueMapping) {
              throw new Error(
                `Unsupported league for poll generation: ${league}`
              );
            }
          
            const gameSummary =
              await sportsApi.getGameSummary(
                leagueMapping.sport,
                league,
                gameId
              );
          
            if (!gameSummary) {
              throw new Error(
                'Game summary unavailable for poll generation'
              );
            }
          
            generatedPoll =
              await gamePolls.generateGamePoll(
                gameSummary,
                league,
                gameId
              );
          
          } catch (pollError) {
            console.error(
              `AI poll generation failed for ${league}/${gameId}:`,
              pollError.message
            );
          
            // Safe fallback. This prevents joining the chatroom
            // from failing if the AI service is unavailable.
            generatedPoll = {
              question: 'Who has the advantage in this matchup?',
              options: [
                'Home team',
                'Away team'
              ],
              reason:
                'AI-generated matchup context is temporarily unavailable.'
            };
          }
          
          const pollData = {
            isPoll: true,
          
            question: generatedPoll.question,
          
            options: Array.isArray(generatedPoll.options)
              ? generatedPoll.options
              : ['Home team', 'Away team'],
          
            reason:
              generatedPoll.reason || '',
          
            votes: {},
          
            votedUsers: [],
          
            createdAt: Date.now(),
          
            expiresAt:
              Date.now() + (10 * 60 * 1000)
          };
          
          pollData.options.forEach(option => {
            pollData.votes[option] = 0;
          });
          
          const pollMsg = await prisma.gameMessage.create({
            data: {
              gameId: String(gameId),
              league,
              type: 'poll',
              content:
                `[POLL_JSON]${JSON.stringify(pollData)}`,
              userId: systemUser.id
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          });
          
          messages.unshift(pollMsg);
          
          // Broadcast to users currently in the room.
          io.to(room).emit('new_message', pollMsg);
          pollOptions.forEach(opt => pollData.votes[opt] = 0);

          // Find a system user or use the joining user to post it
          const systemUser = await prisma.user.findFirst(); // Any user, ideally admin
          if (systemUser) {
            const pollMsg = await prisma.gameMessage.create({
              data: {
                gameId: String(gameId),
                league,
                type: 'poll',
                content: `[POLL_JSON]${JSON.stringify(pollData)}`,
                userId: systemUser.id
              },
              include: { user: { select: { id: true, username: true } } }
            });
            messages.unshift(pollMsg); // Insert at beginning of fetched list
            // Also broadcast so anyone currently in gets it
            io.to(room).emit('new_message', pollMsg);
          }
        }

        callback({
          success: true,
          readOnly,
          readOnlyReason,
          messages: messages.reverse(),
          aiAnalysis
        });

      } catch (err) {
        console.error('Error in join_game:', err);
        callback({ success: false, message: 'Server error joining game' });
      }
    });

    socket.on('send_message', async (data, callback) => {
      const league = String(data.league || '').trim();
      const gameId = String(data.gameId || '').trim();
      const content = String(data.content || '').trim();
      
      if (
        !socket.gameContext ||
        socket.gameContext.gameId !== gameId ||
        socket.gameContext.league !== league
      ) {
        return callback({
          success: false,
          message: 'Not joined to this game'
        });
      }
      
      if (!socket.gameContext.followsGameTeam) {
        return callback({
          success: false,
          message: 'You must follow one of the teams in this game to chat.'
        });
      }
      
      if (!content) {
        return callback({
          success: false,
          message: 'Message cannot be empty.'
        });
      }

      // Re-verify read only (simplified for speed, relying on join validation for simplicity, 
      // but in prod we should re-fetch game state to prevent cheating. For this demo, we trust the connection state)
      // Basic XSS sanitization: strip HTML tags
      const sanitizedContent = content.replace(/<\/?[^>]+(>|$)/g, "");

      try {
        // Find user's favorite team that matches this game
        let userTeamBadge = {
          abbreviation: 'Neutral',
          color: '#666'
        };
        
        let teamId = null;
        const followResult = await userFollowsGameTeam(
          socket.user.id,
          socket.gameContext.competitors
        );
        
        if (!followResult.follows) {
          return callback({
            success: false,
            message: 'You must follow one of the teams in this game to chat.'
          });
        }
        
        teamId = followResult.teamId;
        
        if (followResult.team) {
          const matchedCompetitor =
            socket.gameContext.competitors.find(c => {
              const displayName = (
                c.team?.displayName ||
                ''
              ).toLowerCase();
        
              const shortName = (
                c.team?.name ||
                c.team?.shortDisplayName ||
                ''
              ).toLowerCase();
        
              const teamName = (
                followResult.team.name ||
                ''
              ).toLowerCase();
        
              const teamCity = (
                followResult.team.city ||
                ''
              ).toLowerCase();
        
              return (
                (teamName && displayName.includes(teamName)) ||
                (teamName && shortName.includes(teamName)) ||
                (teamCity && displayName.includes(teamCity))
              );
            });
        
          if (matchedCompetitor) {
            userTeamBadge = {
              abbreviation: followResult.team.abbreviation ||
                followResult.team.name,
              color: `#${matchedCompetitor.team.color || '888888'}`
            };
          }
        }

        const msg = await prisma.gameMessage.create({
          data: {
            gameId: String(gameId),
            league,
            content: sanitizedContent,
            userId: socket.user.id,
            teamId: teamId
          },
          include: {
            user: { select: { id: true, username: true } }
          }
        });
        
        // Attach transient badge for realtime display
        if (userTeamBadge) {
          msg.userTeamBadge = userTeamBadge;
        }

        // Broadcast to everyone in room
        io.to(`game_${league}_${gameId}`).emit('new_message', msg);
        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Error sending message:', err);
        if (callback) callback({ success: false });
      }
    });

    socket.on('create_poll', async (data, callback) => {
      const { league, gameId, question, options } = data;
      if (!socket.gameContext || socket.gameContext.gameId !== gameId) {
        return callback && callback({ success: false, message: 'Not joined to this game' });
      }

      try {
        const pollData = {
          isPoll: true,
          question,
          options,
          votes: {} // e.g. { "YES": 0, "NO": 0 }
        };
        options.forEach(opt => pollData.votes[opt] = 0);
        pollData.votedUsers = []; // keep track of who voted so they can't vote twice

        const msg = await prisma.gameMessage.create({
          data: {
            gameId: String(gameId),
            league,
            type: 'poll',
            content: `[POLL_JSON]${JSON.stringify(pollData)}`,
            userId: socket.user.id
          },
          include: {
            user: { select: { id: true, username: true } }
          }
        });

        io.to(`game_${league}_${gameId}`).emit('new_message', msg);
        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Error creating poll:', err);
        if (callback) callback({ success: false });
      }
    });

    socket.on('vote_poll', async (data, callback) => {
      const { messageId, option } = data;
      try {
        const msg = await prisma.gameMessage.findUnique({ where: { id: messageId } });
        if (!msg || msg.type !== 'poll') return;

        let results = {};
        try {
          results = JSON.parse(msg.poll_results || '{}');
        } catch(e) {}
        
        let votedUsers = [];
        try {
          votedUsers = JSON.parse(msg.content || '[]'); // Storing voted users in content field since it's unused for polls, or better yet, just let anyone vote for demo
        } catch(e) {}

        // Allow multiple votes for demo or check votedUsers if strict
        // For simplicity, we just increment
        results[option] = (results[option] || 0) + 1;

        const updatedMsg = await prisma.gameMessage.update({
          where: { id: messageId },
          data: { poll_results: JSON.stringify(results) },
          include: { user: { select: { id: true, username: true } } }
        });

        // Broadcast the updated message
        io.to(`game_${msg.league}_${msg.gameId}`).emit('poll_updated', updatedMsg);
        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Error voting on poll:', err);
        if (callback) callback({ success: false });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username}`);
    });
  });
};
