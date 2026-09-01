'use strict';

const axios = require('axios');

class EntityDb {
  constructor() {
    this.slangDictionary = {
      yanks: 'New York Yankees',
      bosox: 'Boston Red Sox',
      sox: 'Boston Red Sox',
      niners: 'San Francisco 49ers',
      'forty niners': 'San Francisco 49ers',
      chiefs: 'Kansas City Chiefs',
      pats: 'New England Patriots',
      patriots: 'New England Patriots',
      mavs: 'Dallas Mavericks',
      cavs: 'Cleveland Cavaliers',
      tb12: 'Tom Brady',
      brady: 'Tom Brady',
      lbj: 'LeBron James',
      'king james': 'LeBron James',
      steph: 'Stephen Curry',
      curry: 'Stephen Curry',
      mahomes: 'Patrick Mahomes',
      joker: 'Nikola Jokic',
      jokic: 'Nikola Jokic',
      kd: 'Kevin Durant',
      durant: 'Kevin Durant',
      'the king': 'LeBron James'
    };
  }

  expandSlang(prompt) {
    let expanded = String(prompt || '');

    const entries = Object.entries(this.slangDictionary)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [slang, official] of entries) {
      const escaped = slang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expanded = expanded.replace(
        new RegExp(`\\b${escaped}\\b`, 'gi'),
        official
      );
    }

    return expanded;
  }

  async search(query) {
    try {
      const response = await axios.get(
        'http://site.api.espn.com/apis/search/v2',
        {
          params: {
            query,
            limit: 10
          },
          timeout: 10000
        }
      );

      return response.data?.results || [];
    } catch (error) {
      console.error(
        `ESPN entity search failed for "${query}":`,
        error.message
      );
      return [];
    }
  }

  scoreResult(result, query) {
    const text = JSON.stringify(result).toLowerCase();
    const q = query.toLowerCase();

    let score = 0;

    if (text.includes(q)) score += 100;

    const words = q
      .split(/\s+/)
      .filter(word => word.length >= 3);

    for (const word of words) {
      if (text.includes(word)) score += 10;
    }

    return score;
  }

  async identifyEntities(prompt) {
    const expanded = this.expandSlang(prompt);

    // Search several portions of the prompt rather than only
    // the first four words.
    const words = expanded.split(/\s+/).filter(Boolean);

    const queries = new Set();

    queries.add(expanded);

    for (let i = 0; i < words.length; i++) {
      for (let length = 2; length <= 4; length++) {
        const phrase = words.slice(i, i + length).join(' ');
        if (phrase.length >= 4) {
          queries.add(phrase);
        }
      }
    }

    const candidates = [];

    for (const query of queries) {
      const results = await this.search(query);

      for (const result of results) {
        const score = this.scoreResult(result, query);

        if (result.contents) {
          for (const content of result.contents) {
            candidates.push({
              ...content,
              resultType: result.type,
              score
            });
          }
        }
      }
    }

    // Deduplicate entities.
    const unique = new Map();

    for (const candidate of candidates) {
      const id = String(candidate.id || '');

      if (!id) continue;

      const existing = unique.get(id);

      if (!existing || candidate.score > existing.score) {
        unique.set(id, candidate);
      }
    }

    const ranked = [...unique.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return ranked.map(entity => ({
      id: entity.id,
      type: entity.type || entity.resultType,
      name:
        entity.displayName ||
        entity.fullName ||
        entity.name ||
        'Unknown',
      team:
        entity.subtitle ||
        entity.team?.displayName ||
        entity.team?.name ||
        null,
      sport:
        entity.sport ||
        entity.sportType ||
        null,
      image:
        entity.image?.default ||
        entity.headshot?.href ||
        null,
      score: entity.score
    }));
  }

  async identifyEntity(prompt) {
    const entities = await this.identifyEntities(prompt);

    if (!entities.length) return null;

    return entities[0];
  }
}

module.exports = new EntityDb();
