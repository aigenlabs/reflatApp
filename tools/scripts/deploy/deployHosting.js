const { execSync } = require('child_process');

const project = process.env.FIREBASE_PROJECT;

if (!project) {
  console.error('❌ FIREBASE_PROJECT environment variable not set.');
  process.exit(1);
}

// Determine hosting target based on project ID
const hostingTarget = project.includes('staging') ? 'reflat-ui-staging' : 'reflat-ui-prod';

console.log(`ℹ️ Deploying hosting target "${hostingTarget}" to project "${project}"`);

// Deploy to Firebase hosting
execSync(`firebase deploy --only hosting:${hostingTarget} -P ${project}`, { stdio: 'inherit' });

console.log('✅ Hosting deployed successfully');
