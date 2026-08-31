'use strict';

const axios = require('axios');

const OPENAI_API_URL =
    'https://api.openai.com/v1/chat/completions';

const pollCache = new Map();

const POLL_CACHE_TTL =
    5 * 60 * 1000; // 5 minutes

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
            summary?.leaders || null,

        broadcasts:
            competition.broadcasts || []
    };
}

function buildPollPrompt(gameState) {
    const isPreGame =
        gameState.status === 'pre';

    return `
You create interactive polls for the SportSmack sports social network.

Generate ONE poll for THIS EXACT GAME.

LEAGUE:
${gameState.league}

GAME STATE:
${JSON.stringify(gameState, null, 2)}

This must be a matchup-specific poll.

${isPreGame
    ? `
The game has not started.

Create a poll based on the actual matchup, teams, players, records,
odds, or other information supplied in the game data.

Do NOT ask a generic "Who will win?" question unless there is genuinely
no other useful information available.
`
    : `
The game is currently in progress.

Create a poll based on what is ACTUALLY happening right now.

If the supplied data contains a recent play, score, inning, quarter,
period, possession, timeout situation, player statistic, etc., use it.

The poll should feel like something fans would naturally debate RIGHT NOW.
`
}

SPORT-SPECIFIC RULES:

NFL:
- Drives
- Fourth downs
- Play calling
- Touchdowns/field goals
- Quarterback decisions
- Matchups
- Defensive strategy

NBA:
- Player matchups
- Next possession
- Three-point attempts
- Foul/timeout decisions
- Defensive assignments
- Scoring runs
- Clutch situations

MLB:
- Next at-bat
- Pitching changes
- Batter/pitcher matchups
- Stolen bases
- Bullpen decisions
- Inning strategy
- Hit/run expectations

NHL:
- Power plays
- Goalie decisions
- Next goal
- Shot volume
- Defensive matchups
- Empty-net situations

NCAAF:
- Fourth downs
- Drives
- Rivalry/matchup factors
- Quarterback decisions
- Scoring drives

NCAAB:
- Possessions
- Three-point shooting
- Foul trouble
- Defensive matchups
- Next scoring run

IMPORTANT:
- Never invent a player.
- Never invent a statistic.
- Never claim something happened unless it appears in the supplied data.
- Don't use stale generic questions when current game data is available.
- Don't ask the same type of poll repeatedly.
- Make the question specific enough that fans of THIS game would recognize it.

Return ONLY valid JSON:

{
  "question": "specific poll question",
  "options": [
    "Option 1",
    "Option 2"
  ],
  "reason": "one sentence explaining why this poll is relevant right now"
}
`;
}

async function generateGamePoll(summary, league, gameId) {
    const gameState =
        buildGameState(summary, league);

    if (!gameState) {
        throw new Error(
            'Game state unavailable'
        );
    }

    const cacheKey =
        `${String(league).toLowerCase()}:${gameId}`;

    const cached =
        pollCache.get(cacheKey);

    if (
        cached &&
        Date.now() - cached.timestamp <
            POLL_CACHE_TTL
    ) {
        return cached.data;
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error(
            'OPENAI_API_KEY is not configured'
        );
    }

    const response =
        await axios.post(
            OPENAI_API_URL,
            {
                model:
                    process.env.OPENAI_MODEL ||
                    'gpt-4o-mini',

                messages: [
                    {
                        role: 'system',
                        content:
                            'You generate accurate, game-specific sports polls using only supplied information.'
                    },
                    {
                        role: 'user',
                        content:
                            buildPollPrompt(gameState)
                    }
                ],

                temperature: 0.7,
                max_tokens: 250
            },
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.OPENAI_API_KEY}`,

                    'Content-Type':
                        'application/json'
                },

                timeout: 20000
            }
        );

    const raw =
        response.data?.choices?.[0]?.message?.content;

    if (!raw) {
        throw new Error(
            'Empty poll response'
        );
    }

    const cleaned =
        raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

    const poll =
        JSON.parse(cleaned);

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
        ...poll,
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
