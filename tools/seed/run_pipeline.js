#!/usr/bin/env node
/*
 Simple Node pipeline to run: generate_manifest -> upload -> seed
 Usage:
   node run_pipeline.js <builderId> <projectId> [--bucket my-bucket] [--public] [--dry-run] [--skip-upload] [--skip-seed]

 Notes / prereqs:
 - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Storage + Firestore permissions.
 - Requires node and npm. Uses `npx ts-node` to run the TypeScript seeder. If you prefer compiled JS, adjust the seeder command.
 - This script expects the other helper scripts to live at tools/seed/generate_manifest.js and tools/seed/upload_project_media.js and the seeder at backend/firebasefunctions/scripts/seed_sample_project.ts
*/

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { Storage } = require('@google-cloud/storage');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

function usage() {
  console.error('Usage: node run_pipeline.js <builderId> <projectId> [--bucket my-bucket] [--public] [--dry-run] [--skip-upload] [--skip-seed]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const builderIdArgIndex = argv.findIndex(arg => !arg.startsWith('--'));
if (builderIdArgIndex === -1 || builderIdArgIndex + 1 >= argv.length) usage();

const builderId = argv[builderIdArgIndex];
const projectId = argv[builderIdArgIndex + 1];
const flags = new Set(argv.filter(arg => arg.startsWith('--')));

const opts = {
  bucket: null,
  makePublic: flags.has('--public'),
  dryRun: flags.has('--dry-run'),
  skipUpload: flags.has('--skip-upload'),
  skipSeed: flags.has('--skip-seed'),
  env: null,
};

// parse --bucket value if provided
const bIdx = argv.indexOf('--bucket');
if (bIdx !== -1 && argv[bIdx+1]) opts.bucket = argv[bIdx+1];
// allow --env <name> to select environment-specific buckets (eg. staging, prod)
const envArgIndex = argv.findIndex(a => a === '--env');
if (envArgIndex !== -1 && argv[envArgIndex+1]) {
  opts.env = argv[envArgIndex+1];
} else if (process.env.SEED_ENV) {
  opts.env = process.env.SEED_ENV;
}

// If env provided and no explicit bucket, look for GS_BUCKET_<ENV> or GCLOUD_STORAGE_BUCKET_<ENV>
if (!opts.bucket && opts.env) {
  const up = opts.env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  opts.bucket = process.env[`GS_BUCKET_${up}`] || process.env[`GCLOUD_STORAGE_BUCKET_${up}`] || null;
  if (opts.bucket) console.log(`Using bucket from env for ${opts.env}: ${opts.bucket}`);
}

// Set GOOGLE_APPLICATION_CREDENTIALS from env if available
if (opts.env) {
  const up = opts.env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const creds = process.env[`GOOGLE_APPLICATION_CREDENTIALS_${up}`];
  if (creds) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = creds;
    console.log(`Using credentials from env for ${opts.env}`);
  }
}

// fallback to env
if (!opts.bucket) opts.bucket = process.env.GS_BUCKET || process.env.GCLOUD_STORAGE_BUCKET || null;

const repoRoot = path.resolve(__dirname, '../../'); // resolve from tools/seed
let seedDir = path.join(repoRoot, 'tools', 'seed', builderId, projectId);
if (!fs.existsSync(seedDir)) {
  // Try alternate location in tools/data
  seedDir = path.join(repoRoot, 'tools', 'data', builderId, projectId);
  if (!fs.existsSync(seedDir)) {
    console.error('Project folder not found in either tools/seed or tools/data:', seedDir);
    process.exit(1);
  } else {
    console.log('Using project folder from tools/data:', seedDir);
  }
}

// helper to run a command synchronously and stream output
function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')} (cwd=${cwd || process.cwd()})`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: cwd || process.cwd(),
    shell: false,
    env: { ...process.env }, // Pass parent environment
  });
  if (r.error) {
    console.error('Failed to run', cmd, r.error);
    return { ok: false, code: r.status || 1 };
  }
  return { ok: r.status === 0, code: r.status };
}

(async () => {
  try {
    // 1) generate manifest
    const genScript = path.join(repoRoot, 'tools', 'seed', 'generate_manifest.js');
    if (!fs.existsSync(genScript)) {
      console.error('generate_manifest.js not found at', genScript);
      process.exit(1);
    }
    const genRes = run('node', [genScript, builderId, projectId]);
    if (!genRes.ok) {
      console.error('generate_manifest failed');
      process.exit(genRes.code || 1);
    }

    // locate manifest.json (common location)
    let manifestPath = path.join(seedDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      // try alternate: media/manifest.json
      const alt = path.join(seedDir, 'media', 'manifest.json');
      if (fs.existsSync(alt)) manifestPath = alt;
    }
    if (!fs.existsSync(manifestPath)) {
      console.warn('Warning: manifest.json not found at expected locations. Continuing but uploader may compute its own manifest.');
    } else {
      console.log('Found manifest:', manifestPath);
    }

    // 2) upload (unless skipped)
    if (!opts.skipUpload) {
      const uploadScript = path.join(repoRoot, 'tools', 'scripts', 'upload_project_media.js');
      if (!fs.existsSync(uploadScript)) {
        console.error('upload_project_media.js not found at', uploadScript);
        process.exit(1);
      }
      const uploadArgs = [uploadScript, builderId, projectId];
      if (opts.bucket) { uploadArgs.push('--bucket', opts.bucket); }
      if (opts.makePublic) uploadArgs.push('--public');
      if (opts.dryRun) uploadArgs.push('--dry-run');

      const uploadRes = run('node', uploadArgs);
      if (!uploadRes.ok) {
        console.error('upload_project_media failed');
        process.exit(uploadRes.code || 1);
      }

      // Also upload the details.json file using the Node.js client library
      const detailsJsonPath = path.join(repoRoot, 'tools', 'data', builderId, projectId, `${projectId}-details.json`);
      if (fs.existsSync(detailsJsonPath) && opts.bucket) {
        console.log(`Uploading ${projectId}-details.json...`);
        try {
          const storage = new Storage();
          await storage.bucket(opts.bucket).upload(detailsJsonPath, {
            destination: `${builderId}/${projectId}/${projectId}-details.json`,
            public: opts.makePublic,
          });
          console.log('Successfully uploaded project details JSON.');
        } catch (e) {
          console.error(`Failed to upload ${projectId}-details.json`, e);
          console.warn('Continuing without project details JSON upload.');
        }
      }


      // validate uploaded_manifest.json
      let uploadedManifest = path.join(seedDir, 'uploaded_manifest.json');
      if (!fs.existsSync(uploadedManifest)) {
        // Try alternate location (tools/data if seedDir is tools/seed, or vice versa)
        let altManifest;
        if (seedDir.includes('/tools/seed/')) {
          altManifest = uploadedManifest.replace('/tools/seed/', '/tools/data/');
        } else if (seedDir.includes('/tools/data/')) {
          altManifest = uploadedManifest.replace('/tools/data/', '/tools/seed/');
        }
        if (altManifest && fs.existsSync(altManifest)) {
          uploadedManifest = altManifest;
          console.log('Found uploaded_manifest.json in alternate location:', uploadedManifest);
        } else {
          console.error('uploaded_manifest.json not found after upload at', uploadedManifest);
          process.exit(1);
        }
      }

      console.log('Validating uploaded manifest...');
      const manifest = JSON.parse(fs.readFileSync(uploadedManifest, 'utf8'));
      if (!manifest.files || typeof manifest.files !== 'object') {
        console.error('uploaded_manifest.json is malformed or missing "files" object');
        process.exit(1);
      }

      const storage = new Storage();
      const bucket = storage.bucket(opts.bucket);
      const missingFiles = [];

      // The manifest.files is an object where keys are categories and values are arrays of files.
      for (const category in manifest.files) {
        const fileList = manifest.files[category];
        if (Array.isArray(fileList)) {
          for (const fileInfo of fileList) {
            const gcsPath = fileInfo.gcs_path; // The key for the GCS path in the manifest
            if (gcsPath) {
              try {
                const [exists] = await bucket.file(gcsPath).exists();
                if (!exists) {
                  missingFiles.push(gcsPath);
                }
              } catch (e) {
                console.error(`Error checking file ${gcsPath}:`, e);
              }
            }
          }
        }
      }

      if (missingFiles.length > 0) {
        console.warn('Warning: The following files are listed in the manifest but not found in the bucket:');
        for (const file of missingFiles) {
          console.warn(' -', file);
        }
      } else {
        console.log('Uploaded manifest validated: All files are present in the bucket.');
      }
    } else {
      console.log('--skip-upload specified; skipping upload step');
    }

    // 3) run seeder (unless skipped)
    if (!opts.skipSeed) {
      const seederTs = path.join(repoRoot, 'reflat', 'backend', 'firebasefunctions', 'scripts', 'seed_sample_project.ts');
      const seederJs = path.join(repoRoot, 'reflat', 'backend', 'firebasefunctions', 'lib', 'scripts', 'seed_sample_project.js');

      if (fs.existsSync(seederJs)) {
        // compiled JS exists, run with node
        const args = [seederJs];
        // prefer to pass uploaded_manifest if available
        const uploadedManifest = path.join(seedDir, 'uploaded_manifest.json');
        if (fs.existsSync(uploadedManifest)) {
            args.push(uploadedManifest, builderId, projectId);
        }
        const seedRes = run('node', args);
        if (!seedRes.ok) {
          console.error('Seeder (compiled JS) failed');
          process.exit(seedRes.code || 1);
        }
      } else if (fs.existsSync(seederTs)) {
        // try running with npx ts-node
        console.log('Seeder TypeScript detected. Running with npx ts-node.');
        const args = ['ts-node', seederTs];
        const uploadedManifest = path.join(seedDir, 'uploaded_manifest.json');
        if (fs.existsSync(uploadedManifest)) {
          // Also pass builderId and projectId to the seeder script
          args.push(uploadedManifest, builderId, projectId);
        }
        const seedRes = run('npx', args);
        if (!seedRes.ok) {
          console.error('Seeder (ts-node) failed. Ensure ts-node is installed or compile the seeder to JS.');
          process.exit(seedRes.code || 1);
        }
      } else {
        console.error('Seeder not found at', seederJs, 'or', seederTs);
        process.exit(1);
      }

      console.log('Seeding complete');
    } else {
      console.log('--skip-seed specified; skipping seeder step');
    }

    console.log('\nPipeline finished successfully');
  } catch (e) {
    console.error('Pipeline failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
