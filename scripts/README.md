Local helper scripts

These scripts mirror the commands in the repo README, without embedding any secrets. They are safe to commit and use locally.

- setup.sh — install dependencies for frontend and functions
- dev.sh — start the frontend in development mode
- deploy-staging.sh — build and deploy hosting + functions to staging
- deploy-prod.sh — build and deploy hosting + functions to prod
- deploy-staging-all.sh — build and deploy ALL resources (incl. rules) to staging
- deploy-prod-all.sh — build and deploy ALL resources (incl. rules) to prod

Usage

- mark scripts executable once:
  chmod +x scripts/local/*.sh

- install deps:
  ./scripts/local/setup.sh

- run dev server:
  ./scripts/local/dev.sh

- deploy staging (hosting + functions only):
  ./scripts/local/deploy-staging.sh

- deploy prod (hosting + functions only):
  ./scripts/local/deploy-prod.sh

- deploy staging (all, including rules):
  ./scripts/local/deploy-staging-all.sh

- deploy prod (all, including rules):
  ./scripts/local/deploy-prod-all.sh

Notes

- These scripts assume Firebase CLI is installed and you are logged in.
- For CI, set FIREBASE_TOKEN. Locally, interactive login is fine.
- The "all" scripts require opt-in (ALLOW_RULES_DEPLOY=1) as a safety guard.
