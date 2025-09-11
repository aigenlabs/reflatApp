#!/usr/bin/env node
/*
 Node uploader for project media using @google-cloud/storage
 Usage:
   node upload_project_media.js <builderId> <projectId> [--bucket gs://my-bucket] [--public] [--dry-run]

 Requires: set GOOGLE_APPLICATION_CREDENTIALS env to a service account JSON with storage permissions
 Install: npm install @google-cloud/storage mime sharp
*/

const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const mime = require('mime');

// Attempt to load .env from useful locations (tools/scripts/.env, tools/seed/.env, tools/data/.env, repo root .env)
try {
  const dotenv = require('dotenv');
  // Per request: only load from tools/scripts/.env
  const possibleEnvPaths = [
    path.join(process.cwd(), 'tools', 'scripts', '.env')
  ];
  for (const p of possibleEnvPaths) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log('Loaded environment variables from', p);
        break;
      }
    } catch (e) {
      // ignore filesystem errors and continue
    }
  }
} catch (e) {
  console.log('dotenv not installed, skipping .env loading. To enable, npm install dotenv');
}

async function main() {
  // Robust argument parsing: flags may appear anywhere. Collect positional args and options.
  const rawArgs = process.argv.slice(2);
  const opts = {
    bucket: null,
    makePublic: false,
    dryRun: false,
    env: null,
    credentials: null,
    skipLocations: false,
  };
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--public') { opts.makePublic = true; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (a === '--bucket' && rawArgs[i+1]) { opts.bucket = rawArgs[i+1]; i++; continue; }
    if (a === '--env' && rawArgs[i+1]) { opts.env = rawArgs[i+1]; i++; continue; }
    if (a === '--credentials' && rawArgs[i+1]) { opts.credentials = rawArgs[i+1]; i++; continue; }
    if (a === '--skip-locations' || a === '--no-locations') { opts.skipLocations = true; continue; }
    if (a.startsWith('--')) { /* unknown flag - ignore */ continue; }
    positional.push(a);
  }

  if (positional.length < 2) {
    console.error('Usage: node upload_project_media.js <builderId> <projectId> [--bucket gs://...] [--public] [--dry-run] [--skip-locations]');
    process.exit(1);
  }
  const builderId = positional[0];
  const projectId = positional[1];

  // Read bucket from env if not provided on CLI
  function stripQuotesAndWs(v) {
    if (!v && v !== '') return v;
    let s = String(v).trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }

  function tryLoadEnvFileManual() {
    // If dotenv wasn't installed or didn't populate needed vars, try a simple manual parse
    try {
      const envPath = path.join(process.cwd(), 'tools', 'scripts', '.env');
      if (!fs.existsSync(envPath)) return;
      const raw = fs.readFileSync(envPath, 'utf8');
      raw.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        // Remove optional surrounding quotes
        val = stripQuotesAndWs(val);
        if (!process.env[key]) process.env[key] = val;
      });
      console.log('Manually loaded environment variables from tools/scripts/.env (fallback)');
    } catch (e) {
      // ignore
    }
  }

  // Try manual .env parse as a fallback in case dotenv wasn't available or didn't set values
  tryLoadEnvFileManual();

  opts.bucket = opts.bucket || stripQuotesAndWs(process.env.GS_BUCKET) || stripQuotesAndWs(process.env.GCLOUD_STORAGE_BUCKET) || null;

  // If env provided and no explicit bucket, look for GS_BUCKET_<ENV> or GCLOUD_STORAGE_BUCKET_<ENV>
  if (!opts.bucket && opts.env) {
    const up = opts.env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    opts.bucket = stripQuotesAndWs(process.env[`GS_BUCKET_${up}`]) || stripQuotesAndWs(process.env[`GCLOUD_STORAGE_BUCKET_${up}`]) || null;
    if (opts.bucket) console.log(`Using bucket from env for ${opts.env}: ${opts.bucket}`);
  }

  if (!opts.bucket) {
    console.error('No bucket specified. Set GS_BUCKET, GS_BUCKET_<ENV> in tools/scripts/.env or pass --bucket <bucket-name>');
    process.exit(1);
  }

  // normalize gs:// prefix
  const bucketName = opts.bucket.replace(/^gs:\/\//, '');

  // Allow specifying credentials JSON via --credentials <path> (already parsed into opts.credentials)

  // If an environment label was provided, allow GOOGLE_APPLICATION_CREDENTIALS_<ENV> in .env
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && opts.env) {
    try {
      const up = opts.env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const envKey = `GOOGLE_APPLICATION_CREDENTIALS_${up}`;
      const candidateEnvVal = stripQuotesAndWs(process.env[envKey]);
      if (candidateEnvVal) {
        const candidatePath = path.resolve(process.cwd(), candidateEnvVal);
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          process.env.GOOGLE_APPLICATION_CREDENTIALS = candidatePath;
          console.log(`Using credentials from ${envKey}:`, candidatePath);
        } else {
          console.warn(`Credentials path referenced by ${envKey} not found:`, candidatePath);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const candidates = [];
    // 1) explicit --credentials path
    if (opts.credentials) candidates.push(path.resolve(opts.credentials));
    // Per request: only look for credentials JSON under tools/scripts
    try {
      const credsDir = path.join(process.cwd(), 'tools', 'scripts');
      if (fs.existsSync(credsDir)) {
        const files = fs.readdirSync(credsDir).filter(f => /adminsdk|firebase.*sdk|serviceaccount|\.json$/i.test(f));
        for (const f of files) candidates.push(path.join(credsDir, f));
      }
    } catch (e) {
      // ignore
    }

    // Pick the first existing candidate
    let chosen = null;
    for (const c of candidates) {
      if (!c) continue;
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          chosen = c; break;
        }
      } catch (e) { /* ignore */ }
    }
    if (chosen) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = chosen;
      console.log('Using credentials from', chosen);
    } else {
      console.log('No GOOGLE_APPLICATION_CREDENTIALS found; relying on environment or default application credentials.');
    }
  } else {
    console.log('GOOGLE_APPLICATION_CREDENTIALS is set:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  // --- Check for existing manifest to compare files ---
  const manifestDestPath = `${builderId}/${projectId}/uploaded_manifest.json`;
  const manifestFile = bucket.file(manifestDestPath);
  let existingManifest = { files: {} };
  try {
    const [manifestContents] = await manifestFile.download();
    existingManifest = JSON.parse(manifestContents.toString('utf8'));
    console.log('Found existing manifest. Will compare files before uploading.');
  } catch (e) {
    if (e.code === 404) {
      console.log('No existing manifest found. All local files will be uploaded.');
    } else {
      console.warn('Warning: Could not download or parse existing manifest.', e.message);
    }
  }

  const existingFileHashes = {};
  for (const subfolder in (existingManifest.files || {})) {
    for (const file of existingManifest.files[subfolder]) {
      const key = `${subfolder}/${file.path}`; // key is 'subfolder/relative/path.jpg'
      if (file.sha) existingFileHashes[key] = file.sha;
    }
  }
  // --- End manifest check ---

  // Try tools/seed first, then tools/data
  let root = path.join(process.cwd(), 'tools', 'seed', builderId, projectId, 'media');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    root = path.join(process.cwd(), 'tools', 'data', builderId, projectId, 'media');
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      console.error('No media directory found in either tools/seed or tools/data:', root);
      process.exit(1);
    } else {
      console.log('Using media directory from tools/data:', root);
    }
  }

  // Dynamically detect all subfolders in the media directory, or use all keys from apas-details.json if available
  let subfolders = [];
  try {
    subfolders = fs.readdirSync(root).filter(f => fs.statSync(path.join(root, f)).isDirectory());
    // Optionally, sort or filter out hidden/system folders if needed
  } catch (err) {
    console.error('Could not list subfolders in media directory:', err.message);
    process.exit(1);
  }

  // Debug: List all detected subfolders
  console.log('Detected subfolders:', subfolders);

  for (const sub of subfolders) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) {
      console.log(`[SKIP] Subfolder does not exist: ${sub}`);
      continue;
    }
    const entries = walkDir(dir);
    if (entries.length === 0) {
      console.log(`[EMPTY] Subfolder has no files: ${sub}`);
    }
    for (const localPath of entries) {
      const relPath = path.relative(dir, localPath).replace(/\\/g, '/');
      const ext = path.extname(localPath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff'].includes(ext);
      const size = fs.statSync(localPath).size;
      if (size === 0) {
        console.log(`[SKIP] Zero-size file: ${sub}/${relPath}`);
        continue;
      }
      if (isImage) {
        try {
          await sharp(localPath).metadata();
          console.log(`[INCLUDE] Image file: ${sub}/${relPath}`);
        } catch (err) {
          console.log(`[SKIP] Corrupt image: ${sub}/${relPath} (${err.message})`);
          continue;
        }
      } else {
        // Not an image, just log
        console.log(`[INCLUDE] Non-image file: ${sub}/${relPath}`);
      }
    }
  }

  const filesToUpload = [];
  const allFilesForNewManifest = { ...existingManifest.files }; // Start with old files

  for (const sub of subfolders) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    const entries = walkDir(dir);
    for (const localPath of entries) {
      // Validate image files before processing
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff'].includes(path.extname(localPath).toLowerCase());
      if (isImage) {
        try {
          await sharp(localPath).metadata();
        } catch (err) {
          console.warn(`[Skipping] Corrupt or invalid image file: ${localPath}\n  Reason: ${err.message}`);
          continue; // Skip to next file
        }
      }

      const relPath = path.relative(dir, localPath).replace(/\\/g, '/');
      const key = `${sub}/${relPath}`;
      const sha = require('crypto').createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');

      // This object represents the file's data for the new manifest
      const fileManifestEntry = {
        path: relPath,
        sha,
        size: fs.statSync(localPath).size,
        // dest, gsPath, firebaseUrl will be added after upload for new/changed files
      };

      if (existingFileHashes[key] !== sha) {
        console.log(`[Queueing] ${key} (changed or new)`);
        filesToUpload.push({ sub, localPath, relPath, sha, manifestEntry: fileManifestEntry });
      } else {
        console.log(`Skipping unchanged file: ${key}`);
        // No need to do anything, it's already in allFilesForNewManifest
      }
    }
  }

  if (filesToUpload.length === 0) {
    console.log('No new or changed files to upload.');
    // Even if no files are uploaded, we might want to regenerate and upload the manifest
    // to ensure consistency, but for now we can exit.
    // --- Update locations.json and Firestore ---
    try {
      const { execSync } = require('child_process');
      const detailsPath = path.join(process.cwd(), 'tools', 'data', builderId, projectId, `${projectId}-details.json`);
      if (fs.existsSync(detailsPath)) {
        const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
        if (!opts.skipLocations) {
          execSync(`node ${path.resolve(__dirname, 'add_project_to_locations.js')} "${builderId}" "${projectId}" "${details.project_name || details.name}" "${details.city}" "${details.location}"`, { stdio: 'inherit' });
          // Pass along SEED_ENV if provided so upload_locations_to_firestore picks correct key
          const envVars = Object.assign({}, process.env);
          if (opts.env) envVars.SEED_ENV = opts.env;
          execSync(`node ${path.resolve(__dirname, 'upload_locations_to_firestore.js')}`, { stdio: 'inherit', env: envVars });
        } else {
          console.log('Skipping add/upload of locations (opts.skipLocations=true)');
        }
      } else {
        console.warn('Project details JSON not found for locations update:', detailsPath);
      }
    } catch (e) {
      console.warn('Failed to update locations.json or upload to Firestore:', e.message);
    }
    return;
  }

  console.log(`Found ${filesToUpload.length} new or changed files to upload to bucket ${bucketName}`);
  if (opts.dryRun) {
    filesToUpload.forEach(f => console.log('[dry-run] %s -> %s/%s/%s', f.localPath, 'BUCKET', f.sub, f.relPath));
    return;
  }

  // The `uploaded` object is now deprecated for manifest generation,
  // but we'll use it to collect results from workers.
  const uploaded = {};

  // Upload with concurrency
  const concurrency = 8;
  const queue = [...filesToUpload];

  async function worker(id) {
    const workerResults = [];
    while (true) {
      const f = queue.shift();
      if (!f) return workerResults;

      try {
        const dest = `${builderId}/${projectId}/${f.sub}/${normalizeFilename(f.relPath)}`;
        const contentType = mime.getType(f.localPath) || 'application/octet-stream';
        const cacheControl = contentType.startsWith('image/') ? 'public, max-age=31536000' : 'public, max-age=3600';

        console.log(`[Worker ${id}] Uploading`, f.localPath, '->', dest);
        await bucket.upload(f.localPath, {
          destination: dest,
          gzip: true,
          metadata: {
            contentType,
            cacheControl,
          },
        });
        const gsPath = `gs://${bucketName}/${dest}`;
        const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media`;
        
        // This part needs to be thread-safe. Since we're in Node.js single thread, it's fine.
        if (!uploaded[f.sub]) uploaded[f.sub] = [];
        
        // Update the manifest entry with post-upload details
        const finalManifestEntry = {
          ...f.manifestEntry,
          dest,
          gsPath,
          firebaseUrl,
        };
        uploaded[f.sub].push(finalManifestEntry);

        if (opts.makePublic) {
          await bucket.file(dest).makePublic();
        }
        workerResults.push({ status: 'ok', path: f.localPath });
      } catch (err) {
        workerResults.push({ status: 'failed', path: f.localPath, error: err.message || err });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker(i + 1));
  }

  const allResults = (await Promise.all(workers)).flat();
  const failures = allResults.filter(r => r.status === 'failed');

  if (failures.length > 0) {
    console.error('\n--- Upload Report: Some files failed to upload ---');
    failures.forEach(f => {
      console.error(`- FAILED: ${f.path}\n  Reason: ${f.error}`);
    });
    console.error('-------------------------------------------------');
    process.exit(1);
  }

  // --- Generate and write the new manifest ---
  // Merge newly uploaded file info into the manifest data
  for (const sub in uploaded) {
    if (!allFilesForNewManifest[sub]) allFilesForNewManifest[sub] = [];
    for (const uploadedFile of uploaded[sub]) {
      const existingIndex = allFilesForNewManifest[sub].findIndex(f => f.path === uploadedFile.path);
      if (existingIndex !== -1) {
        allFilesForNewManifest[sub][existingIndex] = uploadedFile; // Update
      } else {
        allFilesForNewManifest[sub].push(uploadedFile); // Add new
      }
    }
  }

  // Always include all files from all subfolders in the manifest, even if not uploaded this run
  for (const sub of subfolders) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) {
      allFilesForNewManifest[sub] = [];
      continue;
    }
    const entries = walkDir(dir);
    allFilesForNewManifest[sub] = [];
    for (const localPath of entries) {
      const relPath = path.relative(dir, localPath).replace(/\\/g, '/');
      const sha = require('crypto').createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
      // Try to find a matching uploaded file (with dest/gsPath/firebaseUrl)
      let manifestEntry = { path: relPath, sha, size: fs.statSync(localPath).size };
      const uploadedEntry = (uploaded[sub] || []).find(f => f.path === relPath);
      if (uploadedEntry) {
        manifestEntry = { ...manifestEntry, ...uploadedEntry };
      } else {
        // If not uploaded this run, try to get dest/gsPath/firebaseUrl from previous manifest
        const prevEntry = (existingManifest.files[sub] || []).find(f => f.path === relPath);
        if (prevEntry) {
          manifestEntry = { ...manifestEntry, ...prevEntry };
        }
      }
      allFilesForNewManifest[sub].push(manifestEntry);
    }
    // If the subfolder exists but is empty, ensure it's still present as an empty array
    if (entries.length === 0) {
      allFilesForNewManifest[sub] = [];
    }
  }

  // Write uploaded_manifest.json and manifest.json to both tools/seed and tools/data parent folders for compatibility
  const manifestDirs = [
    path.join(process.cwd(), 'tools', 'seed', builderId, projectId),
    path.join(process.cwd(), 'tools', 'data', builderId, projectId)
  ];
  const newManifestContent = { generatedAt: Date.now(), files: allFilesForNewManifest };
  let lastOutPath = null;
  for (const manifestDir of manifestDirs) {
    try {
      fs.mkdirSync(manifestDir, { recursive: true });
      const outPath1 = path.join(manifestDir, 'uploaded_manifest.json');
      const outPath2 = path.join(manifestDir, 'manifest.json');
      fs.writeFileSync(outPath1, JSON.stringify(newManifestContent, null, 2), 'utf8');
      fs.writeFileSync(outPath2, JSON.stringify(newManifestContent, null, 2), 'utf8');
      lastOutPath = outPath1;
      console.log('Wrote updated manifest:', outPath1);
      console.log('Wrote updated manifest:', outPath2);
    } catch (err) {
      console.warn('Could not write manifest to', manifestDir, err.message);
    }
  }

  // Upload manifest to GCS
  try {
    if (!lastOutPath) throw new Error('No manifest file was written locally.');
    console.log(`Uploading manifest to gs://${bucketName}/${manifestDestPath}`);
    await bucket.upload(lastOutPath, {
      destination: manifestDestPath,
      gzip: true,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=600', // Cache for 10 minutes
      },
    });
    if (opts.makePublic) {
      await bucket.file(manifestDestPath).makePublic();
    }
    console.log('Successfully uploaded manifest.');
  } catch (uploadErr) {
    console.error(`ERROR: Failed to upload manifest file`, uploadErr);
    process.exit(1); // Fail the script if manifest upload fails
  }

  console.log('Upload complete');

  // --- Update locations.json and Firestore ---
  try {
    const { execSync } = require('child_process');
    // Read details for city/location
    const detailsPath = path.join(process.cwd(), 'tools', 'data', builderId, projectId, `${projectId}-details.json`);
    if (fs.existsSync(detailsPath)) {
      const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
      if (!opts.skipLocations) {
        execSync(`node ${path.resolve(__dirname, 'add_project_to_locations.js')} "${builderId}" "${projectId}" "${details.project_name || details.name}" "${details.city}" "${details.location}"`, { stdio: 'inherit' });
        // Pass along SEED_ENV if provided so upload_locations_to_firestore picks correct key
        const envVars = Object.assign({}, process.env);
        if (opts.env) envVars.SEED_ENV = opts.env;
        execSync(`node ${path.resolve(__dirname, 'upload_locations_to_firestore.js')}`, { stdio: 'inherit', env: envVars });
      } else {
        console.log('Skipping add/upload of locations (opts.skipLocations=true)');
      }
    } else {
      console.warn('Project details JSON not found for locations update:', detailsPath);
    }
  } catch (e) {
    console.warn('Failed to update locations.json or upload to Firestore:', e.message);
  }
}

function walkDir(dir) {
  const out = [];
  const items = fs.readdirSync(dir);
  for (const it of items) {
    const p = path.join(dir, it);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      out.push(...walkDir(p));
    } else if (stat.isFile()) {
      out.push(p);
    }
  }
  return out;
}

function normalizeFilename(name) {
  // Replace backslashes, trim, and replace spaces
  return name.replace(/\\/g, '/').split('/').map(s => s.trim().replace(/\s+/g, '_')).join('/');
}

main().catch((e) => { console.error(e); process.exit(1); });
