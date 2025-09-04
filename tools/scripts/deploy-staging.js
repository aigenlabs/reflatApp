const { execSync } = require('child_process');

// Build and deploy Hosting + Functions to staging (no rules)
execSync('FIREBASE_PROJECT=reflat-staging node scripts/deployHostingFunctions.js', { stdio: 'inherit', cwd: __dirname + '/..' });