const axios = require('axios');
const { io } = require('socket.io-client');

async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {email:'test@test.com', password:'password'});
    const cookie = res.headers['set-cookie'][0];
    const tokenRes = await axios.get('http://localhost:5000/api/auth/token', {headers: {Cookie: cookie}});
    const token = tokenRes.data.token;
    
    console.log("Token retrieved:", token.substring(0, 10) + "...");
    
    const socket = io('http://localhost:5000', {auth: {token}});
    socket.on('connect_error', err => console.log('Connect Error:', err.message));
    socket.on('connect', () => {
      console.log('Connected to socket!');
      process.exit(0);
    });
  } catch (e) {
    console.error('Login failed:', e.response?.data || e.message);
  }
}
test();
