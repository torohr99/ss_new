const axios = require('axios');
// Simple in-memory cache to avoid node-cache dependency issues
const cacheStore = {};
const cache = {
  get: (key) => {
    const item = cacheStore[key];
    if (!item) return null;
    if (Date.now() > item.expiry) {
      delete cacheStore[key];
      return null;
    }
    return item.value;
  },
  set: (key, value, ttlSeconds) => {
    cacheStore[key] = {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    };
  }
};

const LEAGUE_MAP = {
  nfl: { sport: 'football', league: 'nfl' },
  nba: { sport: 'basketball', league: 'nba' },
  mlb: { sport: 'baseball', league: 'mlb' },
  nhl: { sport: 'hockey', league: 'nhl' },
  ncaam: { sport: 'basketball', league: 'mens-college-basketball' },
  ncaaw: { sport: 'basketball', league: 'womens-college-basketball' },
  ncaaf: { sport: 'football', league: 'college-football' },
  ncaab: { sport: 'baseball', league: 'college-baseball' },
  wnba: { sport: 'basketball', league: 'wnba' },
  'premier-league': { sport: 'soccer', league: 'eng.1' }
};

const getBaseUrl = (type, sport, league) => {
  if (type === 'scoreboard') {
    return `http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
  }
  return `http://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`;
};

async function getScoreboard(leagueKey) {
  const mapping = LEAGUE_MAP[leagueKey];
  if (!mapping) throw new Error('Invalid league');

  const cacheKey = `scoreboard_${leagueKey}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(getBaseUrl('scoreboard', mapping.sport, mapping.league));
    const events = response.data.events || [];
    
    // Normalize data for frontend
    const games = events.map(event => {
      const competition = event.competitions[0];
      const status = event.status.type.shortDetail; // e.g., "Final", "3rd Qtr", "10:00 PM"
      const isLive = event.status.type.state === 'in';
      const isCompleted = event.status.type.state === 'post';
      
      const homeTeamInfo = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeamInfo = competition.competitors.find(c => c.homeAway === 'away');

      return {
        id: event.id,
        date: event.date,
        name: event.name,
        shortName: event.shortName,
        status,
        isLive,
        isCompleted,
        homeTeam: {
          name: homeTeamInfo.team.displayName,
          logo: homeTeamInfo.team.logo,
          score: homeTeamInfo.score,
          winner: homeTeamInfo.winner
        },
        awayTeam: {
          name: awayTeamInfo.team.displayName,
          logo: awayTeamInfo.team.logo,
          score: awayTeamInfo.score,
          winner: awayTeamInfo.winner
        }
      };
    });

    cache.set(cacheKey, games, 60); // Cache for 60s
    return games;
  } catch (error) {
    console.error(`ESPN API Error fetching scoreboard for ${leagueKey}:`, error.message);
    return [];
  }
}

async function getStandings(leagueKey) {
  const mapping = LEAGUE_MAP[leagueKey];
  if (!mapping) throw new Error('Invalid league');

  const cacheKey = `standings_${leagueKey}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(getBaseUrl('standings', mapping.sport, mapping.league));
    const children = response.data.children || [];
    
    let allStandings = [];

    // ESPN nests standings differently depending on the sport (Conferences vs Divisions)
    children.forEach(group => {
      const groupName = group.name; // e.g. "Eastern Conference"
      const standingsList = group.standings?.entries || [];

      standingsList.forEach(entry => {
        const team = entry.team;
        const stats = entry.stats || [];
        
        // Helper to find stat
        const getStat = (name) => {
          const stat = stats.find(s => s.name === name || s.id === name);
          return stat ? stat.displayValue : '-';
        };

        allStandings.push({
          group: groupName,
          id: team.id,
          name: team.displayName,
          logo: team.logos?.[0]?.href || '',
          wins: getStat('wins'),
          losses: getStat('losses'),
          winPercent: getStat('winPercent'),
          gamesBehind: getStat('gamesBehind'),
          streak: getStat('streak'),
          homeRecord: getStat('33') || getStat('Home'), // Fallbacks for different ESPN structures
          awayRecord: getStat('34') || getStat('Road')
        });
      });
    });

    cache.set(cacheKey, allStandings, 3600); // Cache for 1 hour
    return allStandings;
  } catch (error) {
    console.error(`ESPN API Error fetching standings for ${leagueKey}:`, error.message);
    return [];
  }
}

  async function getTeamDetails(sport, league, teamName, city = null) {
  const cacheKey = `teamDetails_${sport}_${league}_${teamName}_${city || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams?limit=400`);
    const teamsList = response.data.sports[0].leagues[0].teams;
    
    // Find the team by partial name match
    const espnTeam = teamsList.find(t => {
      const matchName = (t.team.displayName && t.team.displayName.toLowerCase().includes(teamName.toLowerCase())) || 
                        (t.team.name && t.team.name.toLowerCase().includes(teamName.toLowerCase()));
      
      // If a city is provided, ensure it matches to avoid duplicate mascot collisions (e.g., Blue Devils)
      if (city && matchName) {
         return t.team.location && t.team.location.toLowerCase().includes(city.toLowerCase());
      }
      return matchName;
    });

    if (!espnTeam) return null;

    let details = {
      espnId: espnTeam.team.id,
      color: espnTeam.team.color || '121212', // fallback dark color
      alternateColor: espnTeam.team.alternateColor || '2a2a2a',
    };

    // If baseball and no real color, try falling back to mens-college-basketball for the same school
    if (league === 'college-baseball' && (!espnTeam.team.color || details.color === '121212')) {
      try {
        const fallbackRes = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400`);
        const fallbackList = fallbackRes.data.sports[0].leagues[0].teams;
        const fallbackTeam = fallbackList.find(t => {
          const matchName = (t.team.displayName && t.team.displayName.toLowerCase().includes(teamName.toLowerCase())) || 
                            (t.team.name && t.team.name.toLowerCase().includes(teamName.toLowerCase()));
          if (city && matchName) {
             return t.team.location && t.team.location.toLowerCase().includes(city.toLowerCase());
          }
          return matchName;
        });
        if (fallbackTeam && fallbackTeam.team.color) {
          details.color = fallbackTeam.team.color;
          details.alternateColor = fallbackTeam.team.alternateColor || '2a2a2a';
        }
      } catch (fallbackErr) {
        console.error('Error fetching fallback color:', fallbackErr.message);
      }
    }

    cache.set(cacheKey, details, 86400); // cache for 24 hours
    return details;
  } catch (error) {
    console.error(`ESPN API Error fetching team details for ${teamName}:`, error.message);
    return null;
  }
}

async function getTeamSchedule(sport, league, espnId) {
  const cacheKey = `teamSchedule_${sport}_${league}_${espnId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${espnId}/schedule`);
    const events = response.data.events || [];

    let lastGame = null;
    let todayGame = null;
    let nextGame = null;

    // We rely on ESPN's internal status types:
    // 'post' = completed, 'in' = live/today, 'pre' = future
    const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Find last game
    const completedGames = sortedEvents.filter(e => e.competitions[0].status.type.state === 'post');
    if (completedGames.length > 0) {
      lastGame = completedGames[completedGames.length - 1]; // Most recent completed
    }

    // Find today / live game
    const liveGames = sortedEvents.filter(e => e.competitions[0].status.type.state === 'in');
    if (liveGames.length > 0) {
      todayGame = liveGames[0];
    } else {
      // If no live game, check if there's a 'pre' game scheduled for today's date local
      const todayString = new Date().toDateString();
      const todayPreGames = sortedEvents.filter(e => 
        e.competitions[0].status.type.state === 'pre' && 
        new Date(e.date).toDateString() === todayString
      );
      if (todayPreGames.length > 0) {
        todayGame = todayPreGames[0];
      }
    }

    // Find next game
    // A future game that is NOT todayGame
    const futureGames = sortedEvents.filter(e => 
      e.competitions[0].status.type.state === 'pre' && 
      (!todayGame || e.id !== todayGame.id)
    );
    if (futureGames.length > 0) {
      nextGame = futureGames[0];
    }

    // Helper to format a game box
    const formatGame = (game) => {
      if (!game) return null;
      const comp = game.competitions[0];
      const homeTeam = comp.competitors.find(c => c.homeAway === 'home');
      const awayTeam = comp.competitors.find(c => c.homeAway === 'away');
      return {
        id: game.id,
        name: game.name,
        shortName: game.shortName,
        date: game.date,
        status: comp.status.type.shortDetail,
        homeTeam: {
          name: homeTeam.team.displayName,
          logo: homeTeam.team.logos?.[0]?.href,
          score: homeTeam.score?.value ?? homeTeam.score, // Use ?? to prevent 0 from falling back to object
          winner: homeTeam.winner
        },
        awayTeam: {
          name: awayTeam.team.displayName,
          logo: awayTeam.team.logos?.[0]?.href,
          score: awayTeam.score?.value ?? awayTeam.score,
          winner: awayTeam.winner
        }
      };
    };

    // Format all games for the calendar
    const allGames = sortedEvents.map(game => {
      const formatted = formatGame(game);
      if (!formatted) return null;
      
      // Determine if our team (espnId) is home or away
      const isHome = game.competitions[0].competitors.find(c => c.homeAway === 'home').team.id === espnId;
      
      const ourTeam = isHome ? formatted.homeTeam : formatted.awayTeam;
      const theirTeam = isHome ? formatted.awayTeam : formatted.homeTeam;

      // Determine result
      let result = null;
      if (game.competitions[0].status.type.state === 'post') {
        const typeName = game.competitions[0].status.type.name;
        if (typeName === 'STATUS_POSTPONED') result = 'PPD';
        else if (typeName === 'STATUS_CANCELED') result = 'CANC';
        else if (ourTeam.winner) result = 'W';
        else if (theirTeam.winner) result = 'L';
        else result = 'T'; // Tie
      }

      return {
        ...formatted,
        isHome,
        ourScore: ourTeam.score,
        theirScore: theirTeam.score,
        opponentName: theirTeam.name,
        result
      };
    }).filter(Boolean);

    const scheduleData = {
      lastGame: formatGame(lastGame),
      todayGame: formatGame(todayGame),
      nextGame: formatGame(nextGame),
      allGames
    };
    cache.set(cacheKey, scheduleData, 3600); // cache for 1 hour
    return scheduleData;

  } catch (error) {
    console.error(`ESPN API Error fetching schedule for team ${espnId}:`, error.message);
    return null;
  }
}

async function getLeagueNews(sport, league) {
  const cacheKey = `news_${league}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/news`);
    const articles = response.data.articles || [];
    cache.set(cacheKey, articles, 300); // cache for 5 minutes
    return articles;
  } catch (error) {
    console.error(`ESPN API Error fetching news for ${league}:`, error.message);
    return [];
  }
}

async function getTeamNews(sport, league, teamId) {
  try {
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/news`, {
      params: { team: teamId }
    });
    return response.data.articles || [];
  } catch (error) {
    console.error(`Error fetching team news for ${sport}/${league} team ${teamId}:`, error.message);
    return [];
  }
}

async function getTeamSocialFeeds(teamName) {
  // Removing fake/mocked social feeds as requested by user
  return [];
}

async function getGameSummary(sport, league, gameId) {
  const cacheKey = `gameSummary_${sport}_${league}_${gameId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${gameId}`);
    
    // Determine caching time based on game status
    const isCompleted = response.data?.header?.competitions?.[0]?.status?.type?.state === 'post';
    const isLive = response.data?.header?.competitions?.[0]?.status?.type?.state === 'in';
    
    let ttl = 60; // default 60s
    if (isCompleted) ttl = 86400; // cache finished games for 24 hours
    else if (isLive) ttl = 15; // cache live games for 15s to keep them snappy but reduce load

    cache.set(cacheKey, response.data, ttl);
    return response.data;
  } catch (error) {
    console.error(`ESPN API Error fetching game summary for ${gameId}:`, error.message);
    return null;
  }
}

module.exports = {
  getScoreboard,
  getStandings,
  getTeamDetails,
  getTeamSchedule,
  getLeagueNews,
  getTeamNews,
  getTeamSocialFeeds,
  getGameSummary,
  LEAGUE_MAP
};
