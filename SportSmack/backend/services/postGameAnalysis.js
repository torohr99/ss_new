const axios = require('axios');

const CACHE = new Map();
const CACHE_TTL = 30 * 60 * 1000;

function getCached(key) {
  const item = CACHE.get(key);

  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    CACHE.delete(key);
    return null;
  }

  return item.value;
}

function setCached(key, value) {
  CACHE.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL
  });
}

function buildPostGamePrompt(context) {
  return `
You are SportSmack's post-game sports analyst.

Analyze the completed game using ONLY the supplied GAME DATA.

Do not invent statistics, plays, injuries, players, or events.

Explain:

1. What happened.
2. Why the winning team won.
3. Why the losing team lost.
4. The most important turning point.
5. The most important player(s).
6. Whether the pre-game prediction was correct.
7. What the game teaches us for future matchups.

GAME DATA:

${JSON.stringify(context, null, 2)}

Return ONLY valid JSON:

{
  "headline": "Short post-game headline",

  "summary": "2-4 sentence summary of the game.",

  "winner": {
    "team": "Exact team name",
    "whyTheyWon": "Evidence-based explanation."
  },

  "loser": {
    "team": "Exact team name",
    "whyTheyLost": "Evidence-based explanation."
  },

  "turningPoint": {
    "title": "Most important turning point",
    "explanation": "Why this changed the game."
  },

  "keyPlayers": [
    {
      "name": "Player name",
      "team": "Team name",
      "impact": "Why this player mattered."
    }
  ],

  "preGamePrediction": {
    "prediction": "Team predicted to win",
    "actualWinner": "Actual winning team",
    "correct": true,
    "analysis": "Explain whether the pre-game reasoning held up."
  },

  "biggestTakeaway": "The single most important lesson from this game."
}
`;
}

async function generatePostGameAnalysis(
  league,
  gameId,
  gameData,
  pregameAnalysis = null
) {
  const cacheKey =
    `postgame-${league}-${gameId}`;

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
    gameData,
    pregameAnalysis
  };

  const prompt =
    buildPostGamePrompt(context);

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
        maxOutputTokens: 1500,
        responseMimeType: 'application/json'
      }
    },
    {
      timeout: 30000
    }
  );

  const content =
    response.data?.candidates?.[0]
      ?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error(
      'AI returned an empty post-game analysis.'
    );
  }

  let analysis;

  try {
    analysis = JSON.parse(content);
  } catch (error) {
    console.error(
      'Invalid post-game AI JSON:',
      content
    );

    throw new Error(
      'AI returned invalid post-game JSON.'
    );
  }

  if (
    !analysis ||
    !analysis.headline ||
    !analysis.summary ||
    !analysis.winner ||
    !analysis.loser
  ) {
    throw new Error(
      'AI returned incomplete post-game analysis.'
    );
  }

  const result = {
    status: 'post',
    league,
    gameId,
    generatedAt: Date.now(),
    analysis
  };

  setCached(cacheKey, result);

  return result;
}

module.exports = {
  generatePostGameAnalysis
};
