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

  // Let's find ANY fetch, axios, or socket connection that was modified and reset it to a clean state.
  // The simplest is to replace any string that matches:
  // '${`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`}'
  // with
  // `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`
  
  c = c.replace(/['"]\$\{\`\$\{process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:5000'\}\`\}(.*?)['"]/g, (match, p1) => {
      return `\`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${p1}\``;
  });

  // What if it is io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')? That should be fine.
  // Let's also check for `${`${...}`}`
  c = c.replace(/\$\{\`\$\{process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:5000'\}\`\}/g, "${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}");

  if (original !== c) {
    fs.writeFileSync(f, c);
  }
});
console.log('Fixed syntax errors');
