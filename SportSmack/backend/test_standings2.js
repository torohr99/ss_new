const api = require('./services/sportsApi.js');
api.getStandings('ncaam').then(res => {
  const duke = res.find(t => t.id === '150');
  console.log('Duke standings:', duke);
});
