const { execSync } = require('child_process');

// Build frontend (React app)
execSync('cd reflat/frontend/reflat-ui && npm ci && npm run build', { stdio: 'inherit' });

// Deploy only hosting to the specified Firebase project from the root (where firebase.json is)
const project = process.env.FIREBASE_PROJECT || 'reflat-staging';
execSync(`firebase deploy --only hosting --project ${project}`, { stdio: 'inherit', cwd: __dirname + '/..' });
