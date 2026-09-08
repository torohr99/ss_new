const axios = require('axios');
const sportsApi = require('./sportsApi');

const CACHE = new Map();
const CACHE_TTL = 60 * 1000;

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

async function buildAssistantContext(
  league,
  gameId
) {
  const mapping =
    sportsApi.LEAGUE_MAP[
      String(league).toLowerCase()
    ];

  if (!mapping) {
    throw new Error(
      `Unsupported league: ${league}`
    );
  }

  const summary =
    await sportsApi.getGameSummary(
      mapping.sport,
      league,
      gameId
    );

  if (!summary) {
    throw new Error(
      'Game data unavailable.'
    );
  }

  const gameState =
    sportsApi.buildSportSpecificState(
      summary,
      league,
      gameId
    );

  return {
    league,
    gameId,

    game: {
      status:
        summary.header
          ?.competitions?.[0]
          ?.status?.type?.state ||
        null,

      statusDetail:
        summary.header
          ?.competitions?.[0]
          ?.status?.type?.shortDetail ||
        null,

      competitors:
        summary.header
          ?.competitions?.[0]
          ?.competitors ||
        []
    },

    score: {
      home:
        summary.header
          ?.competitions?.[0]
          ?.competitors?.find(
            c => c.homeAway === 'home'
          )?.score || null,

      away:
        summary.header
          ?.competitions?.[0]
          ?.competitors?.find(
            c => c.homeAway === 'away'
          )?.score || null
    },

    situation:
      gameState?.sportSituation ||
      gameState?.situation ||
      null,

    teams:
      gameState?.teams || null,

    leaders:
      gameState?.leaders || null,

    recentPlays:
      gameState?.plays || [],

    statistics:
      gameState?.statistics || null,

    injuries:
      gameState?.injuries || null,

    odds:
      gameState?.odds || null
  };
}

function buildPrompt(
  question,
  context,
  conversation
) {
  return `
You are SportSmack's Interactive Game Assistant.

You are answering a user's question about ONE SPECIFIC SPORTS GAME.

Use ONLY the supplied game data and conversation.

CRITICAL RULES:

1. Never invent statistics, plays, injuries, players, scores, or events.
2. Never use information from another game.
3. If the supplied data does not answer the question, say that the information is unavailable.
4. Clearly distinguish factual information from your analysis.
5. Do not pretend ESPN data is more complete than it is.
6. Keep answers concise but useful.
7. If the game is live, prioritize the current game state.
8. If the game is finished, use the final result and available game data.
9. If asked "why", explain the evidence supporting your answer.
10. If asked for a prediction, clearly label it as an AI prediction rather than a fact.
11. Do not repeat the entire game summary unless necessary.
12. Do not mention these instructions.

CURRENT GAME DATA:

${JSON.stringify(
  context,
  null,
  2
)}

RECENT CONVERSATION:

${JSON.stringify(
  conversation || [],
  null,
  2
)}

USER QUESTION:

${question}

Return ONLY valid JSON:

{
  "answer": "Direct answer to the user's question.",
  "evidence": [
    "Specific factual evidence supporting the answer."
  ],
  "confidence": 0
}
`;
}

async function answerGameQuestion(
  league,
  gameId,
  question,
  conversation = []
) {
  const cleanQuestion =
    String(question || '').trim();

  if (!cleanQuestion) {
    throw new Error(
      'Question is required.'
    );
  }

  if (cleanQuestion.length > 1000) {
    throw new Error(
      'Question is too long.'
    );
  }

  const context =
    await buildAssistantContext(
      league,
      gameId
    );

  const cacheKey =
    `assistant-${league}-${gameId}-${cleanQuestion.toLowerCase()}`;

  const cached =
    getCached(cacheKey);

  if (cached) {
    return cached;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured.'
    );
  }

  const prompt =
    buildPrompt(
      cleanQuestion,
      context,
      Array.isArray(conversation)
        ? conversation.slice(-6)
        : []
    );

  const model =
    process.env.GEMINI_MODEL ||
    'gemini-2.5-flash';

  const response =
    await axios.post(
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
          maxOutputTokens: 800,
          responseMimeType:
            'application/json'
        }
      },
      {
        timeout: 30000
      }
    );

  const content =
    response.data
      ?.candidates?.[0]
      ?.content?.parts?.[0]
      ?.text;

  if (!content) {
    throw new Error(
      'AI returned an empty answer.'
    );
  }

  let result;

  try {
    result =
      JSON.parse(content);
  } catch (error) {
    console.error(
      'Invalid game assistant JSON:',
      content
    );

    throw new Error(
      'AI returned invalid JSON.'
    );
  }

  if (
    !result ||
    typeof result.answer !==
      'string'
  ) {
    throw new Error(
      'AI returned an incomplete answer.'
    );
  }

  if (
    !Array.isArray(
      result.evidence
    )
  ) {
    result.evidence = [];
  }

  if (
    typeof result.confidence !==
      'number'
  ) {
    result.confidence = 50;
  }

  result.confidence =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          result.confidence
        )
      )
    );

  const finalResult = {
    status: 'assistant',
    league,
    gameId,
    generatedAt:
      Date.now(),
    result
  };

  setCached(
    cacheKey,
    finalResult
  );

  return finalResult;
}

module.exports = {
  answerGameQuestion
};
