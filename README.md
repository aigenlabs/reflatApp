# reflat

This repo tracks only the application code for the Reflat project inside the `reflat/` folder:

- `reflat/backend/` — Firebase Functions (TypeScript), data, and backend utilities
- `reflat/frontend/` — React app (in `reflat-ui/`)

What is excluded
- `node_modules/`, build artifacts (`build/`, `dist/`, `lib/`), caches and logs
- Local environment files (`.env*`)
- Firebase debug logs
- Sensitive credentials like `backend/serviceAccountKey.json`

Local setup
- Frontend: `cd reflat/frontend/reflat-ui && npm ci && npm start`
- Backend (functions): `cd reflat/backend/firebasefunctions && npm ci && npm run build`

Deploy
- First set your project once (recommended):
  - `firebase login`
  - `firebase use <your-project-id>` (repo root)
  - `cd reflat/backend/firebasefunctions && firebase use <your-project-id>`
- Or pass the project via env var for each deploy: `FIREBASE_PROJECT=<your-project-id>`
- Frontend (Hosting): `npm run deploy:hosting`
- Frontend (Hosting only, no build): `npm run deploy:hosting:only`
- Functions: `npm run deploy:functions`
- Both: `npm run deploy:all`
 
Staging/Production shortcuts
- Staging (all): `npm run deploy:staging`
- Staging hosting: `npm run deploy:staging:hosting`
- Staging functions: `npm run deploy:staging:functions`
- Production (all): `npm run deploy:prod`
- Production hosting: `npm run deploy:prod:hosting`
- Production functions: `npm run deploy:prod:functions`
 
Hosting rewrites
- Root `firebase.json` routes `/api/**` to the Cloud Function `api` and all other paths to `index.html`.
- Frontend now calls relative API path `/api/...` so it works per environment without code changes.

Notes
- Ensure you never commit secrets. The `.gitignore` already excludes common secret file patterns.
- If you need additional assets or data to be excluded, extend `.gitignore` accordingly.
 
Firebase project config
- Root `.firebaserc` includes a placeholder. Replace `__SET_YOUR_PROJECT_ID__` or run `firebase use <id>`.

CI
- Frontend CI builds on PRs and pushes to main.
- Deploy workflows (Hosting, Functions) are included. Before using:
  - Set repo secrets: `FIREBASE_TOKEN` (from `firebase login:ci`) and `FIREBASE_PROJECT_ID` (your project id)
  - Then trigger from Actions tab or push to main
 
Monitoring & Health
- Health endpoint: `/api/health` returns `{ ok: true }` with a timestamp. Useful for uptime checks.
- Logs: Functions emit structured logs (request path, counts). View in Google Cloud Logging for your project.
 
Prod/Staging Deploy Checklist
- Secrets: Ensure `ADMIN_API_KEY` and `OPENAI_API_KEY` are set (per project) via `firebase functions:secrets:set`.
- APIs: Secret Manager API must be enabled per project.
- Hosting rewrite: Verify `/api{,/**}` → `api` exists in `firebase.json` for whichever directory you deploy from.
- Data: Ensure Firestore has the needed docs/collections:
  - `config/serviceable` or `config/serviceable_projects`
  - `locations/projects` (with `prj_locations`)
  - `builders/{builder}/projects/{project}` for project details
- Deploy:
  - Staging: `npm run deploy:staging` (or `deploy:staging:hosting` / `deploy:staging:functions`)
  - Prod: `npm run deploy:prod` (or hosting/functions variants)
