# reflat

This repo tracks only the application code for the Reflat project inside the `reflat/` folder:

- `reflat/backend/` — Firebase Functions (TypeScript), data, and backend utilities
- `reflat/frontend/` — React app (in `reflat-ui/`)

What is excluded
- `node_modules/`, build artifacts (`build/`, `dist/`, `lib/`), caches and logs
- Local environment files (`.env*`)
- Firebase emulator logs and debug files
- Sensitive credentials like `backend/serviceAccountKey.json`

Local setup
- Frontend: `cd reflat/frontend/reflat-ui && npm ci && npm start`
- Backend (functions): `cd reflat/backend/firebasefunctions && npm ci && npm run build`

Deploy
- Frontend (Firebase Hosting):
  - From app dir: `cd reflat/frontend/reflat-ui && npm run build && firebase deploy --only hosting`
  - Or from repo root (uses root `firebase.json`):
    - `npm --prefix reflat/frontend/reflat-ui run build`
    - `firebase deploy --only hosting`
- Functions: from `reflat/backend/firebasefunctions` run `npm run deploy` (or `firebase deploy --only functions`)

Notes
- Ensure you never commit secrets. The `.gitignore` already excludes common secret file patterns.
- If you need additional assets or data to be excluded, extend `.gitignore` accordingly.
