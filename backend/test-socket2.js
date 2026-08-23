const axios = require('axios');
const { io } = require('socket.io-client');
const api = require('./services/sportsApi.js');

async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {email:'testuser@test.com', password:'password'});
    const token = res.data.token;
    const socket = io('http://localhost:5000', {auth: {token}});
    
    socket.on('connect', async () => {
      // Find a real game to join!
      const games = await api.getScoreboard('mlb');
      const game = games.find(g => g.isLive) || games[0];
      const gameId = game.id;
      
      socket.emit('join_game', { league: 'mlb', gameId }, (response) => {
        console.log('Joined game:', response.success, response.readOnly);
        
        socket.emit('send_message', { league: 'mlb', gameId, content: 'Test message!' }, (res2) => {
          console.log('Send message response:', res2);
          process.exit(0);
        });
      });
    });
  } catch (e) {
    console.error('Test failed:', e.message);
  }
}
test();
