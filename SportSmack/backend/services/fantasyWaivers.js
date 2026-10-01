const prisma =
  require('../lib/prisma');

const {
  Prisma
} = require('@prisma/client');

const cache =
  require('./cache');

const {
  withFantasyRosterLock
} = require('./fantasyLocks');

const MAX_ROSTER_SIZE = 15;

const WAIVER_LOCK_TTL_SECONDS = 300;

const WAIVER_LEAGUE_BATCH_SIZE = 250;

const WAIVER_TRANSACTION_RETRIES = 3;

function isSerializationConflict(
  error
) {
  return error?.code === 'P2034';
}

async function processSingleWaiverClaim(
  leagueId,
  claim
) {
  return withFantasyRosterLock(
    leagueId,
    async () => {
      let attempts = 0;

      while (
        attempts <
        WAIVER_TRANSACTION_RETRIES
      ) {
        try {
          return await prisma.$transaction(
            async tx => {
              const currentClaim =
                await tx.fantasyWaiverClaim.findUnique({
                  where: {
                    id: claim.id
                  },
                  select: {
                    id: true,
                    leagueId: true,
                    teamId: true,
                    playerId: true,
                    bidAmount: true,
                    status: true
                  }
                });

              if (
                !currentClaim ||
                currentClaim.status !==
                  'PENDING'
              ) {
                return {
                  status: 'SKIPPED'
                };
              }

              const player =
                await tx.fantasyPlayer.findUnique({
                  where: {
                    id:
                      currentClaim.playerId
                  },
                  select: {
                    id: true,
                    name: true,
                    season: true,
                    isActive: true
                  }
                });

              const league =
                await tx.fantasyLeague.findUnique({
                  where: {
                    id: leagueId
                  },
                  select: {
                    season: true,
                    status: true
                  }
                });

              if (
                !player ||
                !league ||
                league.status !==
                  'SEASON' ||
                league.season !==
                  player.season ||
                !player.isActive
              ) {
                await tx.fantasyWaiverClaim.updateMany({
                  where: {
                    leagueId,
                    playerId:
                      currentClaim.playerId,
                    status: 'PENDING'
                  },
                  data: {
                    status: 'REJECTED'
                  }
                });

                return {
                  status:
                    'REJECTED_PLAYER'
                };
              }

              const existingRosterEntry =
                await tx.fantasyTeamPlayer.findFirst({
                  where: {
                    playerId:
                      currentClaim.playerId,
                    team: {
                      leagueId
                    }
                  },
                  select: {
                    id: true
                  }
                });

              if (
                existingRosterEntry
              ) {
                await tx.fantasyWaiverClaim.updateMany({
                  where: {
                    leagueId,
                    playerId:
                      currentClaim.playerId,
                    status: 'PENDING'
                  },
                  data: {
                    status: 'REJECTED'
                  }
                });

                return {
                  status:
                    'REJECTED_ROSTERED'
                };
              }

              const team =
                await tx.fantasyTeam.findUnique({
                  where: {
                    id:
                      currentClaim.teamId
                  },
                  select: {
                    id: true,
                    name: true,
                    faab: true,
                    _count: {
                      select: {
                        players: true
                      }
                    }
                  }
                });

              if (!team) {
                await tx.fantasyWaiverClaim.update({
                  where: {
                    id:
                      currentClaim.id
                  },
                  data: {
                    status: 'REJECTED'
                  }
                });

                return {
                  status:
                    'REJECTED_TEAM'
                };
              }

              if (
                team._count.players >=
                MAX_ROSTER_SIZE
              ) {
                await tx.fantasyWaiverClaim.update({
                  where: {
                    id:
                      currentClaim.id
                  },
                  data: {
                    status: 'REJECTED'
                  }
                });

                return {
                  status:
                    'REJECTED_ROSTER_FULL'
                };
              }

              if (
                currentClaim.bidAmount >
                team.faab
              ) {
                await tx.fantasyWaiverClaim.update({
                  where: {
                    id:
                      currentClaim.id
                  },
                  data: {
                    status: 'REJECTED'
                  }
                });

                return {
                  status:
                    'REJECTED_FAAB'
                };
              }

              await tx.fantasyTeamPlayer.create({
                data: {
                  teamId:
                    currentClaim.teamId,
                  playerId:
                    currentClaim.playerId,
                  status: 'BENCH'
                }
              });

              const faabUpdate =
                await tx.fantasyTeam.updateMany({
                  where: {
                    id:
                      currentClaim.teamId,
                    faab: {
                      gte:
                        currentClaim.bidAmount
                    }
                  },
                  data: {
                    faab: {
                      decrement:
                        currentClaim.bidAmount
                    }
                  }
                });

              if (
                faabUpdate.count !==
                1
              ) {
                throw new Error(
                  'FAAB changed while processing waiver claim.'
                );
              }

              await tx.fantasyTransaction.create({
                data: {
                  leagueId,
                  teamId:
                    currentClaim.teamId,
                  playerId:
                    currentClaim.playerId,
                  type: 'WAIVER_ADD'
                }
              });

              await tx.fantasyWaiverClaim.update({
                where: {
                  id:
                    currentClaim.id
                },
                data: {
                  status: 'APPROVED'
                }
              });

              await tx.fantasyWaiverClaim.updateMany({
                where: {
                  leagueId,
                  playerId:
                    currentClaim.playerId,
                  status: 'PENDING',
                  id: {
                    not:
                      currentClaim.id
                  }
                },
                data: {
                  status: 'REJECTED'
                }
              });

              return {
                status: 'APPROVED',
                playerId:
                  currentClaim.playerId,
                playerName:
                  player.name,
                teamId:
                  currentClaim.teamId,
                teamName:
                  team.name,
                bidAmount:
                  currentClaim.bidAmount
              };
            },
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 5000,
              timeout: 10000
            }
          );
        } catch (error) {
          if (
            isSerializationConflict(
              error
            )
          ) {
            attempts++;

            if (
              attempts >=
              WAIVER_TRANSACTION_RETRIES
            ) {
              throw error;
            }

            continue;
          }

          throw error;
        }
      }

      throw new Error(
        'Waiver transaction retry limit reached.'
      );
    }
  );
}

async function processLeagueWaivers(
  leagueId
) {
  const lock =
    await cache.acquireLock(
      `fantasy:waivers:${leagueId}`,
      WAIVER_LOCK_TTL_SECONDS
    );

  /*
   * Only one API/worker replica may process
   * waivers for a league at a time.
   */
  if (!lock) {
    const error =
      new Error(
        `Waiver processing already in progress for league ${leagueId}.`
      );

    error.code =
      'WAIVER_PROCESSING_IN_PROGRESS';

    throw error;
  }

  try {
    const league =
      await prisma.fantasyLeague.findUnique({
        where: {
          id: leagueId
        },
        select: {
          id: true,
          season: true,
          status: true
        }
      });

    if (!league) {
      throw new Error(
        `Fantasy league ${leagueId} not found.`
      );
    }

    if (
      league.status !==
      'SEASON'
    ) {
      return [];
    }

    /*
     * Select only fields needed by the waiver
     * processor.
     *
     * We intentionally do NOT include full
     * FantasyPlayer or FantasyTeam records.
     */
    const claims =
      await prisma.fantasyWaiverClaim.findMany({
        where: {
          leagueId,
          status: 'PENDING'
        },
        orderBy: [
          {
            playerId: 'asc'
          },
          {
            bidAmount: 'desc'
          },
          {
            createdAt: 'asc'
          },
          {
            id: 'asc'
          }
        ],
        select: {
          id: true,
          leagueId: true,
          teamId: true,
          playerId: true,
          bidAmount: true,
          createdAt: true
        }
      });

    if (claims.length === 0) {
      return [];
    }

    const processedPlayers =
      new Set();

    const results = [];

    for (
      const claim of claims
    ) {
      /*
       * Once a player has been awarded, or has
       * become unavailable, there is nothing left
       * to process for that player.
       */
      if (
        processedPlayers.has(
          claim.playerId
        )
      ) {
        continue;
      }

      const result =
        await processSingleWaiverClaim(
          leagueId,
          claim
        );

      if (
        result.status ===
        'APPROVED'
      ) {
        results.push({
          playerId:
            result.playerId,
          playerName:
            result.playerName,
          teamId:
            result.teamId,
          teamName:
            result.teamName,
          bidAmount:
            result.bidAmount,
          status:
            'APPROVED'
        });

        processedPlayers.add(
          claim.playerId
        );

        continue;
      }

      /*
       * These outcomes mean that nobody can
       * legitimately claim this player anymore.
       */
      if (
        result.status ===
          'REJECTED_PLAYER' ||
        result.status ===
          'REJECTED_ROSTERED'
      ) {
        processedPlayers.add(
          claim.playerId
        );
      }

      /*
       * REJECTED_FAAB and REJECTED_ROSTER_FULL
       * intentionally do NOT mark the player as
       * processed. The next lower bid gets a chance.
       */
    }

    return results;
  } finally {
    await cache.releaseLock(lock);
  }
}

async function processAllDueWaivers() {
  const BATCH_SIZE =
    WAIVER_LEAGUE_BATCH_SIZE;

  const results = [];

  let lastLeagueId = null;

  while (true) {
    const leagues =
      await prisma.fantasyLeague.findMany({
        where: {
          status: 'SEASON',
          waiverClaims: {
            some: {
              status: 'PENDING'
            }
          },
          ...(lastLeagueId !== null
            ? {
                id: {
                  gt:
                    lastLeagueId
                }
              }
            : {})
        },
        orderBy: {
          id: 'asc'
        },
        take: BATCH_SIZE,
        select: {
          id: true
        }
      });

    if (
      leagues.length === 0
    ) {
      break;
    }

    /*
     * Process leagues sequentially.
     *
     * This deliberately keeps database pressure
     * predictable. Each league is independently
     * protected by its Redis lock, so future worker
     * architecture can safely parallelize this at
     * the league level.
     */
    for (
      const league of leagues
    ) {
      try {
        const processed =
          await processLeagueWaivers(
            league.id
          );

        results.push({
          leagueId:
            league.id,
          processed
        });
      } catch (err) {
        if (
          err?.code ===
          'WAIVER_PROCESSING_IN_PROGRESS'
        ) {
          continue;
        }

        console.error(
          `Waiver processing failed for league ${league.id}:`,
          err.message
        );
      }
    }

    lastLeagueId =
      leagues[
        leagues.length - 1
      ].id;

    if (
      leagues.length <
      BATCH_SIZE
    ) {
      break;
    }
  }

  return results;
}

module.exports = {
  processLeagueWaivers,
  processAllDueWaivers
};
