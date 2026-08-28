const axios = require('axios');

async function testFeatures() {
  const email = `testuser_${Date.now()}@test.com`;
  
  try {
    // 1. Register
    const regRes = await axios.post('http://localhost:5000/api/auth/register', {
      username: 'TestUser',
      email: email,
      password: 'password'
    });
    console.log('Registered:', regRes.data.username);
    const cookie = regRes.headers['set-cookie'][0];
    
    // 2. Auth me
    const meRes = await axios.get('http://localhost:5000/api/auth/me', { headers: { Cookie: cookie } });
    console.log('Auth Me works:', meRes.data.username);
    
    // 3. Teams
    const teamsRes = await axios.get('http://localhost:5000/api/teams', { headers: { Cookie: cookie } });
    console.log('Teams length:', teamsRes.data.length);
    
    // 4. Feed
    const feedRes = await axios.get('http://localhost:5000/api/users/feed/news', { headers: { Cookie: cookie } });
    console.log('Feed works:', feedRes.data.length);
    
  } catch (err) {
    console.error('Error during testing:', err.response ? err.response.data : err.message);
  }
}

testFeatures();
