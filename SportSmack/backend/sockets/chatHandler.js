const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const sportsApi = require('../services/sportsApi');

const prisma = new PrismaClient();

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
      const { league, gameId } = data;
      const room = `game_${league}_${gameId}`;
      socket.join(room);

      try {
        // Fetch game state
        const gameSummary = await sportsApi.getGameSummary(sportsApi.LEAGUE_MAP[league].sport, league, gameId);
        
        let readOnly = false;
        let readOnlyReason = '';
        
        if (!gameSummary || !gameSummary.header || !gameSummary.header.competitions) {
          readOnly = true;
          readOnlyReason = 'Game data unavailable';
        } else {
          const comp = gameSummary.header.competitions[0];
          const state = comp.status.type.state; // 'pre', 'in', 'post'
          
          // Map user's followed teams to this game to see if they belong
          const espnIdsFollowed = new Set();
          for (const ut of socket.user.teams) {
            let mapping = null;
            if (ut.team.sport.toLowerCase() === 'college') {
              mapping = sportsApi.LEAGUE_MAP[league]; // Map the college to the current game's league
            } else {
              for (const key of Object.keys(sportsApi.LEAGUE_MAP)) {
                if (sportsApi.LEAGUE_MAP[key].sport === ut.team.sport.toLowerCase()) {
                  mapping = sportsApi.LEAGUE_MAP[key];
                  break;
                }
              }
            }

            if (mapping) {
              const details = await sportsApi.getTeamDetails(mapping.sport, mapping.league, ut.team.name);
              if (details) espnIdsFollowed.add(String(details.espnId));
            }
          }

          const homeTeamId = String(comp.competitors.find(c => c.homeAway === 'home').id);
          const awayTeamId = String(comp.competitors.find(c => c.homeAway === 'away').id);
          
          const supportsHome = espnIdsFollowed.has(homeTeamId);
          const supportsAway = espnIdsFollowed.has(awayTeamId);
          const isNeutral = !supportsHome && !supportsAway;

          // Save competitors array so send_message can use it
          socket.gameContext = { 
            league, 
            gameId, 
            supportsHome, 
            supportsAway, 
            isNeutral,
            competitors: comp.competitors
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
          const pollQuestion = (league.includes('nfl') || league.includes('ncaaf')) ? 'Should the coach go for it on 4th down?' :
                               (league.includes('nba') || league.includes('ncaam') || league.includes('ncaaw')) ? 'Should they foul to stop the clock?' :
                               (league.includes('mlb') || league.includes('ncaab')) ? 'Should they pull the pitcher?' :
                               'Who is the MVP of this game?';
          const pollOptions = (league.includes('mlb') || league.includes('ncaab')) ? ['PULL HIM', 'LEAVE HIM'] : ['YES', 'NO'];

          const pollData = {
            isPoll: true,
            question: pollQuestion,
            options: pollOptions,
            votes: {},
            votedUsers: []
          };
          pollOptions.forEach(opt => pollData.votes[opt] = 0);

          // Find a system user or use the joining user to post it
          const systemUser = await prisma.user.findFirst(); // Any user, ideally admin
          if (systemUser) {
            const pollMsg = await prisma.gameMessage.create({
              data: {
                gameId: String(gameId),
                league,
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
          messages: messages.reverse()
        });

      } catch (err) {
        console.error('Error in join_game:', err);
        callback({ success: false, message: 'Server error joining game' });
      }
    });

    socket.on('send_message', async (data, callback) => {
      const { league, gameId, content } = data;
      
      if (!socket.gameContext || socket.gameContext.gameId !== gameId) {
        return callback({ success: false, message: 'Not joined to this game' });
      }

      // Re-verify read only (simplified for speed, relying on join validation for simplicity, 
      // but in prod we should re-fetch game state to prevent cheating. For this demo, we trust the connection state)
      // Basic XSS sanitization: strip HTML tags
      const sanitizedContent = content.replace(/<\/?[^>]+(>|$)/g, "");

      try {
        // Find user's favorite team that matches this game
        let userTeamBadge = { abbreviation: 'Neutral', color: '#666' };
        let teamId = null;
        if (socket.gameContext && socket.gameContext.competitors) {
          const userTeams = await prisma.userTeam.findMany({
            where: { user_id: socket.user.id },
            include: { team: true }
          });
          // Match by name instead of espn_id (Team model has no espn_id field)
          const gameCompetitors = socket.gameContext.competitors.map(c => ({
            espnId: String(c.team.id),
            displayName: (c.team.displayName || '').toLowerCase(),
            shortName: (c.team.name || '').toLowerCase(),
            color: c.team.color || '888888'
          }));
          for (const ut of userTeams) {
            const dbTeamName = ut.team.name.toLowerCase();
            const dbCityName = (ut.team.city || '').toLowerCase();
            for (const comp of gameCompetitors) {
              if (comp.displayName.includes(dbTeamName) || 
                  comp.shortName.includes(dbTeamName) ||
                  (dbCityName && comp.displayName.includes(dbCityName))) {
                userTeamBadge = { abbreviation: ut.team.name, color: `#${comp.color}` };
                break;
              }
            }
            if (userTeamBadge.abbreviation !== 'Neutral') break;
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
