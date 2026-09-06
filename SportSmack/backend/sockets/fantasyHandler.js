const prisma = require('../lib/prisma');
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
        const tokenString = cookieHeader
          .split(';')
          .find(c => c.trim().startsWith('smack_auth='));

        if (tokenString) {
          token = decodeURI(tokenString.split('=')[1]);
        }
      }

      // Fallback: Check explicit token passed in socket.auth
      // (used by new Bearer auth)
      if (
        !token &&
        socket.handshake.auth &&
        socket.handshake.auth.token
      ) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod'
      );

      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket Auth Error (Fantasy):', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(
      `User ${socket.user.username} connected to fantasy sockets`
    );

    // ---------------------------------------------------------
    // Helper: Process bot turn
    // ---------------------------------------------------------
    const processBotTurn = async (leagueId) => {
      try {
        const parsedLeagueId = parseInt(leagueId, 10);

        const league = await prisma.fantasyLeague.findUnique({
          where: { id: parsedLeagueId },
          include: {
            teams: {
              include: {
                user: true
              }
            },
            draftPicks: true
          }
        });

        if (!league) {
          return;
        }

        if (league.status !== 'DRAFTING') {
          return;
        }

        const numTeams = league.teams.length;
        const totalPicks = numTeams * DRAFT_ROUNDS;

        if (league.currentPickIndex >= totalPicks) {
          return;
        }

        // Determine which team should pick.
        const round = Math.floor(
          league.currentPickIndex / numTeams
        );

        const pickInRound =
          league.currentPickIndex % numTeams;

        let expectedDraftOrder;

        if (round % 2 === 0) {
          // Even rounds: 1 -> N
          expectedDraftOrder = pickInRound + 1;
        } else {
          // Odd rounds: N -> 1
          expectedDraftOrder = numTeams - pickInRound;
        }

        const team = league.teams.find(
          t => t.draftOrder === expectedDraftOrder
        );

        if (!team) {
          console.error(
            `Could not find team for draft order ${expectedDraftOrder}`
          );
          return;
        }

        // Only process the turn automatically if this is a bot.
        if (!team.user || !team.user.username.startsWith('Bot_')) {
          return;
        }

        // Add a slight delay for realism.
        setTimeout(async () => {
          try {
            // Re-fetch the league immediately before making the pick
            // so we do not use stale draft state.
            const currentLeague =
              await prisma.fantasyLeague.findUnique({
                where: { id: parsedLeagueId },
                include: {
                  teams: {
                    include: {
                      user: true
                    }
                  },
                  draftPicks: true
                }
              });

            if (!currentLeague) {
              return;
            }

            if (currentLeague.status !== 'DRAFTING') {
              return;
            }

            const currentNumTeams =
              currentLeague.teams.length;

            const currentTotalPicks =
              currentNumTeams * DRAFT_ROUNDS;

            if (
              currentLeague.currentPickIndex >=
              currentTotalPicks
            ) {
              return;
            }

            // Recalculate whose turn it is using the fresh state.
            const currentRound = Math.floor(
              currentLeague.currentPickIndex /
                currentNumTeams
            );

            const currentPickInRound =
              currentLeague.currentPickIndex %
              currentNumTeams;

            let currentExpectedDraftOrder;

            if (currentRound % 2 === 0) {
              currentExpectedDraftOrder =
                currentPickInRound + 1;
            } else {
              currentExpectedDraftOrder =
                currentNumTeams -
                currentPickInRound;
            }

            const currentTeam =
              currentLeague.teams.find(
                t =>
                  t.draftOrder ===
                  currentExpectedDraftOrder
              );

            if (!currentTeam) {
              return;
            }

            if (
              !currentTeam.user ||
              !currentTeam.user.username.startsWith('Bot_')
            ) {
              return;
            }

            // Find players who have not already been drafted.
            const draftedIds =
              currentLeague.draftPicks.map(
                p => p.playerId
              );

            const availablePlayers =
              await prisma.fantasyPlayer.findMany({
                where:
                  draftedIds.length > 0
                    ? {
                        id: {
                          notIn: draftedIds
                        }
                      }
                    : {}
              });

            if (availablePlayers.length === 0) {
              console.error(
                `No available fantasy players remain for league ${parsedLeagueId}`
              );
              return;
            }

            // Simple bot strategy for now:
            // choose a random available player.
            const randomPlayer =
              availablePlayers[
                Math.floor(
                  Math.random() *
                    availablePlayers.length
                )
              ];

            const pickNumber =
              currentLeague.currentPickIndex + 1;

            const nextIndex =
              currentLeague.currentPickIndex + 1;

            let newStatus = 'DRAFTING';

            if (
              nextIndex >= currentTotalPicks
            ) {
              newStatus = 'SEASON';
            }

            // Atomically:
            // 1. Create draft pick
            // 2. Add player to roster
            // 3. Advance draft
            const result =
              await prisma.$transaction(
                async tx => {
                  const pick =
                    await tx.fantasyDraftPick.create({
                      data: {
                        leagueId:
                          currentLeague.id,
                        playerId:
                          randomPlayer.id,
                        teamId:
                          currentTeam.id,
                        pickNumber
                      },
                      include: {
                        player: true
                      }
                    });

                  await tx.fantasyTeamPlayer.create({
                    data: {
                      teamId:
                        currentTeam.id,
                      playerId:
                        randomPlayer.id,
                      status: 'BENCH'
                    }
                  });

                  await tx.fantasyLeague.update({
                    where: {
                      id: currentLeague.id
                    },
                    data: {
                      currentPickIndex:
                        nextIndex,
                      status: newStatus
                    }
                  });

                  return pick;
                }
              );

            // If the draft just finished, generate Week 1.
            if (newStatus === 'SEASON') {
              try {
                await generateWeeklyMatchups(
                  currentLeague.id,
                  1
                );

                console.log(
                  `Week 1 matchups generated for league ${currentLeague.id}`
                );
              } catch (matchupError) {
                console.error(
                  `Failed to generate Week 1 matchups for league ${currentLeague.id}:`,
                  matchupError
                );
              }
            }

            io.to(
              `fantasy_draft_${parsedLeagueId}`
            ).emit('pick_made', {
              pick: result,
              nextPickIndex: nextIndex,
              status: newStatus
            });

            // Continue to the next bot turn, if applicable.
            if (newStatus === 'DRAFTING') {
              processBotTurn(parsedLeagueId);
            }
          } catch (err) {
            console.error(
              'Bot turn execution error:',
              err
            );
          }
        }, 1500);
      } catch (err) {
        console.error(
          'Bot turn error:',
          err
        );
      }
    };

    // ---------------------------------------------------------
    // Join draft
    // ---------------------------------------------------------
    socket.on(
      'join_draft',
      async ({ leagueId }) => {
        try {
          const parsedLeagueId =
            parseInt(leagueId, 10);

          if (Number.isNaN(parsedLeagueId)) {
            socket.emit('draft_error', {
              message: 'Invalid league ID.'
            });
            return;
          }

          const room =
            `fantasy_draft_${parsedLeagueId}`;

          socket.join(room);

          const league =
            await prisma.fantasyLeague.findUnique({
              where: {
                id: parsedLeagueId
              },
              include: {
                teams: {
                  include: {
                    user: true
                  }
                },
                draftPicks: {
                  include: {
                    player: true
                  }
                }
              }
            });

          if (!league) {
            socket.emit('draft_error', {
              message: 'League not found.'
            });
            return;
          }

          socket.emit('draft_state', {
            status: league.status,
            currentPickIndex:
              league.currentPickIndex,
            teams: league.teams,
            picks: league.draftPicks
          });

          // If the league is already drafting,
          // immediately start the bot engine if needed.
          if (league.status === 'DRAFTING') {
            processBotTurn(parsedLeagueId);
          }
        } catch (err) {
          console.error(
            'Error joining fantasy draft:',
            err
          );

          socket.emit('draft_error', {
            message: 'Failed to join draft.'
          });
        }
      }
    );

    // ---------------------------------------------------------
    // Start draft
    // ---------------------------------------------------------
    socket.on(
      'start_draft',
      async ({ leagueId }) => {
        try {
          const parsedLeagueId =
            parseInt(leagueId, 10);

          if (Number.isNaN(parsedLeagueId)) {
            socket.emit('draft_error', {
              message: 'Invalid league ID.'
            });
            return;
          }

          const league =
            await prisma.fantasyLeague.findUnique({
              where: {
                id: parsedLeagueId
              },
              include: {
                teams: true
              }
            });

          if (!league) {
            socket.emit('draft_error', {
              message: 'League not found.'
            });
            return;
          }

          if (
            league.ownerId !==
            socket.user.id
          ) {
            return;
          }

          if (league.status !== 'PREDRAFT') {
            return;
          }

          if (league.teams.length < 2) {
            socket.emit('draft_error', {
              message:
                'Need at least 2 teams to start'
            });
            return;
          }

          // Shuffle teams.
          const teams = [...league.teams];

          for (
            let i = teams.length - 1;
            i > 0;
            i--
          ) {
            const j = Math.floor(
              Math.random() * (i + 1)
            );

            [teams[i], teams[j]] = [
              teams[j],
              teams[i]
            ];
          }

          // Assign draft order.
          // IMPORTANT: We are ONLY updating draftOrder here.
          // We are NOT creating draft picks yet.
          await prisma.$transaction(
            async tx => {
              for (
                let i = 0;
                i < teams.length;
                i++
              ) {
                await tx.fantasyTeam.update({
                  where: {
                    id: teams[i].id
                  },
                  data: {
                    draftOrder: i + 1
                  }
                });
              }

              await tx.fantasyLeague.update({
                where: {
                  id: league.id
                },
                data: {
                  status: 'DRAFTING',
                  currentPickIndex: 0
                }
              });
            }
          );

          const updatedLeague =
            await prisma.fantasyLeague.findUnique({
              where: {
                id: league.id
              },
              include: {
                teams: {
                  include: {
                    user: true
                  }
                }
              }
            });

          io.to(
            `fantasy_draft_${parsedLeagueId}`
          ).emit('draft_started', {
            teams: updatedLeague.teams,
            status: 'DRAFTING',
            currentPickIndex: 0
          });

          // Trigger bot turn if a bot has the first pick.
          processBotTurn(parsedLeagueId);
        } catch (err) {
          console.error(
            'Error starting draft:',
            err
          );

          socket.emit('draft_error', {
            message: 'Failed to start draft.'
          });
        }
      }
    );

    // ---------------------------------------------------------
    // Make draft pick
    // ---------------------------------------------------------
    socket.on(
      'draft_pick',
      async ({
        leagueId,
        playerId,
        teamId
      }) => {
        try {
          const parsedLeagueId =
            parseInt(leagueId, 10);

          const parsedPlayerId =
            parseInt(playerId, 10);

          const parsedTeamId =
            parseInt(teamId, 10);

          if (
            Number.isNaN(parsedLeagueId) ||
            Number.isNaN(parsedPlayerId) ||
            Number.isNaN(parsedTeamId)
          ) {
            socket.emit('draft_error', {
              message: 'Invalid draft information.'
            });
            return;
          }

          const league =
            await prisma.fantasyLeague.findUnique({
              where: {
                id: parsedLeagueId
              },
              include: {
                teams: true
              }
            });

          if (!league) {
            socket.emit('draft_error', {
              message: 'League not found.'
            });
            return;
          }

          if (league.status !== 'DRAFTING') {
            return;
          }

          // Verify it is this user's team.
          const team = league.teams.find(
            t => t.id === parsedTeamId
          );

          if (
            !team ||
            team.userId !== socket.user.id
          ) {
            return;
          }

          // Verify it is this team's turn.
          const numTeams =
            league.teams.length;

          const totalPicks =
            numTeams * DRAFT_ROUNDS;

          if (
            league.currentPickIndex >=
            totalPicks
          ) {
            return;
          }

          const round = Math.floor(
            league.currentPickIndex /
              numTeams
          );

          const pickInRound =
            league.currentPickIndex %
            numTeams;

          let expectedDraftOrder;

          if (round % 2 === 0) {
            // Even round: 1 -> N
            expectedDraftOrder =
              pickInRound + 1;
          } else {
            // Odd round: N -> 1
            expectedDraftOrder =
              numTeams -
              pickInRound;
          }

          if (
            team.draftOrder !==
            expectedDraftOrder
          ) {
            socket.emit('draft_error', {
              message: 'Not your turn!'
            });
            return;
          }

          // Verify player is not already drafted.
          const existingPick =
            await prisma.fantasyDraftPick.findFirst({
              where: {
                leagueId: league.id,
                playerId: parsedPlayerId
              }
            });

          if (existingPick) {
            socket.emit('draft_error', {
              message:
                'Player already drafted'
            });
            return;
          }

          const nextIndex =
            league.currentPickIndex + 1;

          let newStatus = 'DRAFTING';

          if (nextIndex >= totalPicks) {
            newStatus = 'SEASON';
          }

          // Atomically:
          // 1. Create draft pick
          // 2. Add player to roster
          // 3. Advance draft
          const pick =
            await prisma.$transaction(
              async tx => {
                const createdPick =
                  await tx.fantasyDraftPick.create({
                    data: {
                      leagueId:
                        league.id,
                      playerId:
                        parsedPlayerId,
                      teamId:
                        team.id,
                      pickNumber:
                        league.currentPickIndex +
                        1
                    },
                    include: {
                      player: true
                    }
                  });

                await tx.fantasyTeamPlayer.create({
                  data: {
                    teamId: team.id,
                    playerId:
                      parsedPlayerId,
                    status: 'BENCH'
                  }
                });

                await tx.fantasyLeague.update({
                  where: {
                    id: league.id
                  },
                  data: {
                    currentPickIndex:
                      nextIndex,
                    status: newStatus
                  }
                });

                return createdPick;
              }
            );

          // If the draft just finished,
          // generate Week 1 matchups.
          if (newStatus === 'SEASON') {
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

          io.to(
            `fantasy_draft_${parsedLeagueId}`
          ).emit('pick_made', {
            pick,
            nextPickIndex: nextIndex,
            status: newStatus
          });

          // Trigger bot turn if the next team is a bot.
          if (newStatus === 'DRAFTING') {
            processBotTurn(parsedLeagueId);
          }
        } catch (err) {
          console.error(
            'Error recording pick:',
            err
          );

          // Handle duplicate draft/roster entries cleanly.
          if (err.code === 'P2002') {
            socket.emit('draft_error', {
              message:
                'That player was just drafted. Please choose another player.'
            });
            return;
          }

          socket.emit('draft_error', {
            message:
              'Failed to record draft pick.'
          });
        }
      }
    );

    // ---------------------------------------------------------
    // Disconnect
    // ---------------------------------------------------------
    socket.on('disconnect', () => {
      console.log(
        `User ${socket.user?.username} disconnected from fantasy`
      );
    });
  });
}

module.exports = setupFantasySockets;
