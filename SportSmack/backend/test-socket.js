const axios = require('axios');
const { io } = require('socket.io-client');

async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {email:'testuser@test.com', password:'password'});
    const token = res.data.token;
    
    console.log("Token retrieved.");
    
    const socket = io('http://localhost:5000', {auth: {token}});
    socket.on('connect_error', err => {
      console.log('Connect Error:', err.message);
      process.exit(1);
    });
    socket.on('connect', () => {
      console.log('Connected to socket!');
      
      console.log('Joining game...');
      // Use an ncaam game, e.g. gameId 12345
      socket.emit('join_game', { league: 'ncaam', gameId: '401581111' }, (response) => {
        console.log('Join Game Response:', response);
        process.exit(0);
      });
    });
  } catch (e) {
    console.error('Test failed:', e.response?.data || e.message);
  }
}
test();
