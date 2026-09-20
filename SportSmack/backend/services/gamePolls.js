'use strict';

const axios = require('axios');
const crypto = require('crypto');

const redis = require('../lib/redis');
const cache = require('./cache');

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const pollCache = new Map();

const POLL_CACHE_TTL =
  5 * 60 * 1000;

const sportsApi = require('./sportsApi');

const POLL_AI_GLOBAL_COOLDOWN_SECONDS = 10;

const POLL_AI_THROTTLE_KEY =
  'ss:ai:poll:global-throttle';

const POLL_REDIS_CACHE_TTL_SECONDS = 300;

async function acquirePollAiSlot() {
  try {
    const result =
      await redis.set(
        POLL_AI_THROTTLE_KEY,
        String(Date.now()),
        'EX',
        POLL_AI_GLOBAL_COOLDOWN_SECONDS,
        'NX'
      );

    return result === 'OK';
  } catch (error) {
    /*
     * Redis is part of the production coordination
     * layer, but a Redis failure should not crash
     * the entire poll system.
     *
     * Fail open here so poll generation can continue.
     */
    console.error(
      'Poll AI throttle Redis error:',
      error.message
    );

    return true;
  }
}

function buildPollCacheKey(
  gameState,
  league,
  gameId
) {
  const latestPlay =
    gameState?.plays?.[
      gameState.plays.length - 1
    ] || null;

  const state = {
    league:
      String(league).toLowerCase(),

    gameId:
      String(gameId),

    status:
      gameState?.status || null,

    teams:
      gameState?.teams || null,

    situation:
      gameState?.sportSituation || null,

    latestPlay
  };

  const hash =
    crypto
      .createHash('sha256')
      .update(
        JSON.stringify(state)
      )
      .digest('hex');

  return `poll:${String(league).toLowerCase()}:${gameId}:${hash}`;
}

function getTeamName(competitor) {
  return (
    competitor?.team?.displayName ||
    competitor?.team?.name ||
    'Unknown Team'
  );
}

function buildPrompt(gameState, previousQuestions = []) {
  const previousText = previousQuestions.length
    ? `
PREVIOUS POLLS ALREADY USED FOR THIS GAME:
${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

DO NOT repeat or closely rephrase any of these questions.
`
    : '';

  return `
You generate interactive polls for SportSmack.

Create ONE highly specific poll for THIS EXACT GAME.

GAME STATE:
${JSON.stringify(gameState, null, 2)}

${previousText}

ABSOLUTE REQUIREMENTS:

1. The poll MUST refer to information from this exact game.
2. Use the actual teams, players, score, period/inning/quarter,
   game clock, recent play, leaders, and situation when available.
3. The question must be something fans could realistically debate
   RIGHT NOW.
4. Do NOT create generic polls such as:
   - "Who will win?"
   - "Who is the better team?"
   - "Who will score next?"
   unless the supplied game state makes that question uniquely
   relevant and there is no more specific alternative.
5. Prefer a question about a specific player, play, matchup,
   decision, possession, drive, inning, quarter, period,
   score situation, or strategic decision.
6. If the game has not started, create a matchup-specific
   pregame question using the actual teams, players, records,
   leaders, injuries, odds, or other supplied information.
7. If the game is live, prioritize the CURRENT situation.
8. If the game is finished, create a postgame question based
   on the actual result and supplied player/game information.
9. NEVER invent a player, statistic, injury, play, score,
   situation, or event.
10. NEVER use information not contained in GAME STATE.
11. When GAME STATE contains a player as an object, use the
    player's actual name/displayName/fullName rather than
    rendering the object itself.
12. Never output "[object Object]" or any JSON/object
    representation as part of the poll question or options.
13. Before returning the JSON, verify that every player/team
    reference in the question is human-readable text.
14. Make the poll different from previous polls.

SPORT-SPECIFIC GUIDANCE:

MLB:
- pitcher/batter matchups
- next at-bat
- runners/base situation
- bullpen decisions
- pitch count
- inning strategy
- strikeouts/hits/runs
- stolen-base situations

NFL:
- current drive
- fourth-down decision
- red-zone situation
- QB decision
- play calling
- defensive matchup
- touchdown/field-goal decision
- specific player performance
- time/score situation

NBA:
- current possession
- player matchup
- shot selection
- foul trouble
- defensive assignment
- scoring run
- timeout
- late-game situation

NHL:
- power play
- goalie decision
- shots/chances
- defensive matchup
- empty-net situation
- scoring chance

NCAAF:
- drive
- fourth down
- quarterback decision
- matchup
- scoring situation
- clock management

NCAAB:
- possession
- shooting
- foul trouble
- defensive matchup
- scoring run
- late-game situation

Return ONLY valid JSON:

{
  "question": "specific game-dependent question",
  "options": ["Option 1", "Option 2"],
  "reason": "specific reason this poll is relevant to this game"
}
`.trim();
}

function buildFallbackPoll(gameState, league) {
  const home =
    gameState?.teams?.home?.name ||
    'the home team';

  const away =
    gameState?.teams?.away?.name ||
    'the away team';

  const situation =
    gameState?.sportSituation || {};

  const latestPlay =
    gameState?.plays?.[
      gameState.plays.length - 1
    ];

  const leagueKey =
    String(league || '').toLowerCase();

  if (
    leagueKey === 'nfl' ||
    leagueKey === 'ncaaf'
  ) {
    const possession =
      situation.possessionText ||
      situation.possession ||
      home;

    if (
      situation.down != null &&
      situation.distance != null
    ) {
      return {
        question:
          `Will ${possession} convert this ${situation.down}th-and-${situation.distance} situation?`,
        options: [
          'Yes',
          'No'
        ],
        reason:
          `Live poll based on the current down-and-distance situation between ${home} and ${away}.`
      };
    }

    return {
      question:
        `Will ${possession} score on this drive?`,
      options: [
        'Yes',
        'No'
      ],
      reason:
        `Live poll based on the current possession in ${home} vs. ${away}.`
    };
  }

    if (
      leagueKey === 'mlb' ||
      leagueKey === 'baseball'
    ) {
      const batterValue =
        situation.batter;
  
      const batter =
        typeof batterValue === 'string'
          ? batterValue
          : batterValue?.displayName ||
            batterValue?.fullName ||
            batterValue?.name ||
            batterValue?.athlete?.displayName ||
            batterValue?.athlete?.fullName ||
            'the current batter';
  
      const pitcherValue =
        situation.pitcher;
  
      const pitcher =
        typeof pitcherValue === 'string'
          ? pitcherValue
          : pitcherValue?.displayName ||
            pitcherValue?.fullName ||
            pitcherValue?.name ||
            pitcherValue?.athlete?.displayName ||
            pitcherValue?.athlete?.fullName ||
            'the current pitcher';
  
      const runners =
        situation.runners ||
        situation.baserunners ||
        [];
  
      const runnerCount =
        Array.isArray(runners)
          ? runners.length
          : Number(situation.runnerCount || 0);
  
      const bases =
        situation.bases ||
        situation.baseState ||
        '';
  
      const pitchCount =
        situation.pitchCount ||
        situation.pitches ||
        null;
  
      const inning =
        gameState?.status?.period ||
        gameState?.status?.inning ||
        '';
  
      const score =
        `${home} ${gameState?.teams?.home?.score ?? 0} - ` +
        `${away} ${gameState?.teams?.away?.score ?? 0}`;
  
      const fallbackQuestions = [];
  
      fallbackQuestions.push({
        question:
          `Will ${batter} reach base in this at-bat?`,
        options: [
          'Yes',
          'No'
        ],
        reason:
          `Current MLB at-bat: ${batter} against ${pitcher}.`
      });
  
      if (pitcher !== 'the current pitcher') {
        fallbackQuestions.push({
          question:
            `Will ${pitcher} win this matchup against ${batter}?`,
          options: [
            'Yes',
            'No'
          ],
          reason:
            `Current pitcher-batter matchup in ${home} vs. ${away}.`
        });
      }
  
      if (runnerCount > 0) {
        fallbackQuestions.push({
          question:
            `Will the current at-bat move a runner into scoring position?`,
          options: [
            'Yes',
            'No'
          ],
          reason:
            `There are currently ${runnerCount} runner(s) on base.`
        });
      }
  
      if (bases) {
        fallbackQuestions.push({
          question:
            `Will the current baserunner situation produce a run before the inning ends?`,
          options: [
            'Yes',
            'No'
          ],
          reason:
            `Current base situation: ${bases}.`
        });
      }
  
      if (pitchCount) {
        fallbackQuestions.push({
          question:
            `Will ${batter} put the ball in play before the next two pitches?`,
          options: [
            'Yes',
            'No'
          ],
          reason:
            `Current pitch count is ${pitchCount}.`
        });
      }
  
      fallbackQuestions.push({
        question:
          `Which side will have the edge in the next meaningful MLB event?`,
        options: [
          home,
          away
        ],
        reason:
          `Current score: ${score}.`
      });
  
      /*
       * Use the current game state to deterministically
       * vary the fallback instead of always returning
       * the same question.
       */
      const index =
        Math.abs(
          Number(
            String(gameId)
              .split('')
              .reduce(
                (sum, char) =>
                  sum + char.charCodeAt(0),
                0
              )
          ) +
          Number(
            gameState?.plays?.length || 0
          )
        ) %
        fallbackQuestions.length;
  
      return fallbackQuestions[index];
    }

  if (
    leagueKey === 'nba' ||
    leagueKey === 'ncaab'
  ) {
    const possession =
      situation.possessionText ||
      situation.possession ||
      home;

    return {
      question:
        `Will ${possession} score on this possession?`,
      options: [
        'Yes',
        'No'
      ],
      reason:
        `Live poll based on the current possession in ${home} vs. ${away}.`
    };
  }

  if (leagueKey === 'nhl') {
    const possession =
      situation.possession ||
      home;

    return {
      question:
        `Will ${possession} score before the next stoppage?`,
      options: [
        'Yes',
        'No'
      ],
      reason:
        `Live poll based on the current NHL game situation.`
    };
  }

  if (latestPlay?.text) {
    return {
      question:
        `Will the next major development favor ${home} or ${away}?`,
      options: [
        home,
        away
      ],
      reason:
        `Poll generated from the latest play in the game.`
    };
  }

  return {
    question:
      `Who will have the next major advantage in this game?`,
    options: [
      home,
      away
    ],
    reason:
      `Fallback game-specific poll.`
  };
}

async function generateGamePoll(
  summary,
  league,
  gameId,
  previousQuestions = []
) {
  const gameState = sportsApi.buildSportSpecificState(
    summary,
    league,
    gameId
  );

  if (!gameState) {
    throw new Error('Game state unavailable');
  }

  /*
   * Include the actual game situation in the cache key.
   * This prevents a new situation from incorrectly returning
   * an older poll.
   */
  const latestPlay =
    gameState.plays?.[
      gameState.plays.length - 1
    ] || null;

  const cacheKey = [
    String(league).toLowerCase(),
    String(gameId),
    gameState.status?.state || '',
    gameState.status?.period || '',
    gameState.status?.clock || '',
    gameState.teams?.home?.score ?? '',
    gameState.teams?.away?.score ?? '',
    JSON.stringify(gameState.situation || {}),
    JSON.stringify(gameState.sportSituation || {}),
    JSON.stringify(latestPlay || {})
  ].join(':');

    /*
   * Use Redis as the shared cache so all Railway
   * replicas see the same generated poll.
   */
  const redisCacheKey =
    buildPollCacheKey(
      gameState,
      league,
      gameId
    );

  const cached =
    await cache.getJson(
      redisCacheKey
    );

  if (cached) {
    return cached;
  }

  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackPoll(
      gameState,
      league
    );
  }

  /*
   * Only allow a small, globally coordinated
   * number of Gemini poll requests.
   *
   * This protects the Gemini project-level
   * rate limit across all Railway replicas.
   */
  const aiSlot =
    await acquirePollAiSlot();

  if (!aiSlot) {
    console.log(
      `Poll AI throttle active; skipping Gemini poll for ${league}/${gameId}`
    );

    return null;
  }

  try {
    const response =
      await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: buildPrompt(
                    gameState,
                    previousQuestions
                  )
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 300,
            responseMimeType: 'application/json'
          }
        },
        {
          timeout: 20000
        }
      );
  
    const raw =
      response.data?.candidates?.[0]
        ?.content?.parts?.[0]?.text;
  
    if (!raw) {
      throw new Error(
        'Gemini returned an empty response'
      );
    }
  
    const poll = JSON.parse(
      raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
    );
  
    if (
      !poll.question ||
      !Array.isArray(poll.options) ||
      poll.options.length < 2
    ) {
      throw new Error(
        'Invalid poll format'
      );
    }
  
    const result = {
      question: poll.question,
      options: poll.options,
      reason: poll.reason || '',
      gameId,
      league
    };
  
        /*
         * Store the successful poll in Redis so
         * every application replica can reuse it.
         */
        await cache.setJson(
          redisCacheKey,
          result,
          POLL_REDIS_CACHE_TTL_SECONDS
        );
    
        /*
         * Keep the local cache as a fast path too.
         */
        pollCache.set(cacheKey, {
          timestamp: Date.now(),
          data: result
        });
    
        return result;
  
    } catch (error) {
      const status =
        error.response?.status;
  
      if (status === 429) {
        console.warn(
          `Gemini rate limit reached for poll ${league}/${gameId}; using local fallback.`
        );
      } else {
        console.error(
          `AI poll generation failed for ${league}/${gameId}:`,
          error.message
        );
      }
  
      /*
       * Gemini failure should not make the chatroom
       * unusable. Use the deterministic fallback,
       * but do not retry immediately.
       */
      return buildFallbackPoll(
        gameState,
        league
      );
    }
}

module.exports = {
  generateGamePoll
};
