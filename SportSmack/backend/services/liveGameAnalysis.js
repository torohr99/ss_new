const axios = require('axios');

const LIVE_ANALYSIS_CACHE = new Map();

const CACHE_TTL = 2 * 60 * 1000;

function getCached(key) {
  const item = LIVE_ANALYSIS_CACHE.get(key);

  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    LIVE_ANALYSIS_CACHE.delete(key);
    return null;
  }

  return item.value;
}

function setCached(key, value) {
  LIVE_ANALYSIS_CACHE.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL
  });
}

function buildLivePrompt(context) {
  return `
You are SportSmack's live-game AI analyst.

Analyze the CURRENT STATE of this live sports game.

Your job is NOT to repeat generic pre-game analysis.

Instead:

1. Identify what has materially changed.
2. Explain why the current game situation matters.
3. Identify which team currently has the advantage.
4. Explain the most important live factor.
5. Identify what could change the game again.
6. Use only the supplied GAME DATA.
7. Do not invent statistics, players, injuries, events, or plays.
8. Do not describe an event that is not contained in the supplied data.
9. Keep the analysis concise and useful to someone watching the game.
10. If the available information is insufficient, say so.

Pay particular attention to:

- Score
- Period/inning/quarter
- Game clock
- Recent plays
- Scoring plays
- Major momentum changes
- Player performance
- Team statistics
- Game situation
- Win probability when available
- Injuries or player availability
- Any meaningful change since the previous state

CURRENT GAME DATA:

${JSON.stringify(context, null, 2)}

Return ONLY valid JSON:

{
  "headline": "Short description of the current game situation",

  "update": "2-4 sentence explanation of what is happening and why it matters.",

  "advantage": {
    "team": "Exact team name or Even",
    "confidence": 0,
    "reason": "Why this team currently has the advantage."
  },

  "keyDevelopment": {
    "title": "Most important recent development",
    "explanation": "Explain why it matters."
  },

  "momentum": {
    "team": "Exact team name or Even",
    "explanation": "Explain the current momentum."
  },

  "watchNext": [
    "Specific thing to watch next.",
    "Specific thing to watch next."
  ]
}
`;
}

async function generateLiveAnalysis(
  league,
  gameId,
  previousState,
  currentState
) {
  const cacheKey =
    `live-analysis-${league}-${gameId}-${currentState.fingerprint}`;

  const cached = getCached(cacheKey);

  if (cached) {
    return cached;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured.'
    );
  }

  const context = {
    league,
    gameId,

    previousState,

    currentState
  };

  const prompt = buildLivePrompt(context);

  const model =
    process.env.GEMINI_MODEL ||
    'gemini-2.5-flash';

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json'
      }
    },
    {
      timeout: 30000
    }
  );

  const content =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error(
      'AI returned an empty live analysis.'
    );
  }

  let analysis;

  try {
    analysis = JSON.parse(content);
  } catch (error) {
    console.error(
      'Failed to parse live AI analysis:',
      content
    );

    throw new Error(
      'AI returned invalid live-analysis JSON.'
    );
  }

  if (
    !analysis ||
    typeof analysis !== 'object' ||
    !analysis.headline ||
    !analysis.update ||
    !analysis.advantage
  ) {
    throw new Error(
      'AI returned incomplete live analysis.'
    );
  }

  if (
    typeof analysis.advantage.confidence !==
    'number'
  ) {
    analysis.advantage.confidence = 50;
  }

  analysis.advantage.confidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        analysis.advantage.confidence
      )
    )
  );

  if (!Array.isArray(analysis.watchNext)) {
    analysis.watchNext = [];
  }

  const result = {
    status: 'live',
    league,
    gameId,
    generatedAt: Date.now(),
    analysis
  };

  setCached(cacheKey, result);

  return result;
}

module.exports = {
  generateLiveAnalysis
};
