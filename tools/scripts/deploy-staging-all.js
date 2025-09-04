const { execSync } = require('child_process');

// Build and deploy ALL resources to staging, including rules (opt-in)
execSync('ALLOW_RULES_DEPLOY=1 FIREBASE_PROJECT=reflat-staging node scripts/deployAll.js', { stdio: 'inherit', cwd: __dirname + '/..' });