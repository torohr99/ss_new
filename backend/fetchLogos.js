const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOURNAMENT_TEAMS = {
  East: [
    { seed: 1, name: 'UConn', id: 'e1' }, { seed: 16, name: 'Stetson', id: 'e16' },
    { seed: 8, name: 'FAU', id: 'e8' }, { seed: 9, name: 'Northwestern', id: 'e9' },
    { seed: 5, name: 'San Diego St', id: 'e5' }, { seed: 12, name: 'UAB', id: 'e12' },
    { seed: 4, name: 'Auburn', id: 'e4' }, { seed: 13, name: 'Yale', id: 'e13' },
    { seed: 6, name: 'BYU', id: 'e6' }, { seed: 11, name: 'Duquesne', id: 'e11' },
    { seed: 3, name: 'Illinois', id: 'e3' }, { seed: 14, name: 'Morehead St', id: 'e14' },
    { seed: 7, name: 'Washington St', id: 'e7' }, { seed: 10, name: 'Drake', id: 'e10' },
    { seed: 2, name: 'Iowa St', id: 'e2' }, { seed: 15, name: 'South Dakota St', id: 'e15' }
  ],
  West: [
    { seed: 1, name: 'North Carolina', id: 'w1' }, { seed: 16, name: 'Wagner', id: 'w16' },
    { seed: 8, name: 'Mississippi St', id: 'w8' }, { seed: 9, name: 'Michigan St', id: 'w9' },
    { seed: 5, name: 'Saint Mary\'s', id: 'w5' }, { seed: 12, name: 'Grand Canyon', id: 'w12' },
    { seed: 4, name: 'Alabama', id: 'w4' }, { seed: 13, name: 'Charleston', id: 'w13' },
    { seed: 6, name: 'Clemson', id: 'w6' }, { seed: 11, name: 'New Mexico', id: 'w11' },
    { seed: 3, name: 'Baylor', id: 'w3' }, { seed: 14, name: 'Colgate', id: 'w14' },
    { seed: 7, name: 'Dayton', id: 'w7' }, { seed: 10, name: 'Nevada', id: 'w10' },
    { seed: 2, name: 'Arizona', id: 'w2' }, { seed: 15, name: 'Long Beach St', id: 'w15' }
  ],
  South: [
    { seed: 1, name: 'Houston', id: 's1' }, { seed: 16, name: 'Longwood', id: 's16' },
    { seed: 8, name: 'Nebraska', id: 's8' }, { seed: 9, name: 'Texas A&M', id: 's9' },
    { seed: 5, name: 'Wisconsin', id: 's5' }, { seed: 12, name: 'James Madison', id: 's12' },
    { seed: 4, name: 'Duke', id: 's4' }, { seed: 13, name: 'Vermont', id: 's13' },
    { seed: 6, name: 'Texas Tech', id: 's6' }, { seed: 11, name: 'NC State', id: 's11' },
    { seed: 3, name: 'Kentucky', id: 's3' }, { seed: 14, name: 'Oakland', id: 's14' },
    { seed: 7, name: 'Florida', id: 's7' }, { seed: 10, name: 'Colorado', id: 's10' },
    { seed: 2, name: 'Marquette', id: 's2' }, { seed: 15, name: 'Western Kentucky', id: 's15' }
  ],
  Midwest: [
    { seed: 1, name: 'Purdue', id: 'm1' }, { seed: 16, name: 'Grambling', id: 'm16' },
    { seed: 8, name: 'Utah St', id: 'm8' }, { seed: 9, name: 'TCU', id: 'm9' },
    { seed: 5, name: 'Gonzaga', id: 'm5' }, { seed: 12, name: 'McNeese', id: 'm12' },
    { seed: 4, name: 'Kansas', id: 'm4' }, { seed: 13, name: 'Samford', id: 'm13' },
    { seed: 6, name: 'South Carolina', id: 'm6' }, { seed: 11, name: 'Oregon', id: 'm11' },
    { seed: 3, name: 'Creighton', id: 'm3' }, { seed: 14, name: 'Akron', id: 'm14' },
    { seed: 7, name: 'Texas', id: 'm7' }, { seed: 10, name: 'Colorado St', id: 'm10' },
    { seed: 2, name: 'Tennessee', id: 'm2' }, { seed: 15, name: 'Saint Peter\'s', id: 'm15' }
  ]
};

async function fetchLogos() {
  const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400`);
  const teamsList = response.data.sports[0].leagues[0].teams;

  for (const region in TOURNAMENT_TEAMS) {
    for (const team of TOURNAMENT_TEAMS[region]) {
      const espnTeam = teamsList.find(t => 
        (t.team.displayName && t.team.displayName.toLowerCase().includes(team.name.toLowerCase())) || 
        (t.team.name && t.team.name.toLowerCase().includes(team.name.toLowerCase()))
      );
      if (espnTeam) {
        team.logo = espnTeam.team.logos ? espnTeam.team.logos[0].href : null;
        team.color = '#' + (espnTeam.team.color || '121212');
      } else {
        team.logo = 'https://a.espncdn.com/i/teamlogos/ncaa/500/2.png';
        team.color = '#333333';
      }
    }
  }

  const p = path.join(__dirname, '../frontend/app/hubs/brackets/teams.json');
  fs.writeFileSync(p, JSON.stringify(TOURNAMENT_TEAMS, null, 2));
  console.log('Saved to teams.json');
}

fetchLogos();
