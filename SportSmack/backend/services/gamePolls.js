'use strict';

const axios = require('axios');

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const pollCache = new Map();

const POLL_CACHE_TTL =
  5 * 60 * 1000;

const sportsApi = require('./sportsApi');

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
11. Make the poll different from previous polls.

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

  const cached = pollCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp < POLL_CACHE_TTL
  ) {
    return cached.data;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured'
    );
  }

  const response = await axios.post(
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

  pollCache.set(cacheKey, {
    timestamp: Date.now(),
    data: result
  });

  return result;
}

module.exports = {
  generateGamePoll
};
