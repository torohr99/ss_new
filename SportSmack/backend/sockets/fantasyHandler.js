const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
const {
  generateWeeklyMatchups
} = require('../services/fantasyMatchups');

// Draft settings
const DRAFT_ROUNDS = 15;

function setupFantasySockets(io) {
  io.use(async (socket, next) => {
    try {
      if (socket.user) {
        return next();
      }

      const cookieHeader = socket.handshake.headers.cookie;
      let token = null;

      // Try reading from smack_auth cookie (used by legacy system)
      if (cookieHeader) {
        const tokenString = cookieHeader.split(';').find(c => c.trim().startsWith('smack_auth='));
        if (tokenString) {
          token = decodeURI(tokenString.split('=')[1]);
        }
      }
      
      // Fallback: Check explicit token passed in socket.auth (used by new Bearer auth)
      if (!token && socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      }
      
      if (!token) return next(new Error('Authentication error'));
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod');
      
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user) return next(new Error('User not found'));
      
      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket Auth Error (Fantasy):', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} connected to fantasy sockets`);

    socket.on('join_draft', async ({ leagueId }) => {
      const room = `fantasy_draft_${leagueId}`;
      socket.join(room);
      
      const league = await prisma.fantasyLeague.findUnique({
        where: { id: parseInt(leagueId) },
        include: { teams: true, draftPicks: { include: { player: true } } }
      });
      
      socket.emit('draft_state', {
        status: league.status,
        currentPickIndex: league.currentPickIndex,
        teams: league.teams,
        picks: league.draftPicks
      });
    });

    // Helper to process bot turn
    const processBotTurn = async (leagueId) => {
      try {
        const league = await prisma.fantasyLeague.findUnique({
          where: { id: parseInt(leagueId) },
          include: { teams: { include: { user: true } }, draftPicks: true }
        });
        
        if (league.status !== 'DRAFTING') return;

        const numTeams = league.teams.length;
        const totalPicks = numTeams * 15; // DRAFT_ROUNDS = 15
        if (league.currentPickIndex >= totalPicks) return;

        const round = Math.floor(league.currentPickIndex / numTeams);
        const pickInRound = league.currentPickIndex % numTeams;
        
        let expectedDraftOrder;
        if (round % 2 === 0) {
          expectedDraftOrder = pickInRound + 1;
        } else {
          expectedDraftOrder = numTeams - pickInRound;
        }

        const team = league.teams.find(t => t.draftOrder === expectedDraftOrder);
        if (!team) return;

        // Check if bot
        if (team.user.username.startsWith('Bot_')) {
          // Add a slight delay for realism
          setTimeout(async () => {
            // Find a random undrafted player
            const draftedIds = league.draftPicks.map(p => p.playerId);
            const availablePlayers = await prisma.fantasyPlayer.findMany({
              where: { id: { notIn: draftedIds } }
            });

            if (availablePlayers.length > 0) {
              const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
              
              const pick = await prisma.fantasyDraftPick.create({
                data: {
                  leagueId: league.id,
                  playerId: randomPlayer.id,
                  teamId: team.id,
                  pickNumber: league.currentPickIndex + 1
                },
                include: { player: true }
              });

              await prisma.fantasyTeamPlayer.create({
                data: {
                  teamId: team.id,
                  playerId: randomPlayer.id,
                  status: 'BENCH'
                }
              });

              const nextIndex = league.currentPickIndex + 1;
              let newStatus = 'DRAFTING';

let newStatus = 'DRAFTING';

if (nextIndex >= totalPicks) {
  newStatus = 'SEASON';

  try {
    await generateWeeklyMatchups(
      league.id,
      1
    );

    console.log(
      `Week 1 matchups generated for league ${league.id}`
    );
  } catch (matchupError) {
    console.error(
      `Failed to generate Week 1 matchups for league ${league.id}:`,
      matchupError
    );
  }
}

              await prisma.fantasyLeague.update({
                where: { id: league.id },
                data: { currentPickIndex: nextIndex, status: newStatus }
              });

              io.to(`fantasy_draft_${leagueId}`).emit('pick_made', {
                pick,
                nextPickIndex: nextIndex,
                status: newStatus
              });

              // Recursively process next turn
              processBotTurn(leagueId);
            }
          }, 1500);
        }
      } catch (err) {
        console.error('Bot turn error:', err);
      }
    };

    socket.on('start_draft', async ({ leagueId }) => {
      try {
        const league = await prisma.fantasyLeague.findUnique({
          where: { id: parseInt(leagueId) },
          include: { teams: true }
        });
        
        if (!league || league.ownerId !== socket.user.id) return;
        if (league.status !== 'PREDRAFT') return;
        if (league.teams.length < 2) {
          socket.emit('draft_error', { message: 'Need at least 2 teams to start' });
          return;
        }

        // Shuffle teams
        const teams = [...league.teams];
        for (let i = teams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [teams[i], teams[j]] = [teams[j], teams[i]];
        }

        // Set draft order
        for (let i = 0; i < teams.length; i++) {
          await prisma.fantasyTeam.update({
            where: { id: teams[i].id },
            data: { draftOrder: i + 1 }
          });
        }

        await prisma.fantasyLeague.update({
          where: { id: league.id },
          data: { status: 'DRAFTING', currentPickIndex: 0 }
        });

        const updatedLeague = await prisma.fantasyLeague.findUnique({
          where: { id: league.id },
          include: { teams: true }
        });

        io.to(`fantasy_draft_${leagueId}`).emit('draft_started', {
          teams: updatedLeague.teams,
          status: 'DRAFTING',
          currentPickIndex: 0
        });

        // Trigger bot turn if a bot has the first pick
        processBotTurn(leagueId);
      } catch (err) {
        console.error('Error starting draft:', err);
      }
    });

    socket.on('draft_pick', async ({ leagueId, playerId, teamId }) => {
      try {
        const league = await prisma.fantasyLeague.findUnique({
          where: { id: parseInt(leagueId) },
          include: { teams: true }
        });
        
        if (league.status !== 'DRAFTING') return;

        // Verify it is this user's team
        const team = league.teams.find(t => t.id === parseInt(teamId));
        if (!team || team.userId !== socket.user.id) return;

        // Verify it is this team's turn
        const numTeams = league.teams.length;
        const totalPicks = numTeams * DRAFT_ROUNDS;
        
        if (league.currentPickIndex >= totalPicks) return; // Draft over

        const round = Math.floor(league.currentPickIndex / numTeams);
        const pickInRound = league.currentPickIndex % numTeams;
        
        let expectedDraftOrder;
        if (round % 2 === 0) {
          // Even round: 1 to N
          expectedDraftOrder = pickInRound + 1;
        } else {
          // Odd round: N to 1
          expectedDraftOrder = numTeams - pickInRound;
        }

        if (team.draftOrder !== expectedDraftOrder) {
          socket.emit('draft_error', { message: 'Not your turn!' });
          return;
        }

        // Verify player is not already drafted
        const existingPick = await prisma.fantasyDraftPick.findFirst({
          where: { leagueId: league.id, playerId: parseInt(playerId) }
        });

        if (existingPick) {
          socket.emit('draft_error', { message: 'Player already drafted' });
          return;
        }

        // Record the pick
        const pick = await prisma.fantasyDraftPick.create({
          data: {
            leagueId: league.id,
            playerId: parseInt(playerId),
            teamId: team.id,
            pickNumber: league.currentPickIndex + 1
          },
          include: { player: true }
        });

        // Add to roster
        await prisma.fantasyTeamPlayer.create({
          data: {
            teamId: team.id,
            playerId: parseInt(playerId),
            status: 'BENCH'
          }
        });

        // Advance pick
        const nextIndex = league.currentPickIndex + 1;
        let newStatus = 'DRAFTING';
  league.currentPickIndex + 1;

let newStatus = 'DRAFTING';

if (nextIndex >= totalPicks) {
  newStatus = 'SEASON';

  try {
    await generateWeeklyMatchups(
      league.id,
      1
    );

    console.log(
      `Week 1 matchups generated for league ${league.id}`
    );
  } catch (matchupError) {
    console.error(
      `Failed to generate Week 1 matchups for league ${league.id}:`,
      matchupError
    );
  }
}

        await prisma.fantasyLeague.update({
          where: { id: league.id },
          data: {
            currentPickIndex: nextIndex,
            status: newStatus
          }
        });

        io.to(`fantasy_draft_${leagueId}`).emit('pick_made', {
          pick,
          nextPickIndex: nextIndex,
          status: newStatus
        });

        // Trigger bot turn if it is now a bot's turn
        processBotTurn(leagueId);

      } catch (err) {
        console.error('Error recording pick:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.user?.username} disconnected from fantasy`);
    });
  });
}

module.exports = setupFantasySockets;
