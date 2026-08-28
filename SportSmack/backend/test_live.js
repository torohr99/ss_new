const api = require('./services/sportsApi.js');
api.getScoreboard('mlb').then(games => {
  const live = games.find(g => g.isLive) || games[0];
  if (live) {
    api.getGameSummary('baseball', 'mlb', live.id).then(res => {
      const comp = res.header.competitions[0].competitors[0];
      console.log('Competitor id:', comp.id);
      console.log('Competitor team id:', comp.team ? comp.team.id : undefined);
    });
  } else {
    console.log('No games');
  }
});
