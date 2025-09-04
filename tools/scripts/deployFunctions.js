const { execSync } = require('child_process');

// Build backend functions
execSync('cd reflat/backend/firebasefunctions && npm ci && npm run build', { stdio: 'inherit' });

// Deploy only functions to the specified Firebase project
const project = process.env.FIREBASE_PROJECT || 'reflat-staging';
execSync(`cd reflat/backend/firebasefunctions && firebase deploy --only functions --project ${project}`, { stdio: 'inherit' });
