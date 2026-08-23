const axios = require('axios');
const jwt = require('jsonwebtoken');
async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {email:'testuser@test.com', password:'password'});
    const token = res.data.token;
    console.log('Token length:', token.length);
    const decoded = jwt.verify(token, 'fallback_secret_do_not_use_in_prod');
    console.log('Decoded:', decoded);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
