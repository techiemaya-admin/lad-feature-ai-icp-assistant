// Script to update all imports in ai-icp-assistant feature
const fs = require('fs');
const path = require('path');

const replacements = [
  {
    from: /require\(['"]\.\.\/\.\.\/shared\/utils\/logger['"]\)/g,
    to: "require('../utils/logger')"
  },
  {
    from: /require\(['"]\.\.\/\.\.\/\.\.\/shared\/utils\/logger['"]\)/g,
    to: "require('../../utils/logger')"
  },
  {
    from: /require\(['"]\.\.\/shared\/utils\/logger['"]\)/g,
    to: "require('./utils/logger')"
  },
  {
    from: /require\(['"]\.\.\/\.\.\/shared\/database\/connection['"]\)/g,
    to: "require('../utils/database')"
  },
  {
    from: /require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/database\/connection['"]\)/g,
    to: "require('../../utils/database')"
  },
  {
    from: /require\(['"]\.\.\/\.\.\/\.\.\/shared\/config['"]\)/g,
    to: "require('../../utils/config')"
  },
  {
    from: /require\(['"]\.\.\/\.\.\/shared\/config['"]\)/g,
    to: "require('../utils/config')"
  }
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  replacements.forEach(({ from, to }) => {
    if (from.test(content)) {
      content = content.replace(from, to);
      modified = true;
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      updateFile(fullPath);
    }
  });
}

// Update ai-icp-assistant feature
const featureDir = path.join(__dirname, 'backend', 'features', 'ai-icp-assistant');
scanDirectory(featureDir);

console.log('Import updates complete!');
