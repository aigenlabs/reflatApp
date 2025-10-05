const { execSync } = require('child_process');

const project = process.env.FIREBASE_PROJECT;

if (!project) {
  console.error('❌ FIREBASE_PROJECT environment variable not set.');
  process.exit(1);
}

// Determine hosting target based on project ID
const hostingTarget = project.includes('staging') ? 'reflat-ui-staging' : 'reflat-ui-prod';

console.log(`ℹ️ Deploying functions and hosting to project "${project}"`);

// Deploy functions
console.log('ℹ️ Deploying functions...');
execSync(`firebase deploy --only functions -P ${project}`, { stdio: 'inherit' });

// Deploy hosting
console.log('ℹ️ Deploying hosting...');
execSync(`firebase deploy --only hosting:${hostingTarget} -P ${project}`, { stdio: 'inherit' });

console.log('✅ All deployments completed successfully');
