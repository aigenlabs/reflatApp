const { execSync } = require('child_process');

// Start frontend in dev mode
execSync('npm --prefix reflat/frontend/reflat-ui start', { stdio: 'inherit' });