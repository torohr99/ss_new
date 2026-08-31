'use strict';

const axios = require('axios');

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const pollCache = new Map();

const POLL_CACHE_TTL =
  5 * 60 * 1000;

function getTeamName(competitor) {
  return (
    competitor?.team?.displayName ||
    competitor?.team?.name ||
    'Unknown Team'
  );
}

function buildGameState(summary, league) {
  const competition =
    summary?.header?.competitions?.[0];

  if (!competition) {
    return null;
  }

  const competitors =
    competition.competitors || [];

  const home =
    competitors.find(
      c => c.homeAway === 'home'
    );

  const away =
    competitors.find(
      c => c.homeAway === 'away'
    );

  return {
    league,

    status:
      competition.status?.type?.state ||
      'unknown',

    statusDetail:
      competition.status?.type?.detail ||
      '',

    homeTeam: {
      name: getTeamName(home),
      abbreviation:
        home?.team?.abbreviation || '',
      score:
        home?.score ?? null,
      record:
        home?.records?.[0]?.summary || null
    },

    awayTeam: {
      name: getTeamName(away),
      abbreviation:
        away?.team?.abbreviation || '',
      score:
        away?.score ?? null,
      record:
        away?.records?.[0]?.summary || null
    },

    situation:
      summary?.situation || null,

    plays:
      Array.isArray(summary?.plays)
        ? summary.plays.slice(-15)
        : [],

    leaders:
      summary?.leaders || null
  };
}

function buildPrompt(gameState) {
  return `
You generate interactive polls for SportSmack.

Create ONE poll for THIS EXACT GAME.

GAME:
${JSON.stringify(gameState, null, 2)}

The poll must be specific to this matchup.

If the game has NOT started:
- Ask about a meaningful matchup, player, strategy,
  or outcome.
- Do not use a generic "Who will win?" question
  unless no better information exists.

If the game IS LIVE:
- Use the current score.
- Use the inning/quarter/period.
- Use recent plays.
- Use player/game situation information.
- Ask something fans could realistically debate RIGHT NOW.

SPORT-SPECIFIC GUIDANCE:

MLB:
Focus on pitcher/batter matchups, next at-bat,
runs, bullpen decisions, inning strategy, steals,
hits, strikeouts, etc.

NFL:
Focus on drives, fourth downs, play calling,
QB decisions, touchdowns, field goals, defensive
matchups, etc.

NBA:
Focus on possessions, player matchups, three-point
attempts, fouls, defensive assignments, scoring runs,
timeouts, etc.

NHL:
Focus on power plays, goalie decisions, shots,
scoring chances, empty-net situations, etc.

NCAAF:
Focus on drives, fourth downs, QB decisions,
scoring, matchups and game situation.

NCAAB:
Focus on possessions, shooting, foul trouble,
defensive matchups and scoring runs.

Never invent:
- players
- statistics
- injuries
- plays
- scores
- game events

Only use supplied information.

Return ONLY JSON:

{
  "question": "specific question",
  "options": ["Option 1", "Option 2"],
  "reason": "why this poll is relevant"
}
`;
}

async function generateGamePoll(
  summary,
  league,
  gameId
) {
  const gameState =
    buildGameState(summary, league);

  if (!gameState) {
    throw new Error(
      'Game state unavailable'
    );
  }

  const cacheKey =
  `${String(league).toLowerCase()}:${gameId}:${gameState.status}:${gameState.statusDetail}:${gameState.homeTeam.score}:${gameState.awayTeam.score}`;

  const cached =
    pollCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp <
      POLL_CACHE_TTL
  ) {
    return cached.data;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured'
    );
  }

  const response =
    await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: buildPrompt(gameState)
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300,
          responseMimeType:
            'application/json'
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

  const poll =
    JSON.parse(raw);

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
  generateGamePoll,
  buildGameState
};
