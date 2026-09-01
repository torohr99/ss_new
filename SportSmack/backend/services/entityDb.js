const axios = require('axios');

/**
 * Advanced Entity Recognition Service
 * Identifies athletes, teams, and mascots from a raw text prompt.
 * It utilizes the ESPN Search API to match entities across all major sports leagues.
 */
class EntityDb {
  constructor() {
    // Dictionary of common slang and nicknames to improve recognition
    this.slangDictionary = {
      'yanks': 'New York Yankees',
      'bosox': 'Boston Red Sox',
      'niners': 'San Francisco 49ers',
      'chiefs': 'Kansas City Chiefs',
      'pats': 'New England Patriots',
      'mavs': 'Dallas Mavericks',
      'cavs': 'Cleveland Cavaliers',
      'tb12': 'Tom Brady',
      'lbj': 'LeBron James',
      'king james': 'LeBron James',
      'steph': 'Stephen Curry',
      'mahomes': 'Patrick Mahomes',
      'joker': 'Nikola Jokic',
      'kd': 'Kevin Durant'
    };
  }

  /**
   * Pre-processes the prompt to expand known slang and nicknames.
   */
  expandSlang(prompt) {
    let expanded = prompt.toLowerCase();
    for (const [slang, official] of Object.entries(this.slangDictionary)) {
      const regex = new RegExp(`\\b${slang}\\b`, 'gi');
      if (regex.test(expanded)) {
        expanded = expanded.replace(regex, official);
      }
    }
    return expanded;
  }

  /**
   * Identifies the primary sports entity in a text prompt.
   * Returns the entity details (type, name, team, sport, image URL) or null if generic.
   */
  async identifyEntity(prompt, gameContext = null) {
    try {
      const cleanPrompt = this.expandSlang(prompt).toLowerCase();
  
      /*
       * FIRST: resolve against the actual game.
       * This is much more reliable than a global ESPN search.
       */
      if (gameContext) {
        const teams = [
          gameContext.teams?.home,
          gameContext.teams?.away
        ].filter(Boolean);
  
        // Exact/current-game team matching.
        for (const team of teams) {
          const names = [
            team.name,
            team.abbreviation
          ]
            .filter(Boolean)
            .map(v => v.toLowerCase());
  
          if (
            names.some(name =>
              name.length >= 2 && cleanPrompt.includes(name)
            )
          ) {
            return {
              type: 'team',
              id: team.id,
              name: team.name,
              abbreviation: team.abbreviation,
              sport: gameContext.league,
              image: team.logo,
              source: 'current_game'
            };
          }
        }
  
        // Exact/current-game player matching.
        const players = Array.isArray(gameContext.players)
          ? gameContext.players
          : [];
  
        for (const player of players) {
          if (!player.name) continue;
  
          const fullName = player.name.toLowerCase();
          const parts = fullName.split(/\s+/);
          const lastName = parts[parts.length - 1];
  
          // Prefer full-name matches.
          if (cleanPrompt.includes(fullName)) {
            return {
              type: 'player',
              id: player.id,
              name: player.name,
              team: player.teamName,
              sport: gameContext.league,
              image: player.image || null,
              source: 'current_game'
            };
          }
  
          // Only use last-name matching when it is reasonably distinctive.
          if (
            lastName &&
            lastName.length >= 5 &&
            new RegExp(`\\b${lastName}\\b`, 'i').test(cleanPrompt)
          ) {
            return {
              type: 'player',
              id: player.id,
              name: player.name,
              team: player.teamName,
              sport: gameContext.league,
              image: player.image || null,
              source: 'current_game'
            };
          }
        }
      }
  
      /*
       * FALLBACK: ESPN global search.
       * Search the ENTIRE prompt instead of only its first four words.
       */
      const searchTerms = cleanPrompt;
  
      const response = await axios.get(
        `http://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(searchTerms)}&limit=10`
      );
  
      if (!response.data?.results) return null;
  
      const playerResults =
        response.data.results.find(r => r.type === 'player');
  
      if (
        playerResults?.contents &&
        playerResults.contents.length > 0
      ) {
        const player = playerResults.contents[0];
  
        return {
          type: 'player',
          id: player.id,
          name: player.displayName,
          team: player.subtitle,
          sport: player.sport,
          image: player.image?.default || null,
          source: 'espn_search'
        };
      }
  
      const teamResults =
        response.data.results.find(r => r.type === 'team');
  
      if (
        teamResults?.contents &&
        teamResults.contents.length > 0
      ) {
        const team = teamResults.contents[0];
  
        return {
          type: 'team',
          id: team.id,
          name: team.displayName,
          sport: team.sport,
          image: team.image?.default || null,
          source: 'espn_search'
        };
      }
  
      return null;
    } catch (error) {
      console.error('Error in EntityDb:', error.message);
      return null;
    }
  }
}

module.exports = new EntityDb();
