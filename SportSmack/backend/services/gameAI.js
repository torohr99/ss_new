'use strict';

const axios = require('axios');

const analysisCache = new Map();

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cacheKey(league, gameId) {
  return `${String(league).toLowerCase()}:${String(gameId)}`;
}

function getCachedAnalysis(league, gameId) {
  const key = cacheKey(league, gameId);
  const cached = analysisCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    analysisCache.delete(key);
    return null;
  }

  return cached.data;
}

function setCachedAnalysis(league, gameId, data) {
  analysisCache.set(
    cacheKey(league, gameId),
    {
      timestamp: Date.now(),
      data
    }
  );
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
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model =
    process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [
            {
              text: buildAnalysisPrompt(gameState)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 900,
        responseMimeType: 'application/json'
      }
    },
    {
      timeout: 30000
    }
  );

  const raw =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error('AI returned an empty response');
  }

  return JSON.parse(
    raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
  );
}

async function getPregameAnalysis(
  gameState,
  league,
  gameId
) {
  const cached =
    getCachedAnalysis(league, gameId);

  if (cached) {
    console.log(
      `Using cached AI analysis for ${league}/${gameId}`
    );

    return cached;
  }

  console.log(
    `Generating new AI analysis for ${league}/${gameId}`
  );

  const analysis =
    await generateWithGemini(gameState);

  const result = {
    success: true,
    league,
    gameId,
    analysis
  };

  setCachedAnalysis(
    league,
    gameId,
    result
  );

  return result;
}

module.exports = {
  getPregameAnalysis,
  getCachedAnalysis,
  setCachedAnalysis
};
