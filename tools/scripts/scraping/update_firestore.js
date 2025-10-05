// Update Firestore: upload/merge locations.json and project details to Firestore
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from the current scripts folder so tools/scripts/.env is used.
const scriptEnvDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(scriptEnvDir, '.env') });

// Allow optional CLI args. Expected common usage from npm script:
//   npm run pipeline:staging -- myhome akrida
// In that case the env is determined by the npm script name (pipeline:staging)
// and the args passed after -- are the builder/project. Support also passing
// env explicitly as first arg: node upload_locations_to_firestore.js staging myhome akrida
const rawArgs = process.argv.slice(2) || [];
let CLI_ENV = null, CLI_BUILDER = null, CLI_PROJECT = null;
if (rawArgs.length > 0) {
  const first = String(rawArgs[0] || '').toLowerCase();
  if (['staging', 'prod', 'production', 'dev', 'development'].includes(first)) {
    CLI_ENV = first === 'production' ? 'prod' : (first === 'development' ? 'dev' : first);
    CLI_BUILDER = rawArgs[1] || null;
    CLI_PROJECT = rawArgs[2] || null;
  } else {
    // treat first arg as builder when env is supplied by npm script
    CLI_BUILDER = rawArgs[0] || null;
    CLI_PROJECT = rawArgs[1] || null;
  }
}

// Use SEED_ENV to select the right service account
const env = process.env.SEED_ENV || 'staging';

// Auto-detect environment if SEED_ENV not set
let detectedEnv = env;
// Allow SERVICE_ACCOUNT_STAGING / SERVICE_ACCOUNT_PROD (or alternative names) from env file. If not present, fall back to repo data files.
const defaultStagingKey = path.join(__dirname, '../../data/reflat-staging-firebase-adminsdk.json');
const defaultProdKey = path.join(__dirname, '../../data/reflat-prod-firebase-adminsdk.json');
function resolveKeyPath(envVal, fallback) {
  if (!envVal) return fallback;
  const v = String(envVal).trim();
  if (!v) return fallback;
  try {
    if (path.isAbsolute(v)) return v;
    // resolve relative to the scripts folder so env files can reference local keys
    return path.resolve(scriptEnvDir, v);
  } catch (err) {
    return fallback;
  }
}
// Supported env var names (check multiple common variants)
const stagingKey = resolveKeyPath(process.env.SERVICE_ACCOUNT_STAGING || process.env.STAGING_KEY_PATH || process.env.SERVICE_ACCOUNT_KEY_STAGING, defaultStagingKey);
const prodKey = resolveKeyPath(process.env.SERVICE_ACCOUNT_PROD || process.env.PROD_KEY_PATH || process.env.SERVICE_ACCOUNT_KEY_PROD, defaultProdKey);
if (!process.env.SEED_ENV) {
  if (fs.existsSync(stagingKey) && !fs.existsSync(prodKey)) {
    detectedEnv = 'staging';
  } else if (fs.existsSync(prodKey) && !fs.existsSync(stagingKey)) {
    detectedEnv = 'prod';
  } else if (fs.existsSync(stagingKey) && fs.existsSync(prodKey)) {
    // Prefer staging if both exist
    detectedEnv = 'staging';
  }
}
// If CLI explicitly provided an env, respect it
if (CLI_ENV) {
  detectedEnv = CLI_ENV;
}
// Prepare env file path and load environment-specific .env.<env> from scripts folder if present (overrides tools/scripts/.env)
const envFilePath = path.join(scriptEnvDir, `.env.${detectedEnv}`);
try {
  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath });
    console.log(`[Update Firestore] Loaded environment file: ${envFilePath}`);
  }
} catch (e) {
  console.error('[Update Firestore] Failed loading env file', e && e.message ? e.message : e);
}
// Diagnostic info to help debug failures: print key paths and relevant env vars
console.log(`[Update Firestore] scriptEnvDir: ${scriptEnvDir}`);
console.log(`[Update Firestore] Detected env: ${detectedEnv}`);
console.log(`[Update Firestore] stagingKey: ${stagingKey} exists=${fs.existsSync(stagingKey)}`);
console.log(`[Update Firestore] prodKey: ${prodKey} exists=${fs.existsSync(prodKey)}`);
console.log(`[Update Firestore] locationsPath candidate: ${path.join(__dirname, '../../data/locations.json')} exists=${fs.existsSync(path.join(__dirname, '../../data/locations.json'))}`);
console.log(`[Update Firestore] Relevant env vars: SEED_ENV=${process.env.SEED_ENV || '<unset>'}, STORAGE_BUCKET=${process.env.STORAGE_BUCKET || '<unset>'}, GS_BUCKET_STAGING=${process.env.GS_BUCKET_STAGING || '<unset>'}, GS_BUCKET_PROD=${process.env.GS_BUCKET_PROD || '<unset>'}`);

const serviceAccountPath = detectedEnv === 'staging' ? stagingKey : prodKey;
const locationsPath = path.join(__dirname, '../../data/locations.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account key not found:', serviceAccountPath);
  process.exit(1);
}
if (!fs.existsSync(locationsPath)) {
  console.error('locations.json not found:', locationsPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
console.log(`[Update Firestore] Using service account project_id: ${serviceAccount.project_id} [env: ${detectedEnv}]`);

// Use storage bucket from environment if provided (per-environment env files should export STORAGE_BUCKET)
let storageBucket = process.env.STORAGE_BUCKET || process.env[`STORAGE_BUCKET_${String(detectedEnv || '').toUpperCase()}`] || null;
// Support legacy/alternate GS_BUCKET_* variables present in tools/scripts/.env
if (!storageBucket) {
  if (detectedEnv === 'staging' || detectedEnv === 'dev') {
    storageBucket = process.env.GS_BUCKET_STAGING || process.env.GS_BUCKET || null;
  } else if (detectedEnv === 'prod' || detectedEnv === 'production') {
    storageBucket = process.env.GS_BUCKET_PROD || process.env.GS_BUCKET || null;
  } else {
    storageBucket = process.env.GS_BUCKET || null;
  }
}
// Normalize bucket string (allow gs:// prefixes in env)
if (storageBucket && typeof storageBucket === 'string' && storageBucket.startsWith('gs://')) {
  storageBucket = storageBucket.replace(/^gs:\/\//, '');
}

// Diagnostic: print resolved storage bucket for pipeline debugging
console.log(`[Update Firestore] Resolved storage bucket: ${storageBucket || '<none>'} (env=${detectedEnv})`);

const initOpts = { credential: admin.credential.cert(serviceAccount) };
if (storageBucket) initOpts.storageBucket = storageBucket;

admin.initializeApp(initOpts);

const db = admin.firestore();

// Filters: allow restricting to a single builder/project via CLI or env vars
const FILTER_BUILDER = CLI_BUILDER || process.env.FILTER_BUILDER || null;
const FILTER_PROJECT = CLI_PROJECT || process.env.FILTER_PROJECT || null;
if (FILTER_BUILDER || FILTER_PROJECT) console.log(`[Update Firestore] Filtering projects builder=${FILTER_BUILDER || '*'} project=${FILTER_PROJECT || '*'}`);

// Single-project mode triggered when CLI_BUILDER is provided (typically via npm run pipeline:staging -- myhome akrida)
const SINGLE_MODE = !!CLI_BUILDER;
if (SINGLE_MODE) {
  if (!CLI_PROJECT) {
    console.error('Single-project mode requires both builder and project args. Example: npm run pipeline:staging -- myhome akrida');
    process.exit(1);
  }
  console.log(`[Update Firestore] SINGLE_MODE enabled. Will only process ${CLI_BUILDER}/${CLI_PROJECT} (env=${detectedEnv})`);
  // Require storage bucket when running pipeline for single project to avoid later Cloud Storage errors
  if (!storageBucket) {
    console.error('STORAGE_BUCKET not set for environment. Set STORAGE_BUCKET or STORAGE_BUCKET_<ENV> environment variable before running the pipeline.');
    process.exit(1);
  }
}

// If user provided GOOGLE_APPLICATION_CREDENTIALS directly in env, prefer that and resolve relative paths
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const gac = String(process.env.GOOGLE_APPLICATION_CREDENTIALS).trim();
  try {
    if (!path.isAbsolute(gac)) {
      const candidateScripts = path.resolve(scriptEnvDir, gac);
      const candidateRepo = path.resolve(scriptEnvDir, '..', '..', gac);
      if (fs.existsSync(candidateScripts) && fs.statSync(candidateScripts).isFile()) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = candidateScripts;
        console.log('[Update Firestore] Resolved GOOGLE_APPLICATION_CREDENTIALS to scripts-relative path:', candidateScripts);
      } else if (fs.existsSync(candidateRepo) && fs.statSync(candidateRepo).isFile()) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = candidateRepo;
        console.log('[Update Firestore] Resolved GOOGLE_APPLICATION_CREDENTIALS to repo-root relative path:', candidateRepo);
      } else {
        console.log('[Update Firestore] GOOGLE_APPLICATION_CREDENTIALS provided but file not found at candidate paths. Will fall back to staging/prod keys if present. Candidates:', candidateScripts, candidateRepo);
      }
    } else {
      console.log('[Update Firestore] GOOGLE_APPLICATION_CREDENTIALS is absolute:', gac);
    }
  } catch (e) {
    // ignore
  }
}

async function uploadLocations() {
  // Single-project only mode: determine builder/project from CLI args or FILTER env
  const builderId = CLI_BUILDER || FILTER_BUILDER || null;
  const projectId = CLI_PROJECT || FILTER_PROJECT || null;

  if (!builderId || !projectId) {
    console.error('This script now supports only single-project mode. Provide builder and project via CLI or FILTER_* env vars. Example: npm run pipeline:staging -- myhome akrida');
    process.exit(1);
  }

  console.log(`[Update Firestore] Running single-project write for ${builderId}/${projectId} (env=${detectedEnv})`);

  // Ensure storage bucket is set (required for pipeline validations that rely on Cloud Storage)
  if (!storageBucket) {
    console.error('STORAGE_BUCKET not set for environment. Set STORAGE_BUCKET or STORAGE_BUCKET_<ENV> environment variable before running the pipeline.');
    process.exit(1);
  }

  try {
    const detailsPath = path.join(__dirname, '../../data', builderId, projectId, `${projectId}-details.json`);
    if (!fs.existsSync(detailsPath)) {
      console.error(`Details JSON not found for ${builderId}/${projectId}: ${detailsPath}`);
      process.exit(1);
    }
    const detailsJson = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));

    // Write project doc
    const projDocRef = db.collection('builders').doc(builderId).collection('projects').doc(projectId);
    const toWrite = Object.assign({}, detailsJson, { _updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await projDocRef.set(toWrite, { merge: true });
    console.log(`Wrote project details to Firestore: builders/${builderId}/projects/${projectId}`);

    // Also merge the repo locations.json into Firestore under builders collection
    try {
      const locationsRaw = fs.readFileSync(locationsPath, 'utf8');
      const locationsJson = JSON.parse(locationsRaw);

      // Validate and clean locations data: remove placeholder entries and ensure all have valid structure
      const cleanedLocations = locationsJson.filter(loc => loc && typeof loc === 'object' && Object.keys(loc).length > 0);
      if (cleanedLocations.length !== locationsJson.length) {
        console.log('locations.json contains placeholder/invalid entries. Will upload a cleaned view to Firestore but will NOT overwrite the local file. Please edit tools/data/locations.json manually to persist changes.');
      }

      // Store locations document independently under builders collection: builders/locations
      const targetDocRef = db.collection('builders').doc('locations');
      try {
        const snap = await targetDocRef.get();
        if (snap.exists) {
          await targetDocRef.update({ 
            projects: cleanedLocations,
            _updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log('Updated existing Firestore document: builders/locations (independent of specific builder)');
        } else {
          // Create the document with initial data
          await targetDocRef.set({ 
            projects: cleanedLocations, 
            _createdAt: admin.firestore.FieldValue.serverTimestamp(),
            _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            _description: 'All project locations from all builders - independent shared document'
          });
          console.log('Created new Firestore document: builders/locations with all project data');
        }
      } catch (updateErr) {
        console.error('Failed to update/create builders/locations document in Firestore:', updateErr && updateErr.message ? updateErr.message : updateErr);
      }
    } catch (locErr) {
      console.error('Failed to merge locations.json into Firestore:', locErr && locErr.message ? locErr.message : locErr);
      // Do not fail the whole operation because project write succeeded; continue to exit success so user can inspect logs
    }
    process.exit(0);
  } catch (e) {
    console.error('Failed single-project write:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

uploadLocations().catch(e => { console.error(e); process.exit(1); });
