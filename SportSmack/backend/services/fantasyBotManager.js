const prisma = require('../lib/prisma');

const {
  createTrade
} = require('./fantasyTrades');

const BOT_PREFIX = 'Bot_';

const BOT_COOLDOWN_MS =
  24 * 60 * 60 * 1000;

function isBotUser(user) {
  return Boolean(
    user?.username &&
    user.username.startsWith(BOT_PREFIX)
  );
}

async function getBotLeagues() {
  return prisma.fantasyLeague.findMany({
    where: {
      status: 'SEASON',
      teams: {
        some: {
          user: {
            username: {
              startsWith: BOT_PREFIX
            }
          }
        }
      }
    },
    include: {
      teams: {
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          },
          players: {
            include: {
              player: true
            }
          }
        }
      }
    }
  });
}

async function botCanAct(
  leagueId,
  botTeamId
) {
  const cutoff =
    new Date(
      Date.now() -
        BOT_COOLDOWN_MS
    );

  const recent =
    await prisma.fantasyTransaction.findFirst({
      where: {
        leagueId,
        teamId: botTeamId,
        createdAt: {
          gte: cutoff
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

  return !recent;
}

async function processBotWaiverCycle(
  league,
  botTeam
) {
  if (
    botTeam.players.length >= 15
  ) {
    return null;
  }

  /*
   * Find players who are currently free agents
   * in this league.
   */
  const rostered =
    await prisma.fantasyTeamPlayer.findMany({
      where: {
        team: {
          leagueId: league.id
        }
      },
      select: {
        playerId: true
      }
    });

  const rosteredIds =
    rostered.map(
      player => player.playerId
    );

  const candidates =
    await prisma.fantasyPlayer.findMany({
      where: {
        id: {
          notIn: rosteredIds
        }
      },
      orderBy: [
        {
          projectedPoints: 'desc'
        },
        {
          lastYearPoints: 'desc'
        },
        {
          id: 'asc'
        }
      ],
      take: 10
    });

  if (candidates.length === 0) {
    return null;
  }

  const player =
    candidates[0];

  /*
   * Use the existing waiver system rather than
   * directly inserting a roster entry.
   */
  const existingClaim =
    await prisma.fantasyWaiverClaim.findFirst({
      where: {
        leagueId: league.id,
        teamId: botTeam.id,
        playerId: player.id,
        status: 'PENDING'
      }
    });

  if (existingClaim) {
    return null;
  }

  const bid =
    Math.min(
      5,
      botTeam.faab
    );

  return prisma.fantasyWaiverClaim.create({
    data: {
      leagueId: league.id,
      teamId: botTeam.id,
      playerId: player.id,
      bidAmount: bid,
      status: 'PENDING'
    }
  });
}

async function processBotTradeCycle(
  league,
  botTeam
) {
  const humanTeam =
    league.teams.find(
      team =>
        !isBotUser(team.user)
    );

  if (!humanTeam) {
    return null;
  }

  if (
    botTeam.players.length === 0 ||
    humanTeam.players.length === 0
  ) {
    return null;
  }

  const existingTrade =
    await prisma.fantasyTrade.findFirst({
      where: {
        leagueId: league.id,
        status: 'PENDING',
        OR: [
          {
            proposerTeamId:
              botTeam.id,
            recipientTeamId:
              humanTeam.id
          },
          {
            proposerTeamId:
              humanTeam.id,
            recipientTeamId:
              botTeam.id
          }
        ]
      }
    });

  if (existingTrade) {
    return null;
  }

  /*
   * Offer the bot's strongest projected player.
   */
  const botPlayer =
    [...botTeam.players]
      .sort(
        (a, b) =>
          Number(
            b.player.projectedPoints || 0
          ) -
          Number(
            a.player.projectedPoints || 0
          )
      )[0];

  /*
   * Request the human's strongest projected player.
   */
  const humanPlayer =
    [...humanTeam.players]
      .sort(
        (a, b) =>
          Number(
            b.player.projectedPoints || 0
          ) -
          Number(
            a.player.projectedPoints || 0
          )
      )[0];

  if (
    !botPlayer ||
    !humanPlayer ||
    botPlayer.playerId ===
      humanPlayer.playerId
  ) {
    return null;
  }

  return createTrade({
    leagueId: league.id,
    proposerTeamId: botTeam.id,
    recipientTeamId: humanTeam.id,
    offeredPlayerIds: [
      botPlayer.playerId
    ],
    requestedPlayerIds: [
      humanPlayer.playerId
    ]
  });
}

async function processBotTransactions() {
  const leagues =
    await getBotLeagues();

  const results = [];

  for (const league of leagues) {
    for (const botTeam of league.teams) {
      if (
        !isBotUser(
          botTeam.user
        )
      ) {
        continue;
      }

      try {
        const allowed =
          await botCanAct(
            league.id,
            botTeam.id
          );

        if (!allowed) {
          continue;
        }

        const claim =
          await processBotWaiverCycle(
            league,
            botTeam
          );
        
        if (claim) {
          results.push({
            leagueId: league.id,
            teamId: botTeam.id,
            type: 'WAIVER_CLAIM',
            playerId: claim.playerId
          });
        
          continue;
        }
        
        const trade =
          await processBotTradeCycle(
            league,
            botTeam
          );
        
        if (trade) {
          results.push({
            leagueId: league.id,
            teamId: botTeam.id,
            type: 'TRADE_PROPOSAL',
            tradeId: trade.id
          });
        }
      } catch (error) {
        console.error(
          `Fantasy bot transaction failed for team ${botTeam.id}:`,
          error.message
        );
      }
    }
  }

  return results;
}

module.exports = {
  processBotTransactions
};
