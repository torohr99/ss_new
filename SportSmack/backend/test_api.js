const api = require('./services/sportsApi.js');
api.getTeamDetails('basketball', 'mens-college-basketball', 'Blue Devils').then(res => {
  console.log('Blue Devils:', res);
});
api.getTeamDetails('basketball', 'mens-college-basketball', 'Duke').then(res => {
  console.log('Duke:', res);
});
