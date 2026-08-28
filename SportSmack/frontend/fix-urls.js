const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./app').concat(walk('./components'));

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let original = c;
  
  // Try to aggressively remove all the broken permutations and restore them to plain http://localhost:5000
  // Permutation 1: '... || `${... || 'http...'}`}'
  c = c.replace(/'\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*`\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'`\}`\}/g, "'http://localhost:5000'");
  
  // Permutation 2: `${... || `${... || 'http...'}`}`
  c = c.replace(/`\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*`\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'`\}`\}/g, "'http://localhost:5000'");

  // Permutation 3: `${... || 'http...'}`
  c = c.replace(/`\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'\}`/g, "'http://localhost:5000'");
  
  // Permutation 4: (process.env... || 'http...')
  c = c.replace(/\(process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'\)/g, "'http://localhost:5000'");
  
  // Permutation 5: process.env... || 'http...'
  c = c.replace(/process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'/g, "'http://localhost:5000'");
  
  // Fix leftover single quotes that were around backticks if any
  c = c.replace(/''http:\/\/localhost:5000''/g, "'http://localhost:5000'");
  
  // Now apply the CORRECT, single replacement
  // We want to replace 'http://localhost:5000/api/xyz' with `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/xyz` (using backticks)
  // And "http://localhost:5000/api/xyz" -> `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/xyz`
  // And `http://localhost:5000/api/xyz` -> `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/xyz`
  
  // Let's just find exactly http://localhost:5000 inside ANY quote type, and replace the whole quote block
  c = c.replace(/(['"`])http:\/\/localhost:5000(.*?)\1/g, (match, quote, path) => {
     return `\`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${path}\``;
  });
  
  // Socket.io cases: io('http://localhost:5000') or io("http://localhost:5000")
  // The above regex will catch io('http://localhost:5000') and convert it to io(`${process.env...}`) which is perfectly valid JS!
  // Same for fetch('http://localhost:5000/api') -> fetch(`${process.env...}/api`)
  // Let's write it out safely.
  
  if (original !== c) {
    fs.writeFileSync(f, c);
  }
});
console.log('Fixed URLs');
