const api = require('./services/sportsApi.js');
api.getStandings('ncaam').then(res => {
  console.log('ncaam:', res.slice(0, 2));
});
