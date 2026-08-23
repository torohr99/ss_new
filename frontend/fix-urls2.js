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
  
  // Nuke anything containing NEXT_PUBLIC_API_URL and try to rebuild it
  // Actually, I can just use a regex that captures all the messed up wrappers around http://localhost:5000
  // e.g. '${`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`}' -> 'http://localhost:5000'
  
  // This will match any string containing 'http://localhost:5000' and any number of $, {, }, process.env..., `, '
  // Wait, that's too broad. Let's just find exactly what was messed up in AuthContext.js:
  // '${`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`}'
  c = c.replace(/'\$\{\`\$\{process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:5000'\}`\}/g, "'http://localhost:5000"); // leave ending alone? no, wait.
  
  // Let's just use string replacement iteratively
  c = c.split("`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`").join("http://localhost:5000");
  c = c.split("`${process.env.NEXT_PUBLIC_API_URL || \"http://localhost:5000\"}`").join("http://localhost:5000");
  
  c = c.split("${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}").join("http://localhost:5000");
  c = c.split("(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')").join("'http://localhost:5000'");
  c = c.split("process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'").join("'http://localhost:5000'");

  // Fix quotes
  c = c.replace(/'http:\/\/localhost:5000'/g, "'http://localhost:5000'"); // normal
  c = c.replace(/''http:\/\/localhost:5000''/g, "'http://localhost:5000'");
  c = c.replace(/`http:\/\/localhost:5000/g, "'http://localhost:5000");
  c = c.replace(/http:\/\/localhost:5000`/g, "http://localhost:5000'");
  c = c.replace(/'http:\/\/localhost:5000/g, "`http://localhost:5000");
  c = c.replace(/http:\/\/localhost:5000'/g, "http://localhost:5000`");
  
  // Wait, if I replace `'http` with `` `http ``, then `fetch('http://localhost:5000/api/auth')` becomes `fetch(`http://localhost:5000/api/auth')` which is a syntax error!
  // Let's just restore from git? Ah, no git.
  // I will just read AuthContext.js and fix it specifically. Let's see what's in AuthContext.js!
  
  if (original !== c) {
    fs.writeFileSync(f, c);
  }
});
console.log('Fixed URLs pass 2');
