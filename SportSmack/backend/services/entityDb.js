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
  async identifyEntity(prompt) {
    try {
      const cleanPrompt = this.expandSlang(prompt);
      
      // We take the first 4 words of the prompt assuming the subject is mentioned early,
      // or we just search the whole prompt if it's short.
      const searchTerms = cleanPrompt;

const response = await axios.get(
  `http://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(searchTerms)}&limit=10`
);

if (
  !response.data ||
  !Array.isArray(response.data.results)
) {
  return null;
}

// Prefer an exact or near-exact player name match.
const playerResults =
  response.data.results.find(
    r => r.type === 'player'
  );

if (
  playerResults &&
  Array.isArray(playerResults.contents) &&
  playerResults.contents.length > 0
) {
  const normalizedPrompt =
    cleanPrompt.toLowerCase();

  const player =
    playerResults.contents.find(p => {
      const name =
        String(p.displayName || '')
          .toLowerCase();

      return (
        normalizedPrompt.includes(name) ||
        name.includes(normalizedPrompt)
      );
    }) ||
    playerResults.contents[0];

  return {
    type: 'player',
    id: player.id,
    name: player.displayName,
    team: player.subtitle,
    sport: player.sport,
    image:
      player.image?.default ||
      null
  };
}
      if (playerResults && playerResults.contents && playerResults.contents.length > 0) {
        const player = playerResults.contents[0];
        return {
          type: 'player',
          id: player.id,
          name: player.displayName,
          team: player.subtitle,
          sport: player.sport,
          image: player.image?.default || null
        };
      }

      const teamResults = response.data.results.find(r => r.type === 'team');
      if (teamResults && teamResults.contents && teamResults.contents.length > 0) {
        const team = teamResults.contents[0];
        return {
          type: 'team',
          id: team.id,
          name: team.displayName,
          sport: team.sport,
          image: team.image?.default || null
        };
      }

      return null; // Generic / No real entity found
    } catch (error) {
      console.error('Error in EntityDb:', error.message);
      return null;
    }
  }
}

module.exports = new EntityDb();
