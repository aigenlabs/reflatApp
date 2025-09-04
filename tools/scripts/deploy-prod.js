const { execSync } = require('child_process');

// Build and deploy Hosting + Functions to production (no rules)
execSync('FIREBASE_PROJECT=reflat-prod node scripts/deployHostingFunctions.js', { stdio: 'inherit', cwd: __dirname + '/..' });