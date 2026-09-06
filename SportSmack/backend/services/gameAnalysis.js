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

    const [
        homeRecentRaw,
        awayRecentRaw,
        homeNewsRaw,
        awayNewsRaw
    ] = await Promise.all([
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
        ),
        sportsApi.getTeamNews(
            mapping.sport,
            mapping.league,
            homeTeam.id
        ),
        sportsApi.getTeamNews(
            mapping.sport,
            mapping.league,
            awayTeam.id
        )
    ]);

    const context = {
        game: {
            id: gameId,
            league,
            sport: mapping.sport,
            name:
                summary.header.competitions[0].type?.text ||
                `${awayTeam.name} at ${homeTeam.name}`,
            date:
                competition.date ||
                summary.header.date ||
                null,
            status:
                competition.status?.type?.state ||
                'unknown',
            statusDetail:
                competition.status?.type?.shortDetail ||
                null,
            venue:
                competition.venue?.fullName ||
                competition.venue?.address?.city ||
                null,
            neutralSite:
                competition.neutralSite === true
        },
    
        matchup: {
            home: {
                ...homeTeam,
                standings: homeStanding || null,
    
                recentForm:
                    summarizeRecentGames(homeRecentRaw),
    
                statistics:
                    home.statistics || [],
    
                injuries:
                    home.injuries || [],
    
                news:
                    Array.isArray(homeNewsRaw)
                        ? homeNewsRaw.slice(0, 5).map(article => ({
                            headline:
                                article.headline ||
                                article.title ||
                                null,
                            description:
                                article.description ||
                                null,
                            published:
                                article.published ||
                                null,
                            link:
                                article.links?.web?.href ||
                                null
                        }))
                        : []
            },
    
            away: {
                ...awayTeam,
                standings: awayStanding || null,
    
                recentForm:
                    summarizeRecentGames(awayRecentRaw),
    
                statistics:
                    away.statistics || [],
    
                injuries:
                    away.injuries || [],
    
                news:
                    Array.isArray(awayNewsRaw)
                        ? awayNewsRaw.slice(0, 5).map(article => ({
                            headline:
                                article.headline ||
                                article.title ||
                                null,
                            description:
                                article.description ||
                                null,
                            published:
                                article.published ||
                                null,
                            link:
                                article.links?.web?.href ||
                                null
                        }))
                        : []
            }
        },
    
        keyPlayers: {
            home: [],
            away: []
        },
    
        betting: {
            line:
                summary.pickcenter?.[0]?.details ||
                summary.pickcenter?.[0]?.overUnder ||
                null,
    
            overUnder:
                summary.pickcenter?.[0]?.overUnder ??
                null,
    
            homeMoneyLine:
                summary.pickcenter?.[0]?.homeTeamOdds?.moneyLine ??
                null,
    
            awayMoneyLine:
                summary.pickcenter?.[0]?.awayTeamOdds?.moneyLine ??
                null
        },
    
        predictor: {
            homeWinPercentage:
                summary.predictor?.homeTeam?.gameProjection ??
                null,
    
            awayWinPercentage:
                summary.predictor?.awayTeam?.gameProjection ??
                null
        },
    
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
    
        againstTheSpread:
            summary.againstTheSpread || null,
    
        seasonType:
            summary.header.season?.type || null
    };

    // Extract the most relevant ESPN leaders for each team.
    if (Array.isArray(summary.leaders)) {
        for (const leaderGroup of summary.leaders) {
            const teamId = String(
                leaderGroup?.team?.id || ''
            );
    
            const target =
                teamId === String(homeTeam.id)
                    ? context.keyPlayers.home
                    : teamId === String(awayTeam.id)
                        ? context.keyPlayers.away
                        : null;
    
            if (!target) continue;
    
            for (const category of leaderGroup.leaders || []) {
                for (const leader of category.leaders || []) {
                    const athlete = leader.athlete;
    
                    if (!athlete?.id || !athlete?.displayName) {
                        continue;
                    }
    
                    target.push({
                        id: athlete.id,
                        name: athlete.displayName,
                        category:
                            category.displayName ||
                            category.name ||
                            null,
                        statistics:
                            leader.statistics ||
                            leader.displayValue ||
                            null,
                        image:
                            athlete.headshot?.href ||
                            athlete.image?.href ||
                            null
                    });
                }
            }
        }
    }

    setCached(cacheKey, context);

    return context;
}

function buildAnalysisPrompt(context) {
    const home = context.matchup.home;
    const away = context.matchup.away;

    return `
You are SportSmack's pre-game sports analyst.

Analyze ONLY this specific upcoming matchup.

MATCHUP-CONTEXT REQUIREMENTS:

- Compare these two specific teams.
- Use the supplied team statistics.
- Identify meaningful offensive and defensive advantages when the supplied statistics support them.
- Compare recent form.
- Identify the most important key players when supplied.
- Discuss relevant injuries when supplied.
- Consider recent team news when supplied.
- Consider standings and relevant matchup statistics.
- Do NOT invent statistics, players, injuries, news, or trends.
- Do NOT make generic statements that are unsupported by the supplied data.
- If information is unavailable, explicitly say it is unavailable.
- ESPN's predictor is only a reference point. Do your own reasoning.
- Every major conclusion must be supported by supplied evidence.
- The game has NOT started yet.
- Do not discuss live-game events.

GAME DATA:

${JSON.stringify(context, null, 2)}

Return ONLY valid JSON using exactly this structure:

{
    "headline": "Short matchup-specific headline",

    "summary": "2-4 sentence explanation of what makes this matchup interesting.",

    "homeTeam": {
        "name": "${home.name}",

        "advantages": [
            "Specific statistical or matchup advantage"
        ],

        "concerns": [
            "Specific statistical or matchup concern"
        ]
    },

    "awayTeam": {
        "name": "${away.name}",

        "advantages": [
            "Specific statistical or matchup advantage"
        ],

        "concerns": [
            "Specific statistical or matchup concern"
        ]
    },

    "offensiveComparison": {
        "analysis": "Compare the offensive strengths and weaknesses of both teams using supplied evidence.",
        "advantage": "Team with the offensive advantage, or unavailable"
    },

    "defensiveComparison": {
        "analysis": "Compare the defensive strengths and weaknesses of both teams using supplied evidence.",
        "advantage": "Team with the defensive advantage, or unavailable"
    },

    "keyMatchup": {
        "title": "The most important matchup factor",
        "analysis": "Explain why this matchup factor matters.",
        "evidence": [
            "Specific supporting fact",
            "Specific supporting fact"
        ]
    },

    "keyPlayers": {
        "home": [
            "Important player and why they matter"
        ],
        "away": [
            "Important player and why they matter"
        ]
    },

    "injuries": {
        "analysis": "Explain which injuries could materially affect the matchup.",
        "important": [
            "Specific injury and its relevance"
        ]
    },

    "recentForm": {
        "analysis": "Compare the recent form of both teams.",
        "homeRecord": "W-L-T",
        "awayRecord": "W-L-T"
    },

    "news": {
        "analysis": "Explain any recent team news that materially affects the matchup.",
        "important": [
            "Specific relevant news item"
        ]
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

    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
    }

    const prompt = buildAnalysisPrompt(context);

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
                maxOutputTokens: 1800,
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
        keyPlayers: context.keyPlayers,
        injuries: context.injuries,
        statistics: context.statistics,
        predictor: context.predictor,
        betting: context.betting,
        analysis
    };
}

module.exports = {
    buildGameContext,
    generatePregameAnalysis
};
