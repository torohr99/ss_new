const axios = require('axios');
const sportsApi = require('./sportsApi');

const ANALYSIS_CACHE = new Map();

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
    const item = ANALYSIS_CACHE.get(key);

    if (!item) return null;

    if (Date.now() > item.expiresAt) {
        ANALYSIS_CACHE.delete(key);
        return null;
    }

    return item.value;
}

function setCached(key, value) {
    ANALYSIS_CACHE.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL
    });
}

function safeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCompetitor(competitor) {
    if (!competitor) return null;

    return {
        id: competitor.team?.id || null,
        name: competitor.team?.displayName || 'Unknown Team',
        abbreviation: competitor.team?.abbreviation || '',
        location: competitor.team?.location || '',
        nickname: competitor.team?.name || '',
        logo: competitor.team?.logos?.[0]?.href || null,
        homeAway: competitor.homeAway || null,
        record: competitor.record || [],
        ranking: competitor.curatedRank?.current ?? null,
        score: safeNumber(competitor.score)
    };
}

function summarizeRecentGames(games) {
    if (!games || games.length === 0) {
        return {
            games: [],
            wins: 0,
            losses: 0,
            ties: 0,
            pointsFor: null,
            pointsAgainst: null,
            pointDifferential: null
        };
    }

    const wins = games.filter(g => g.result === 'W').length;
    const losses = games.filter(g => g.result === 'L').length;
    const ties = games.filter(g => g.result === 'T').length;

    const pointsFor = games.reduce(
        (sum, game) => sum + (Number(game.teamScore) || 0),
        0
    );

    const pointsAgainst = games.reduce(
        (sum, game) => sum + (Number(game.opponentScore) || 0),
        0
    );

    return {
        games,
        wins,
        losses,
        ties,
        pointsFor,
        pointsAgainst,
        pointDifferential: pointsFor - pointsAgainst,
        averagePointsFor: Number((pointsFor / games.length).toFixed(1)),
        averagePointsAgainst: Number(
            (pointsAgainst / games.length).toFixed(1)
        )
    };
}

async function getRawGameSummary(league, gameId) {
    const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];

    if (!mapping) {
        throw new Error(`Unsupported league: ${league}`);
    }

    const response = await axios.get(
        `http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/summary?event=${gameId}`,
        {
            timeout: 10000
        }
    );

    return response.data;
}

async function buildGameContext(league, gameId) {
    const cacheKey = `pregame-context-${league}-${gameId}`;

    const cached = getCached(cacheKey);

    if (cached) return cached;

    const mapping = sportsApi.LEAGUE_MAP[league.toLowerCase()];

    if (!mapping) {
        throw new Error(`Unsupported league: ${league}`);
    }

    const summary = await getRawGameSummary(league, gameId);

    if (!summary?.header?.competitions?.[0]) {
        throw new Error('Game data is unavailable.');
    }

    const competition = summary.header.competitions[0];

    const home = competition.competitors?.find(
        competitor => competitor.homeAway === 'home'
    );

    const away = competition.competitors?.find(
        competitor => competitor.homeAway === 'away'
    );

    if (!home || !away) {
        throw new Error('Unable to identify both teams for this game.');
    }

    const homeTeam = normalizeCompetitor(home);
    const awayTeam = normalizeCompetitor(away);

    const standings = await sportsApi.getStandings(league);

    const homeStanding = standings.find(
        team => String(team.id) === String(homeTeam.id)
    );

    const awayStanding = standings.find(
        team => String(team.id) === String(awayTeam.id)
    );

    const [homeRecentRaw, awayRecentRaw] = await Promise.all([
        sportsApi.getRecentTeamGames(
            mapping.sport,
            mapping.league,
            homeTeam.id,
            5
        ),
        sportsApi.getRecentTeamGames(
            mapping.sport,
            mapping.league,
            awayTeam.id,
            5
        )
    ]);

    const context = {
        game: {
            id: gameId,
            league,
            sport: mapping.sport,
            name: summary.header.competitions[0].type?.text
                ? summary.header.competitions[0].type.text
                : `${awayTeam.name} at ${homeTeam.name}`,
            date: competition.date || summary.header.date || null,
            status: competition.status?.type?.state || 'unknown',
            statusDetail: competition.status?.type?.shortDetail || null,
            venue:
                competition.venue?.fullName ||
                competition.venue?.address?.city ||
                null,
            neutralSite: competition.neutralSite === true
        },

        matchup: {
            home: {
                ...homeTeam,
                standings: homeStanding || null,
                recentForm: summarizeRecentGames(homeRecentRaw)
            },

            away: {
                ...awayTeam,
                standings: awayStanding || null,
                recentForm: summarizeRecentGames(awayRecentRaw)
            }
        },

        betting: {
            line:
                summary.pickcenter?.[0]?.details ||
                summary.pickcenter?.[0]?.overUnder ||
                null,

            overUnder:
                summary.pickcenter?.[0]?.overUnder ?? null,

            homeMoneyLine:
                summary.pickcenter?.[0]?.homeTeamOdds?.moneyLine ??
                null,

            awayMoneyLine:
                summary.pickcenter?.[0]?.awayTeamOdds?.moneyLine ??
                null
        },

        predictor: {
            homeWinPercentage:
                summary.predictor?.homeTeam?.gameProjection ?? null,

            awayWinPercentage:
                summary.predictor?.awayTeam?.gameProjection ?? null
        },

        // ESPN can provide different statistics depending on sport.
        // Preserve them without assuming a single sport-specific schema.
        statistics: {
            home: home.statistics || [],
            away: away.statistics || []
        },

        injuries: {
            home: home.injuries || [],
            away: away.injuries || []
        },

        leaders: summary.leaders || [],

        notes: summary.notes || [],

        againstTheSpread: summary.againstTheSpread || null,

        seasonType: summary.header.season?.type || null
    };

    setCached(cacheKey, context);

    return context;
}

function buildAnalysisPrompt(context) {
    const home = context.matchup.home;
    const away = context.matchup.away;

    return `
You are SportSmack's pre-game sports analyst.

Analyze ONLY this specific upcoming matchup.

IMPORTANT:
- Do not give generic descriptions of either team.
- Do not discuss unrelated games.
- Do not invent statistics, injuries, players, news, or trends.
- Use only information contained in the supplied GAME DATA.
- If a piece of information is unavailable, explicitly say it is unavailable rather than guessing.
- ESPN's predictor is a reference point, NOT the conclusion you must copy.
- Your job is to independently reason from the matchup data.
- Every important conclusion should be connected to a specific piece of supplied evidence.
- The game has NOT started yet, so do not discuss live-game events.

Your analysis should identify the factors that actually differentiate these two teams.

GAME DATA:

${JSON.stringify(context, null, 2)}

Return ONLY valid JSON using exactly this structure:

{
  "headline": "Short matchup-specific headline",
  "summary": "2-4 sentence explanation of what makes this particular matchup interesting.",

  "homeTeam": {
    "name": "${home.name}",
    "advantages": [
      "Specific advantage supported by the supplied data"
    ],
    "concerns": [
      "Specific concern supported by the supplied data"
    ]
  },

  "awayTeam": {
    "name": "${away.name}",
    "advantages": [
      "Specific advantage supported by the supplied data"
    ],
    "concerns": [
      "Specific concern supported by the supplied data"
    ]
  },

  "keyMatchup": {
    "title": "The most important matchup factor",
    "analysis": "Explain why this matchup factor matters.",
    "evidence": [
      "Specific supporting fact",
      "Specific supporting fact"
    ]
  },

  "recentForm": {
    "analysis": "Compare the recent form of both teams using the supplied last-five-game data.",
    "homeRecord": "W-L-T",
    "awayRecord": "W-L-T"
  },

  "mostImportantFactor": "The single factor most likely to determine the outcome.",

  "prediction": {
    "winner": "Exact team name",
    "confidence": 0,
    "reason": "Explain the prediction using specific supplied evidence."
  },

  "whatCouldChangeThePrediction": [
    "Specific scenario",
    "Specific scenario"
  ],

  "watchFor": [
    "Specific thing fans should watch",
    "Specific thing fans should watch",
    "Specific thing fans should watch"
  ]
}
`;
}

async function generatePregameAnalysis(league, gameId) {
    const context = await buildGameContext(league, gameId);

    if (context.game.status !== 'pre') {
        return {
            status: context.game.status,
            context,
            analysis: null,
            message: 'This game is no longer in the pre-game state.'
        };
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }

    const prompt = buildAnalysisPrompt(context);

    const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.2,
            response_format: {
                type: 'json_object'
            },
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a precise sports analyst. Never invent data. Return valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('AI returned an empty analysis.');
    }

    let analysis;

    try {
        analysis = JSON.parse(content);
    } catch (error) {
        console.error('Failed to parse AI analysis:', content);
        throw new Error('AI returned invalid JSON.');
    }

    return {
        status: 'pre',
        game: context.game,
        matchup: context.matchup,
        predictor: context.predictor,
        betting: context.betting,
        analysis
    };
}

module.exports = {
    buildGameContext,
    generatePregameAnalysis
};
