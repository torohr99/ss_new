const prisma =
  require('../lib/prisma');

const {
  Prisma
} = require('@prisma/client');

const {
  withFantasyRosterLock
} = require('./fantasyLocks');

const MAX_ROSTER_SIZE = 15;
const TRADE_TRANSACTION_RETRIES = 3;

function isSerializationConflict(
  error
) {
  return error?.code === 'P2034';
}

function normalizePlayerIds(
  playerIds
) {
  if (!Array.isArray(playerIds)) {
    return [];
  }

  return playerIds.map(
    playerId => Number(playerId)
  );
}

/**
 * Create a pending trade.
 *
 * The league roster lock protects the ownership
 * checks against simultaneous adds/drops/waiver
 * awards/trade acceptance.
 */
async function createTrade({
  leagueId,
  proposerTeamId,
  recipientTeamId,
  offeredPlayerIds,
  requestedPlayerIds
}) {
  leagueId =
    Number(leagueId);

  proposerTeamId =
    Number(proposerTeamId);

  recipientTeamId =
    Number(recipientTeamId);

  const offered =
    normalizePlayerIds(
      offeredPlayerIds
    );

  const requested =
    normalizePlayerIds(
      requestedPlayerIds
    );

  if (
    proposerTeamId ===
    recipientTeamId
  ) {
    throw new Error(
      'You cannot trade with yourself.'
    );
  }

  if (
    offered.length === 0 &&
    requested.length === 0
  ) {
    throw new Error(
      'A trade must contain at least one player.'
    );
  }

  if (
    offered.length > MAX_ROSTER_SIZE ||
    requested.length > MAX_ROSTER_SIZE
  ) {
    throw new Error(
      'Trade contains too many players.'
    );
  }

  if (
    offered.some(
      playerId =>
        !Number.isInteger(playerId)
    ) ||
    requested.some(
      playerId =>
        !Number.isInteger(playerId)
    )
  ) {
    throw new Error(
      'Invalid trade players.'
    );
  }

  if (
    new Set(offered).size !==
    offered.length
  ) {
    throw new Error(
      'A player cannot be offered more than once.'
    );
  }

  if (
    new Set(requested).size !==
    requested.length
  ) {
    throw new Error(
      'A player cannot be requested more than once.'
    );
  }

  const overlap =
    offered.some(
      playerId =>
        requested.includes(playerId)
    );

  if (overlap) {
    throw new Error(
      'A player cannot appear on both sides of a trade.'
    );
  }

  return withFantasyRosterLock(
    leagueId,
    async () => {
      const league =
        await prisma.fantasyLeague.findUnique({
          where: {
            id: leagueId
          },
          select: {
            id: true,
            status: true
          }
        });

      if (!league) {
        throw new Error(
          'League not found.'
        );
      }

      if (
        league.status !==
        'SEASON'
      ) {
        throw new Error(
          'Trades are only available during the season.'
        );
      }

      const [
        proposerTeam,
        recipientTeam
      ] = await Promise.all([
        prisma.fantasyTeam.findUnique({
          where: {
            id: proposerTeamId
          },
          select: {
            id: true,
            leagueId: true
          }
        }),

        prisma.fantasyTeam.findUnique({
          where: {
            id: recipientTeamId
          },
          select: {
            id: true,
            leagueId: true
          }
        })
      ]);

      if (
        !proposerTeam ||
        !recipientTeam
      ) {
        throw new Error(
          'Fantasy team not found.'
        );
      }

      if (
        proposerTeam.leagueId !==
          leagueId ||
        recipientTeam.leagueId !==
          leagueId
      ) {
        throw new Error(
          'Both teams must belong to this league.'
        );
      }

      /*
       * Check ownership in bulk rather than performing
       * one database query per player.
       */
      const [
        offeredOwnership,
        requestedOwnership
      ] = await Promise.all([
        offered.length > 0
          ? prisma.fantasyTeamPlayer.findMany({
              where: {
                teamId:
                  proposerTeamId,
                playerId: {
                  in: offered
                }
              },
              select: {
                playerId: true
              }
            })
          : [],

        requested.length > 0
          ? prisma.fantasyTeamPlayer.findMany({
              where: {
                teamId:
                  recipientTeamId,
                playerId: {
                  in: requested
                }
              },
              select: {
                playerId: true
              }
            })
          : []
      ]);

      const offeredOwned =
        new Set(
          offeredOwnership.map(
            row => row.playerId
          )
        );

      for (
        const playerId of offered
      ) {
        if (
          !offeredOwned.has(
            playerId
          )
        ) {
          throw new Error(
            `Player ${playerId} is not on your roster.`
          );
        }
      }

      const requestedOwned =
        new Set(
          requestedOwnership.map(
            row => row.playerId
          )
        );

      for (
        const playerId of requested
      ) {
        if (
          !requestedOwned.has(
            playerId
          )
        ) {
          throw new Error(
            `Player ${playerId} is not on the other team's roster.`
          );
        }
      }

      return prisma.$transaction(
        async tx => {
          const createdTrade =
            await tx.fantasyTrade.create({
              data: {
                leagueId,
                proposerTeamId,
                recipientTeamId,
                status: 'PENDING'
              }
            });

          const items = [
            ...offered.map(
              playerId => ({
                tradeId:
                  createdTrade.id,
                playerId,
                fromTeamId:
                  proposerTeamId,
                toTeamId:
                  recipientTeamId
              })
            ),
            ...requested.map(
              playerId => ({
                tradeId:
                  createdTrade.id,
                playerId,
                fromTeamId:
                  recipientTeamId,
                toTeamId:
                  proposerTeamId
              })
            )
          ];

          if (items.length > 0) {
            await tx.fantasyTradeItem.createMany({
              data: items
            });
          }

          return createdTrade;
        }
      );
    }
  );
}

/**
 * Accept and execute a trade atomically.
 *
 * The shared roster lock prevents the trade from
 * racing against waivers, adds, drops, or another
 * trade in the same league.
 */
async function acceptTrade(
  tradeId,
  userId
) {
  tradeId =
    Number(tradeId);

  userId =
    Number(userId);

  let attempts = 0;

  return withFantasyRosterLock(
    await getTradeLeagueId(
      tradeId
    ),
    async () => {
      while (
        attempts <
        TRADE_TRANSACTION_RETRIES
      ) {
        try {
          return await prisma.$transaction(
            async tx => {
              const trade =
                await tx.fantasyTrade.findUnique({
                  where: {
                    id: tradeId
                  },
                  include: {
                    league: true,
                    proposerTeam: true,
                    recipientTeam: true,
                    items: true
                  }
                });

              if (!trade) {
                throw new Error(
                  'Trade not found.'
                );
              }

              if (
                trade.status !==
                'PENDING'
              ) {
                throw new Error(
                  'This trade is no longer pending.'
                );
              }

              if (
                trade.league.status !==
                'SEASON'
              ) {
                throw new Error(
                  'Trades are only available during the season.'
                );
              }

              if (
                trade.recipientTeam.userId !==
                userId
              ) {
                throw new Error(
                  'Only the receiving team can accept this trade.'
                );
              }

              if (
                trade.items.length ===
                0
              ) {
                throw new Error(
                  'Trade contains no players.'
                );
              }

              /*
               * Ensure every trade item belongs to
               * one of the two teams involved in the
               * trade and points in the correct direction.
               */
              for (
                const item of trade.items
              ) {
                const validDirection =
                  (
                    item.fromTeamId ===
                      trade.proposerTeamId &&
                    item.toTeamId ===
                      trade.recipientTeamId
                  ) ||
                  (
                    item.fromTeamId ===
                      trade.recipientTeamId &&
                    item.toTeamId ===
                      trade.proposerTeamId
                  );

                if (
                  !validDirection
                ) {
                  throw new Error(
                    'Trade contains invalid team ownership data.'
                  );
                }
              }

              /*
               * Verify every player is STILL owned by
               * the expected team.
               */
              const ownership =
                await tx.fantasyTeamPlayer.findMany({
                  where: {
                    OR: trade.items.map(
                      item => ({
                        playerId:
                          item.playerId,
                        teamId:
                          item.fromTeamId
                      })
                    )
                  },
                  select: {
                    playerId: true,
                    teamId: true
                  }
                });

              const ownershipKeys =
                new Set(
                  ownership.map(
                    row =>
                      `${row.playerId}:${row.teamId}`
                  )
                );

              for (
                const item of trade.items
              ) {
                if (
                  !ownershipKeys.has(
                    `${item.playerId}:${item.fromTeamId}`
                  )
                ) {
                  throw new Error(
                    'One or more players are no longer available for this trade.'
                  );
                }
              }

              /*
               * Verify neither team would exceed the
               * maximum roster size after the exchange.
               */
              const [
                proposerCount,
                recipientCount
              ] = await Promise.all([
                tx.fantasyTeamPlayer.count({
                  where: {
                    teamId:
                      trade.proposerTeamId
                  }
                }),

                tx.fantasyTeamPlayer.count({
                  where: {
                    teamId:
                      trade.recipientTeamId
                  }
                })
              ]);

              let proposerIncoming = 0;
              let proposerOutgoing = 0;
              let recipientIncoming = 0;
              let recipientOutgoing = 0;

              for (
                const item of trade.items
              ) {
                if (
                  item.fromTeamId ===
                  trade.proposerTeamId
                ) {
                  proposerOutgoing++;
                  recipientIncoming++;
                } else {
                  recipientOutgoing++;
                  proposerIncoming++;
                }
              }

              if (
                proposerCount -
                  proposerOutgoing +
                  proposerIncoming >
                MAX_ROSTER_SIZE
              ) {
                throw new Error(
                  'The proposing team would exceed the maximum roster size.'
                );
              }

              if (
                recipientCount -
                  recipientOutgoing +
                  recipientIncoming >
                MAX_ROSTER_SIZE
              ) {
                throw new Error(
                  'The receiving team would exceed the maximum roster size.'
                );
              }

              /*
               * Move every player.
               *
               * updateMany is intentionally checked so a
               * failed ownership update cannot silently
               * produce a partial trade.
               */
              const transactions = [];

              for (
                const item of trade.items
              ) {
                const moved =
                  await tx.fantasyTeamPlayer.updateMany({
                    where: {
                      playerId:
                        item.playerId,
                      teamId:
                        item.fromTeamId
                    },
                    data: {
                      teamId:
                        item.toTeamId
                    }
                  });

                if (
                  moved.count !==
                  1
                ) {
                  throw new Error(
                    'A player could not be transferred because roster ownership changed.'
                  );
                }

                transactions.push({
                  leagueId:
                    trade.leagueId,
                  teamId:
                    item.toTeamId,
                  relatedTeamId:
                    item.fromTeamId,
                  playerId:
                    item.playerId,
                  type: 'TRADE'
                });
              }

              await tx.fantasyTransaction.createMany({
                data:
                  transactions
              });

              /*
               * Mark the trade accepted only after every
               * roster movement and transaction succeeds.
               */
              const updatedTrade =
                await tx.fantasyTrade.update({
                  where: {
                    id: trade.id
                  },
                  data: {
                    status:
                      'ACCEPTED',
                    respondedAt:
                      new Date()
                  },
                  include: {
                    items: {
                      include: {
                        player: true
                      }
                    },
                    proposerTeam: true,
                    recipientTeam: true
                  }
                });

              return updatedTrade;
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
              TRADE_TRANSACTION_RETRIES
            ) {
              throw error;
            }

            continue;
          }

          throw error;
        }
      }

      throw new Error(
        'Trade transaction retry limit reached.'
      );
    }
  );
}

/**
 * Reject a pending trade.
 */
async function rejectTrade(
  tradeId,
  userId
) {
  tradeId =
    Number(tradeId);

  userId =
    Number(userId);

  const leagueId =
    await getTradeLeagueId(
      tradeId
    );

  return withFantasyRosterLock(
    leagueId,
    async () => {
      const trade =
        await prisma.fantasyTrade.findUnique({
          where: {
            id: tradeId
          },
          include: {
            recipientTeam: true
          }
        });

      if (!trade) {
        throw new Error(
          'Trade not found.'
        );
      }

      if (
        trade.status !==
        'PENDING'
      ) {
        throw new Error(
          'Trade is no longer pending.'
        );
      }

      if (
        trade.recipientTeam.userId !==
        userId
      ) {
        throw new Error(
          'Only the receiving team can reject this trade.'
        );
      }

      const updated =
        await prisma.fantasyTrade.updateMany({
          where: {
            id: trade.id,
            status: 'PENDING'
          },
          data: {
            status: 'REJECTED',
            respondedAt:
              new Date()
          }
        });

      if (
        updated.count !==
        1
      ) {
        throw new Error(
          'Trade is no longer pending.'
        );
      }

      return prisma.fantasyTrade.findUnique({
        where: {
          id: trade.id
        }
      });
    }
  );
}

/**
 * Cancel a trade created by the current user.
 */
async function cancelTrade(
  tradeId,
  userId
) {
  tradeId =
    Number(tradeId);

  userId =
    Number(userId);

  const leagueId =
    await getTradeLeagueId(
      tradeId
    );

  return withFantasyRosterLock(
    leagueId,
    async () => {
      const trade =
        await prisma.fantasyTrade.findUnique({
          where: {
            id: tradeId
          },
          include: {
            proposerTeam: true
          }
        });

      if (!trade) {
        throw new Error(
          'Trade not found.'
        );
      }

      if (
        trade.status !==
        'PENDING'
      ) {
        throw new Error(
          'Trade is no longer pending.'
        );
      }

      if (
        trade.proposerTeam.userId !==
        userId
      ) {
        throw new Error(
          'Only the team that proposed the trade can cancel it.'
        );
      }

      const updated =
        await prisma.fantasyTrade.updateMany({
          where: {
            id: trade.id,
            status: 'PENDING'
          },
          data: {
            status: 'CANCELLED',
            respondedAt:
              new Date()
          }
        });

      if (
        updated.count !==
        1
      ) {
        throw new Error(
          'Trade is no longer pending.'
        );
      }

      return prisma.fantasyTrade.findUnique({
        where: {
          id: trade.id
        }
      });
    }
  );
}

async function getTradeLeagueId(
  tradeId
) {
  const trade =
    await prisma.fantasyTrade.findUnique({
      where: {
        id: Number(tradeId)
      },
      select: {
        leagueId: true
      }
    });

  if (!trade) {
    throw new Error(
      'Trade not found.'
    );
  }

  return trade.leagueId;
}

module.exports = {
  createTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade
};
