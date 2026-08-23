const axios = require('axios');
axios.get('http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams').then(res => {
  console.log('Length:', res.data.sports[0].leagues[0].teams.length);
});
