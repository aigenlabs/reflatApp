const { execSync } = require('child_process');

// Build and deploy ALL resources to prod, including rules (opt-in)
execSync('ALLOW_RULES_DEPLOY=1 FIREBASE_PROJECT=reflat-prod node scripts/deployAll.js', { stdio: 'inherit', cwd: __dirname + '/..' });