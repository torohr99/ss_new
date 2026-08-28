const fs = require('fs'); 
const path = require('path'); 
const files = [
  'app/context/AuthContext.js', 
  'app/explore/page.js', 
  'app/fantasy/draft/[id]/page.js', 
  'app/fantasy/league/[id]/page.js', 
  'app/fantasy/page.js', 
  'app/forums/page.js', 
  'app/game/[league]/[id]/page.js', 
  'app/hubs/brackets/page.js', 
  'app/notifications/page.js', 
  'app/onboarding/page.js', 
  'app/profile/[id]/page.js', 
  'app/scores/page.js', 
  'app/settings/page.js', 
  'app/team/[id]/page.js', 
  'app/verify/page.js', 
  'components/CreatePost.js', 
  'components/Feed.js', 
  'components/GlobalSearch.js', 
  'components/PostCard.js', 
  'components/RightSidebar.js'
]; 
files.forEach(f => { 
  const p = path.join('./', f); 
  if(!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8'); 
  // Replace string literals 'http://localhost:5000' and "http://localhost:5000"
  c = c.replace(/['"]http:\/\/localhost:5000['"]/g, `(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')`); 
  // Replace within template literals `http://localhost:5000/...`
  c = c.replace(/http:\/\/localhost:5000/g, `\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`); 
  // The above replace might mess up the first replace if not careful, but since we already replaced the string literals,
  // the remaining occurrences of http://localhost:5000 are likely inside template literals. 
  // Wait, if we replace the string literals first with (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'),
  // the second replace will see 'http://localhost:5000' inside the fallback and replace IT TOO!
  // Let's be smart: just replace all occurrences of `http://localhost:5000` with `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`
  // But wait, what if it's NOT in a template literal? Then `${...}` inside a regular string doesn't work.
  // Actually, replacing all `'http://localhost:5000/api...'` with `` `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api...` `` is the safest!
  
  c = c.replace(/['"]http:\/\/localhost:5000(.*?)(['"])/g, (match, p1, p2) => {
    return `\`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${p1}\``;
  });

  // Now replace any `http://localhost:5000` already inside backticks:
  c = c.replace(/`http:\/\/localhost:5000(.*?)`/g, (match, p1) => {
    return `\`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${p1}\``;
  });
  
  // And for socket connections which might just be io('http://localhost:5000')
  c = c.replace(/io\((['"])http:\/\/localhost:5000\1/g, `io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'`);

  fs.writeFileSync(p, c); 
}); 
console.log('Replaced localhost:5000 in frontend files.');
