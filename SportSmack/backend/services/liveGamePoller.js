'use strict';

const sportsApi =
  require('./sportsApi');

const gamePolls =
  require('./gamePolls');

const gameStateCache =
  new Map();

let io = null;
let prisma = null;

function initialize(
  socketIO,
  prismaClient
) {
  io = socketIO;
  prisma = prismaClient;

  setInterval(
    pollActiveGames,
    60 * 1000
  );

  console.log(
    'Live game poller started'
  );
}

async function pollActiveGames() {
  if (!io || !prisma) return;

  try {
    const activeGames =
      await prisma.gameMessage.findMany({
        where: {
          createdAt: {
            gte:
              new Date(
                Date.now() -
                6 * 60 * 60 * 1000
              )
          }
        },
        select: {
          gameId: true,
          league: true
        },
        distinct: [
          'gameId',
          'league'
        ]
      });

    for (const game of activeGames) {
      await updateGamePoll(
        game.league,
        game.gameId
      );
    }

  } catch (error) {
    console.error(
      'Live game poller error:',
      error.message
    );
  }
}

async function updateGamePoll(
  league,
  gameId
) {
  try {
    const mapping =
      sportsApi.LEAGUE_MAP?.[
        String(league).toLowerCase()
      ];

    if (!mapping) return;

    const summary =
      await sportsApi.getGameSummary(
        mapping.sport,
        league,
        gameId
      );

    if (!summary) return;

    const gameState =
      sportsApi.buildSportSpecificState(
        summary,
        league
      );

    if (!gameState) return;

    const stateKey =
      JSON.stringify({
        status: gameState.status,
        teams: gameState.teams,
        situation:
          gameState.sportSituation,
        lastPlay:
          gameState.plays?.[
            gameState.plays.length - 1
          ] || null
      });

    const cacheKey =
      `${league}:${gameId}`;

    const previous =
      gameStateCache.get(cacheKey);

    if (previous === stateKey) {
      return;
    }

    gameStateCache.set(
      cacheKey,
      stateKey
    );

    // Don't generate live polls for games
    // that haven't started.
    if (
      gameState.status?.state !== 'in'
    ) {
      return;
    }

    const poll =
      await gamePolls.generateGamePoll(
        summary,
        league,
        gameId
      );

    const pollData = {
      isPoll: true,
      question: poll.question,
      options: poll.options,
      reason: poll.reason || '',
      votes: {},
      votedUsers: [],
      createdAt: Date.now(),
      expiresAt:
        Date.now() +
        10 * 60 * 1000
    };

    poll.options.forEach(option => {
      pollData.votes[option] = 0;
    });

    // Find a system user.
    const systemUser =
      await prisma.user.findFirst({
        where: {
          username: 'SportSmack'
        }
      });

    if (!systemUser) return;

    const pollMsg =
      await prisma.gameMessage.create({
        data: {
          gameId: String(gameId),
          league,
          type: 'poll',
          content:
            `[POLL_JSON]${JSON.stringify(
              pollData
            )}`,
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

    io
      .to(`game_${league}_${gameId}`)
      .emit(
        'new_message',
        pollMsg
      );

  } catch (error) {
    console.error(
      `Live poll update failed for ${league}/${gameId}:`,
      error.message
    );
  }
}

module.exports = {
  initialize,
  updateGamePoll
};
