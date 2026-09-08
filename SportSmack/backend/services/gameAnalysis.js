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
You are SportSmack's advanced pre-game sports analyst.

Your job is to independently reason about ONE SPECIFIC upcoming matchup.

You must base your reasoning ONLY on the supplied GAME DATA.

CORE RULES:

1. Do not invent statistics, players, injuries, news, records, trends, or matchup information.
2. Do not use general knowledge that is not supported by the supplied GAME DATA.
3. Do not discuss unrelated games.
4. Do not discuss events that have already happened during the game.
5. If information is unavailable, say "Unavailable."
6. ESPN's predictor is evidence, NOT the answer.
7. Do your own matchup-specific reasoning.
8. Every major conclusion must be supported by specific supplied evidence.
9. Prefer multiple independent pieces of evidence when available.
10. Distinguish between facts from the data and your interpretation of those facts.
11. Do not claim that one team has an advantage unless the supplied evidence supports it.
12. Confidence must reflect the strength and consistency of the evidence, not simply how strongly you phrase the prediction.

REASONING PROCESS:

First, identify the most meaningful differences between the two teams.

Then evaluate:

A. Overall team quality
B. Recent form
C. Offensive strengths and weaknesses
D. Defensive strengths and weaknesses
E. Key players
F. Injuries
G. Recent team news
H. Home/away or neutral-site context
I. Standings
J. Betting information
K. ESPN predictor
L. Any sport-specific statistics supplied by ESPN

Then determine:

1. Which team has the stronger overall case.
2. What specific matchup creates that advantage.
3. Which evidence is most important.
4. What evidence works against your prediction.
5. What could cause your prediction to be wrong.
6. How confident you should actually be.

IMPORTANT:

A prediction with conflicting evidence should have LOWER confidence.

A prediction supported by several independent pieces of evidence may have HIGHER confidence.

Do not artificially force a large confidence number.

GAME DATA:

${JSON.stringify(context, null, 2)}

Return ONLY valid JSON.

Use exactly this structure:

{
  "headline": "Short matchup-specific headline",

  "summary": "2-4 sentence explanation of the matchup and why one team has an advantage.",

  "reasoning": {
    "primaryEvidence": [
      {
        "factor": "Name of factor",
        "team": "Exact team name or Both",
        "evidence": "Specific factual evidence from GAME DATA",
        "impact": "Explain how this evidence affects the matchup"
      }
    ],

    "counterEvidence": [
      {
        "factor": "Name of factor",
        "team": "Exact team name or Both",
        "evidence": "Specific evidence that works against the prediction",
        "impact": "Explain why this evidence matters"
      }
    ]
  },

  "homeTeam": {
    "name": "${home.name}",
    "advantages": [
      "Specific supported advantage"
    ],
    "concerns": [
      "Specific supported concern"
    ]
  },

  "awayTeam": {
    "name": "${away.name}",
    "advantages": [
      "Specific supported advantage"
    ],
    "concerns": [
      "Specific supported concern"
    ]
  },

  "offensiveComparison": {
    "analysis": "Evidence-based comparison of the offenses.",
    "advantage": "Exact team name or Unavailable"
  },

  "defensiveComparison": {
    "analysis": "Evidence-based comparison of the defenses.",
    "advantage": "Exact team name or Unavailable"
  },

  "keyMatchup": {
    "title": "Most important matchup factor",
    "analysis": "Explain why this matchup factor matters.",
    "evidence": [
      "Specific supporting evidence",
      "Specific supporting evidence"
    ]
  },

  "keyPlayers": {
    "home": [
      "Specific player and why the player matters"
    ],
    "away": [
      "Specific player and why the player matters"
    ]
  },

  "injuries": {
    "analysis": "Explain which injuries materially affect the matchup.",
    "important": [
      "Specific injury and why it matters"
    ]
  },

  "recentForm": {
    "analysis": "Evidence-based comparison of recent form.",
    "homeRecord": "W-L-T",
    "awayRecord": "W-L-T"
  },

  "news": {
    "analysis": "Explain only recent news that materially affects the matchup.",
    "important": [
      "Specific relevant news item"
    ]
  },

  "mostImportantFactor": "The single factor most likely to determine the outcome.",

  "prediction": {
    "winner": "Exact team name",
    "confidence": 0,
    "reason": "Evidence-based explanation of the prediction."
  },

  "whatCouldChangeThePrediction": [
    "Specific scenario that could invalidate or change the prediction.",
    "Specific scenario that could invalidate or change the prediction."
  ],

  "watchFor": [
    "Specific matchup development fans should watch.",
    "Specific matchup development fans should watch.",
    "Specific matchup development fans should watch."
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
        console.error(
            'Failed to parse AI analysis:',
            content
        );
    
        throw new Error(
            'AI returned invalid JSON.'
        );
    }
    
    if (
        !analysis ||
        typeof analysis !== 'object' ||
        !analysis.prediction ||
        typeof analysis.prediction !== 'object' ||
        !analysis.prediction.winner ||
        typeof analysis.prediction.confidence !== 'number' ||
        !analysis.prediction.reason
    ) {
        console.error(
            'AI returned incomplete analysis:',
            analysis
        );
    
        throw new Error(
            'AI returned incomplete analysis.'
        );
    }
    
    analysis.prediction.confidence = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                analysis.prediction.confidence
            )
        )
    );
    
    if (!Array.isArray(analysis.reasoning?.primaryEvidence)) {
        analysis.reasoning = {
            ...(analysis.reasoning || {}),
            primaryEvidence: []
        };
    }
    
    if (!Array.isArray(analysis.reasoning?.counterEvidence)) {
        analysis.reasoning = {
            ...(analysis.reasoning || {}),
            counterEvidence: []
        };
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
