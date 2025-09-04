# Seeding tools for Reflat

This folder contains tools to upload project media and seed sample projects into Firestore.

Files
- `upload_via_signed_url.js` — Node uploader that uses your backend endpoints:
  - `POST /api/create_upload_url` → returns a signed v4 PUT URL
  - `PUT` file bytes to the returned signed URL
  - `POST /api/notify_upload` → write metadata into Firestore
- `.env.example` — example environment variables for the uploader

Prerequisites
- Node 18+ recommended (global `fetch` available). If using Node <18, install `node-fetch`.
- Your backend Cloud Functions deployed and reachable (API_BASE).
- `tools/seed/.env` should exist (copy from `.env.example`) and must NOT be committed.

Environment variables (summary)
- API_BASE / API_BASE_<ENV> (e.g. API_BASE_STAGING)
- SEED_ADMIN_KEY / SEED_ADMIN_KEY_<ENV>
- SEED_BEARER / SEED_BEARER_<ENV>
- BUILDER_ID, PROJECT_ID, MEDIA_ROOT, CONCURRENCY
- DRY_RUN, SKIP_NOTIFY, NODE_ENV
- BATCH_FILE — CSV file with lines `builderId,projectId,mediaRoot(optional)`
- PARALLEL_PAIRS — number of pairs to process concurrently when using batch
- ENV or SEED_ENV or --env to pick environment (staging/prod)

Quick start
1. Copy example env and fill values (DO NOT COMMIT):

   cp tools/seed/.env.example tools/seed/.env
   # edit tools/seed/.env and set API_BASE (or API_BASE_STAGING/PROD) and SEED_ADMIN_KEY(s)

2. Load env into your shell:

   source tools/seed/.env

3. Run uploader for one pair (uses BUILDER_ID, PROJECT_ID, MEDIA_ROOT from env if not passed as CLI)

   # default (local):
   node tools/seed/upload_via_signed_url.js

   # specify environment (prefers API_BASE_<ENV> and SEED_ADMIN_KEY_<ENV>):
   ENV=staging node tools/seed/upload_via_signed_url.js

   # override with CLI args:
   node tools/seed/upload_via_signed_url.js --builderId=builder123 --projectId=projA --root=tools/seed/builder123/projA/media --apiBase=https://... 

Batch uploads
- Prepare a CSV file (no header), one pair per line. Fields: builderId,projectId,mediaRoot(optional)
  Example `tools/seed/batch.csv`:

    builderA,project1
    builderB,project2,tools/seed/builderB/project2/media

- Run batch with concurrency across pairs:

    node tools/seed/upload_via_signed_url.js --batch=tools/seed/batch.csv --parallelPairs=3

- The script writes per-pair `tools/seed/<builderId>/<projectId>/uploaded_manifest.json` and a batch summary `tools/seed/batch_result_<ts>.json` in the repo.

Notes and tips
- `DRY_RUN=true` is useful for verifying file discovery and manifest generation without network calls.
- For many files, increase `CONCURRENCY` but watch memory and network limits.
- Keep `tools/seed/.env` out of git (already in .gitignore).
- The uploader expects backend endpoints to allow requests from localhost or be authorized with `SEED_ADMIN_KEY`/Bearer token.

Examples
- Single pair using .env values:

    source tools/seed/.env
    node tools/seed/upload_via_signed_url.js

- Upload to staging using env-specific vars in .env:

    # set API_BASE_STAGING and SEED_ADMIN_KEY_STAGING in tools/seed/.env
    ENV=staging source tools/seed/.env
    ENV=staging node tools/seed/upload_via_signed_url.js

- Batch example:

    node tools/seed/upload_via_signed_url.js --batch=tools/seed/batch.csv --parallelPairs=4

---

## Pipeline Runner (`run_pipeline.js`)

The `run_pipeline.js` script provides an end-to-end pipeline for seeding a project:
1.  Generates a `manifest.json` for project media.
2.  Uploads media to a Google Cloud Storage bucket.
3.  Seeds project data into Firestore.

**Prerequisites:**
- Create a `reflat/tools/seed/.env` file (you can copy from `reflat/tools/seed/.env.example`).
- In the `.env` file, set `GOOGLE_APPLICATION_CREDENTIALS_STAGING` and `GOOGLE_APPLICATION_CREDENTIALS_PROD` to point to your service account keys.
- Also in the `.env` file, set `GS_BUCKET_STAGING` and `GS_BUCKET_PROD` to your environment-specific bucket names.
- The `npm` scripts use `dotenv-cli` to automatically load these variables.

**Usage via npm:**
The root `package.json` provides convenient scripts to run the pipeline for different environments.

- **Staging:** `npm run pipeline:staging -- <builderId> <projectId>`
- **Production:** `npm run pipeline:prod -- <builderId> <projectId>`

You can pass additional flags supported by `run_pipeline.js` (like `--dry-run`) after the `projectId`.

**Example for Staging:**
This command runs the full pipeline for the `myhome/akrida` project against the staging environment. It uses the `pipeline:staging` script, which automatically handles loading environment variables from `.env` and setting the environment to staging.

`npm run pipeline:staging -- myhome akrida`

**Direct Usage (without npm script):**
If you prefer to run the script directly without using the npm script, you can use the following command:
`node tools/seed/run_pipeline.js <builderId> <projectId> [--env staging|prod] [--bucket my-bucket] [--dry-run]`
