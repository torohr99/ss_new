const sportsApi = require('./sportsApi');
const gamePolls = require('./gamePolls');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class LiveGameEngine {
  constructor() {
    this.io = null;
    this.intervalId = null;

    // Stores the most recent meaningful game state
    // for each live game.
    this.activeGames = new Map();

    // Prevent excessive AI poll generation.
    this.lastPollTimes = new Map();

    // Only generate a new poll at most once every 5 minutes.
    this.POLL_COOLDOWN_MS = 5 * 60 * 1000;
  }

  init(io) {
    this.io = io;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.start();
  }

  start() {
    // Check live games every 30 seconds.
    this.intervalId = setInterval(
      () => this.processLiveGames(),
      30000
    );

    console.log(
      'LiveGameEngine started.'
    );

    // Run once immediately instead of
    // waiting 30 seconds after startup.
    this.processLiveGames().catch(error => {
      console.error(
        'Initial live-game processing error:',
        error.message
      );
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processLiveGames() {
    const leaguesToCheck = [
      'mlb',
      'nba',
      'nfl',
      'nhl',
      'ncaab',
      'ncaaf'
    ];

    for (const league of leaguesToCheck) {
      try {
        const scoreboard =
          await sportsApi.getScoreboard(
            league
          );

        if (!Array.isArray(scoreboard)) {
          continue;
        }

        const liveGames =
          scoreboard.filter(game => {
            const status =
              String(game.status || '')
                .toLowerCase();

            return (
              status === 'in' ||
              status.includes('half') ||
              status.includes('quarter') ||
              status.includes('q1') ||
              status.includes('q2') ||
              status.includes('q3') ||
              status.includes('q4') ||
              status.includes('period') ||
              status.includes('live')
            );
          });

        for (const game of liveGames) {
          await this.processGame(
            league,
            game.id
          );
        }

      } catch (error) {
        console.error(
          `Error processing ${league}:`,
          error.message
        );
      }
    }
  }

  async processGame(
    league,
    gameId
  ) {
    try {
      const mapping =
        sportsApi.LEAGUE_MAP[
          String(league).toLowerCase()
        ];

      if (!mapping) {
        return;
      }

      /*
       * IMPORTANT:
       * Use getGameSummary() rather than making
       * a separate ESPN request here.
       *
       * This also allows sportsApi.js to handle
       * its existing caching.
       */
      const summary =
        await sportsApi.getGameSummary(
          mapping.sport,
          league,
          gameId
        );

      if (!summary) {
        return;
      }

      /*
       * Build the centralized sport-specific state.
       *
       * This is now the same representation used
       * by the AI analysis and poll generator.
       */
      const gameState =
        sportsApi.buildSportSpecificState(
          summary,
          league
        );

      if (!gameState) {
        return;
      }

      /*
       * Don't generate polls unless ESPN says
       * the game is actually live.
       */
      const gameStatus =
        gameState.status?.state ||
        gameState.status ||
        '';

      if (
        String(gameStatus).toLowerCase() !== 'in'
      ) {
        return;
      }

      const trackingKey =
        `${league}-${gameId}`;

      /*
       * Build a compact fingerprint of the
       * information that should trigger a new poll.
       *
       * We intentionally include:
       * - score
       * - game status
       * - sport-specific situation
       * - latest play
       *
       * This makes polls respond to actual
       * developments rather than random timing.
       */
      const latestPlay =
        gameState.plays?.[
          gameState.plays.length - 1
        ] || null;

      const stateFingerprint =
        JSON.stringify({
          status: gameState.status,
          teams: gameState.teams,
          situation:
            gameState.sportSituation,
          latestPlay
        });

      const previousState =
        this.activeGames.get(
          trackingKey
        );

      /*
       * If absolutely nothing relevant changed,
       * don't ask the AI to generate another poll.
       */
      if (
        previousState ===
        stateFingerprint
      ) {
        return;
      }

      this.activeGames.set(
        trackingKey,
        stateFingerprint
      );

      /*
       * Cooldown prevents a game with many rapid
       * plays from generating an AI poll every
       * 30 seconds.
       */
      const lastPoll =
        this.lastPollTimes.get(
          trackingKey
        ) || 0;

      if (
        Date.now() - lastPoll <
        this.POLL_COOLDOWN_MS
      ) {
        return;
      }

      /*
       * Ask the centralized poll generator to
       * create a matchup/situation-specific poll.
       */
      const poll =
        await gamePolls.generateGamePoll(
          summary,
          league,
          gameId
        );

      if (
        !poll ||
        !poll.question ||
        !Array.isArray(poll.options) ||
        poll.options.length < 2
      ) {
        console.log(
          `No valid AI poll generated for ${league}/${gameId}`
        );

        return;
      }

      await this.emitPoll(
        league,
        gameId,
        poll
      );

      this.lastPollTimes.set(
        trackingKey,
        Date.now()
      );

    } catch (error) {
      /*
       * Don't allow one bad game/API response
       * to stop the entire live-game engine.
       */
      console.error(
        `Error processing live game ${league}/${gameId}:`,
        error.message
      );
    }
  }

  async emitPoll(
    league,
    gameId,
    pollData
  ) {
    if (!this.io) {
      return;
    }

    const roomId =
      `game_${league}_${gameId}`;

    try {
      /*
       * Use the same poll JSON format expected
       * by chatHandler/frontend.
       */
      const pollPayload = {
        isPoll: true,
        question: pollData.question,
        options: pollData.options,
        reason:
          pollData.reason || '',
        votes: {},
        votedUsers: [],
        createdAt: Date.now(),
        expiresAt:
          Date.now() +
          10 * 60 * 1000
      };

      pollData.options.forEach(
        option => {
          pollPayload.votes[option] = 0;
        }
      );

      /*
       * Find the SportSmack system user rather
       * than assuming user ID = 1.
       */
      const systemUser =
        await prisma.user.findFirst({
          where: {
            username: 'SportSmack'
          }
        });

      if (!systemUser) {
        console.error(
          'SportSmack system user not found.'
        );
        return;
      }

      /*
       * Save the poll so users who enter the
       * chatroom later can still receive it.
       */
      const newPoll =
        await prisma.gameMessage.create({
          data: {
            gameId: String(gameId),
            league: String(league),
            userId: systemUser.id,
            type: 'poll',

            /*
             * This is the format used by your
             * chatroom poll parser.
             */
            content:
              `[POLL_JSON]${JSON.stringify(
                pollPayload
              )}`
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

      /*
       * Immediately send the poll to everyone
       * currently inside this game's room.
       */
      this.io
        .to(roomId)
        .emit(
          'new_message',
          newPoll
        );

      console.log(
        `Live AI poll created for ${league}/${gameId}: ${pollData.question}`
      );

    } catch (error) {
      console.error(
        'Error emitting dynamic poll:',
        error.message
      );
    }
  }
}

module.exports =
  new LiveGameEngine();
