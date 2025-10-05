const { execSync } = require('child_process');

const project = process.env.FIREBASE_PROJECT;

if (!project) {
  console.error('❌ FIREBASE_PROJECT environment variable not set.');
  process.exit(1);
}

console.log(`ℹ️ Deploying functions to project "${project}"`);

// Deploy only functions
execSync(`firebase deploy --only functions -P ${project}`, { stdio: 'inherit' });

console.log('✅ Functions deployed successfully');
