const api = require('./services/sportsApi.js');
api.getTeamDetails('baseball', 'college-baseball', 'Blue Devils', 'Duke').then(res => {
  console.log('Duke Baseball:', res);
});
