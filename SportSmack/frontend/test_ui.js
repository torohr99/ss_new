const puppeteer = require('puppeteer');

async function testFrontend() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('request', request => {
    if (request.url().includes('localhost:5000/api/')) {
      console.log('API REQUEST:', request.url(), request.headers());
    }
  });
  
  // 1. Go to login page
  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 60000 });
  
  // 2. Log in
  console.log('Logging in...');
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.type('#email', 'testuser@test.com');
  await page.type('#password', 'password');
  await page.click('button[type="submit"]');
  
  // 3. Wait for redirect to home
  console.log('Waiting for redirect...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // 4. Check if token exists in localStorage
  const token = await page.evaluate(() => localStorage.getItem('smack_token'));
  console.log('Token exists:', !!token);
  
  // 5. Go to Explore page
  console.log('Navigating to Explore...');
  await page.goto('http://localhost:3000/explore', { waitUntil: 'networkidle2' });
  
  // 6. See if Teams loaded
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('EXPLORE PAGE TEXT:', pageText);

  const teamsLoaded = !pageText.includes('Not authorized') && !pageText.includes('Failed to load') && pageText.length > 500;
  console.log('Teams loaded properly:', teamsLoaded);
  
  // 7. Check Profile page
  console.log('Navigating to Profile...');
  await page.goto('http://localhost:3000/profile', { waitUntil: 'networkidle2' });
  const profileError = await page.evaluate(() => {
    return document.body.innerText.includes('User not found or error loading profile');
  });
  console.log('Profile page error:', profileError);

  await browser.close();
  console.log('Done.');
}

testFrontend().catch(console.error);
