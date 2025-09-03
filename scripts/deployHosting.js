const { execSync } = require('child_process');

const project = process.env.FIREBASE_PROJECT;

if (!project) {
  console.error('❌ FIREBASE_PROJECT environment variable not set.');
  process.exit(1);
}

// Determine hosting target based on project ID
const hostingTarget = project.includes('staging') ? 'reflat-ui-staging' : 'reflat-ui-prod';

console.log(`ℹ️ Deploying hosting target "${hostingTarget}" to project "${project}"`);

const symlinkPath = 'reflat/frontend/reflat-ui/public/data';

try {
  // Temporarily remove the symlink before building to prevent build errors.
  console.log(`ℹ️ Temporarily removing symlink at ${symlinkPath}...`);
  execSync(`rm -f ${symlinkPath}`);

  // As per your feedback, removing `rm -rf node_modules` for better performance.
  // Using `npm install` instead of `npm ci` can be more resilient to certain cache-related issues
  // that were causing errors before.
  console.log('ℹ️ Installing frontend dependencies and building application...');
  execSync('cd reflat/frontend/reflat-ui && npm install && npm run build', { stdio: 'inherit' });

  // Deploy to Firebase hosting
  console.log('ℹ️ Deploying to Firebase Hosting...');
  execSync(`firebase deploy --only hosting:${hostingTarget} -P ${project}`, { stdio: 'inherit' });

  console.log('✅ Hosting deployed successfully');
} catch (error) {
  console.error('❌ Error deploying hosting:', error);
  process.exit(1);
} finally {
  // Restore the symlink for local development, regardless of whether the deploy succeeded or failed.
  console.log(`ℹ️ Restoring symlink at ${symlinkPath}...`);
  // Note: This assumes the script is run from the root of the monorepo.
  execSync(`ln -s ../../../tools/data ${symlinkPath}`);
  console.log('ℹ️ Symlink restored.');
}
