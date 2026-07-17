const fs = require('fs');
const path = require('path');

const dir = '/home/rocha/kryonix/kryxd/ui/src/pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(f => {
  const fullPath = path.join(dir, f);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  content = content.replace(/shadow-\[0_4px_24px_rgba\(0,0,0,0\.4\)\]/g, '');
  content = content.replace(/shadow-\[0_2px_12px_rgba\(0,0,0,0\.2\)\]/g, '');
  content = content.replace(/border-apple-border\/50/g, '');
  content = content.replace(/border border-apple-border border border-apple-border/g, 'border border-apple-border');
  content = content.replace(/LAN\/PXE/g, 'LAN');
  
  // Clean up excessive whitespace in className strings caused by removals
  content = content.replace(/className="([^"]+)"/g, (match, classes) => {
    return `className="${classes.replace(/\s+/g, ' ').trim()}"`;
  });

  fs.writeFileSync(fullPath, content, 'utf8');
});
console.log("Cleanup done.");
