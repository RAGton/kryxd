const fs = require('fs');
const path = require('path');

const file = path.join('/home/rocha/kryonix/kryonix-dev/repos/kryxd/ui/src/components/TimezoneMap.jsx');
let content = fs.readFileSync(file, 'utf8');

// replace the transition:
content = content.replace(/transform 0\.8s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/g, 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)');

fs.writeFileSync(file, content, 'utf8');
console.log("Map transition fixed.");
