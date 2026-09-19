'use strict';

const axios = require('axios');
const cache = require('./cache');

const SUCCESS_CACHE_TTL_SECONDS = 30 * 60;
const FAILURE_CACHE_TTL_SECONDS = 5 * 60;

function cacheKey(league, gameId) {
  return `ai:pregame-analysis:${String(
    league
  ).toLowerCase()}:${String(gameId)}`;
}

function buildAnalysisPrompt(gameState) {
  return `
You are the SportSmack AI sports analyst.

Analyze ONLY the specific game represented by the game-state data below.

GAME STATE:
${JSON.stringify(gameState, null, 2)}

Your analysis must be specific to this matchup.

Discuss:
1. The most important matchup.
2. The biggest advantage for each team.
3. The most important current/recent information.
4. The factor most likely to determine the game.
5. Your prediction.

IMPORTANT:
- Never invent players.
- Never invent statistics.
- Never invent injuries.
- Never invent recent plays.
- Never claim something happened unless it appears in the supplied data.
- If information is unavailable, say so.
- Use the actual teams and current game situation.
- If the game is live, prioritize current game information over generic pre-game information.

Return ONLY valid JSON:

{
  "headline": "short matchup-specific headline",
  "summary": "2-4 sentence matchup summary",
  "keyMatchup": {
    "title": "specific matchup",
    "analysis": "why it matters",
    "evidence": [
      "specific evidence",
      "specific evidence"
    ]
  },
  "mostImportantFactor": "most important factor",
  "prediction": {
    "winner": "team name",
    "confidence": 0,
    "reason": "specific reasoning"
  },
  "watchFor": [
    "specific thing",
    "specific thing",
    "specific thing"
  ]
}
`;
}

async function generateWithGemini(gameState) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured'
    );
  }

  const model =
    process.env.GEMINI_MODEL ||
    'gemini-2.5-flash';

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${process.env.GEMINI_API_KEY}`;

  const response =
    await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text:
                  buildAnalysisPrompt(
                    gameState
                  )
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 900,
          responseMimeType:
            'application/json'
        }
      },
      {
        timeout: 30000
      }
    );

  const raw =
    response.data
      ?.candidates?.[0]
      ?.content?.parts?.[0]
      ?.text;

  if (!raw) {
    throw new Error(
      'AI returned an empty response'
    );
  }

  return JSON.parse(
    raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  );
}

async function generateCachedAnalysis(
  gameState,
  league,
  gameId
) {
  const key =
    cacheKey(
      league,
      gameId
    );

  return cache.getOrSetJson(
    key,
    SUCCESS_CACHE_TTL_SECONDS,
    async () => {
      try {
        const analysis =
          await generateWithGemini(
            gameState
          );

        return {
          success: true,
          league,
          gameId,
          analysis
        };
      } catch (error) {
        const status =
          error.response?.status ||
          'unknown';

        const providerMessage =
          error.response?.data
            ? JSON.stringify(
                error.response.data
              ).slice(0, 500)
            : '';

        console.error(
          `Gemini AI generation failed for ${league}/${gameId}: ` +
          `HTTP ${status} ${error.message}` +
          `${providerMessage ? ` | ${providerMessage}` : ''}`
        );

        /*
         * IMPORTANT:
         * A 429 should not cause every connected
         * user/replica to immediately retry Gemini.
         *
         * Returning a failure object allows Redis
         * to cache the failure temporarily.
         */
        return {
          success: false,
          league,
          gameId,
          analysis: null,
          error:
            status === 429
              ? 'AI rate limit temporarily reached'
              : 'AI analysis temporarily unavailable',
          retryAfterSeconds:
            status === 429
              ? FAILURE_CACHE_TTL_SECONDS
              : 60
        };
      }
    },
    {
      lockTtlSeconds: 45,
      waitMs: 250,
      maxWaitMs: 5000
    }
  );
}

async function getPregameAnalysis(
  gameState,
  league,
  gameId
) {
  const key =
    cacheKey(
      league,
      gameId
    );

  /*
   * First check Redis directly.
   */
  const cached =
    await cache.getJson(key);

  if (cached) {
    console.log(
      `Using cached AI analysis for ${league}/${gameId}`
    );

    return cached;
  }

  console.log(
    `Generating new AI analysis for ${league}/${gameId}`
  );

  return generateCachedAnalysis(
    gameState,
    league,
    gameId
  );
}

module.exports = {
  getPregameAnalysis
};
