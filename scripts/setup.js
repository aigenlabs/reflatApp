const { execSync } = require('child_process');

// Install frontend and functions dependencies (clean install)
execSync('npm --prefix reflat/frontend/reflat-ui ci', { stdio: 'inherit' });
execSync('npm --prefix reflat/backend/firebasefunctions ci', { stdio: 'inherit' });

console.log('✅ Dependencies installed for frontend and functions');