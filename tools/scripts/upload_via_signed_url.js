#!/usr/bin/env node
// upload_via_signed_url.js
// Node uploader that uses your backend's create_upload_url + notify_upload endpoints
// Usage examples:
//  API_BASE must point to your functions base (e.g. https://us-central1-<proj>.cloudfunctions.net)
//  SEED_ADMIN_KEY should be set to ADMIN_API_KEY (or omit if your backend allows trusted origin localhost)
//  node upload_via_signed_url.js --builderId=builder123 --projectId=projA --root=./tools/seed/builder123/projA/media --concurrency=4

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_API_BASE = process.env.API_BASE || process.env.FUNCTIONS_URL || process.env.API_BASE_URL || '';
const ADMIN_KEY = process.env.SEED_ADMIN_KEY || process.env.ADMIN_API_KEY || '';

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.log(`\nUsage: node upload_via_signed_url.js --builderId=... --projectId=... --root=path/to/media [--apiBase=https://... ] [--concurrency=4] [--dryRun] [--skipNotify] [--env=local|staging|prod]\n`);
  process.exit(msg ? 1 : 0);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (const a of argv) {
    if (a === '--dryRun') { out.dryRun = true; continue; }
    if (a === '--skipNotify') { out.skipNotify = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function simpleMimeFromExt(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav',
    json: 'application/json', txt: 'text/plain', html: 'text/html'
  };
  return map[ext] || 'application/octet-stream';
}

async function walkDir(dir) {
  const files = [];
  async function walk(d) {
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) files.push(full);
    }
  }
  await walk(dir);
  return files;
}

async function computeShaAndSize(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let size = 0;
    const rs = fs.createReadStream(filePath);
    rs.on('data', (chunk) => { hash.update(chunk); size += chunk.length; });
    rs.on('end', () => resolve({ sha: hash.digest('hex'), size }));
    rs.on('error', reject);
  });
}

async function fetchForNode(url, opts) {
  // Use global fetch if available (Node 18+), else fall back to node-fetch dynamically
  if (typeof fetch === 'function') return fetch(url, opts);
  const nodeFetch = require('node-fetch');
  return nodeFetch(url, opts);
}

async function doUpload(filePath, apiBase, headers, builderId, projectId, dryRun, skipNotify) {
  // Determine assetType from relative path under "media" folder: e.g. .../media/photos/1.jpg -> assetType = photos
  const rel = filePath.split(path.sep).join('/');
  const parts = rel.split('/');
  const mediaIdx = parts.lastIndexOf('media');
  let assetType = 'misc';
  let relativeToMedia = path.basename(filePath);
  if (mediaIdx >= 0 && parts.length > mediaIdx + 1) {
    assetType = parts[mediaIdx + 1] || 'misc';
    relativeToMedia = parts.slice(mediaIdx + 2).join('/');
  }

  const filename = relativeToMedia || path.basename(filePath);
  const contentType = simpleMimeFromExt(filename);

  console.log('Processing', filePath, 'as', assetType, '/', filename, 'contentType=', contentType);
  const { sha, size } = await computeShaAndSize(filePath);

  const createUrl = apiBase.replace(/\/+$/, '') + '/api/create_upload_url';
  const notifyUrl = apiBase.replace(/\/+$/, '') + '/api/notify_upload';

  const body = { builderId, projectId, assetType, filename, contentType };

  if (dryRun) {
    console.log('[dryRun] would POST create_upload_url', createUrl, body);
    return { storagePath: `${assetType}/${builderId}/${projectId}/${filename}`, firebaseUrl: null, size, sha };
  }

  // Request signed URL
  const createResp = await fetchForNode(createUrl, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body),
  });
  if (!createResp.ok) {
    const t = await createResp.text();
    throw new Error('create_upload_url failed: ' + createResp.status + ' ' + t);
  }
  const createJson = await createResp.json();
  const { uploadUrl, storagePath, firebaseUrl, expiresAt } = createJson;
  if (!uploadUrl) throw new Error('create_upload_url returned no uploadUrl');

  // PUT file to signed URL
  const fileStream = fs.createReadStream(filePath);
  const putHeaders = { 'Content-Type': contentType, 'Content-Length': String(size) };
  // Some signed URLs also require 'x-goog-content-length-range' not required here
  console.log('Uploading to signed URL...');

  const putResp = await fetchForNode(uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: fileStream,
  });
  if (!putResp.ok) {
    const t = await putResp.text();
    throw new Error('PUT to signed URL failed: ' + putResp.status + ' ' + t);
  }
  console.log('Upload succeeded for', storagePath);

  if (skipNotify) {
    return { storagePath, firebaseUrl, size, sha };
  }

  // Notify backend
  const notifyBody = { storagePath, firebaseUrl, size, sha };
  const notifyResp = await fetchForNode(notifyUrl, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(notifyBody),
  });
  if (!notifyResp.ok) {
    const t = await notifyResp.text();
    throw new Error('notify_upload failed: ' + notifyResp.status + ' ' + t);
  }
  const notifyJson = await notifyResp.json();
  console.log('Notified backend, doc id=', notifyJson.id || '(none)');
  return { storagePath, firebaseUrl, size, sha, docId: notifyJson.id };
}

async function processPair(builderId, projectId, absRoot, apiBase, headers, concurrency, dryRun, skipNotify) {
  console.log(`Starting pair: builder=${builderId} project=${projectId} root=${absRoot}`);
  const allFiles = await walkDir(absRoot);
  console.log(`Found ${allFiles.length} files for ${builderId}/${projectId}`);
  if (!allFiles.length) return { results: [], errors: [] };

  const results = [];
  let idx = 0;
  const errors = [];

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= allFiles.length) return;
      const f = allFiles[i];
      try {
        let attempts = 0;
        while (true) {
          attempts++;
          try {
            const r = await doUpload(f, apiBase, headers, builderId, projectId, dryRun, skipNotify);
            results.push(Object.assign({ file: path.relative(process.cwd(), f) }, r));
            break;
          } catch (err) {
            console.error('Upload attempt failed for', f, err.message || err);
            if (attempts >= 3) { throw err; }
            const wait = 500 * attempts;
            console.log('Retrying in', wait, 'ms');
            await new Promise((res) => setTimeout(res, wait));
          }
        }
      } catch (err) {
        errors.push({ file: f, error: String(err?.message || err) });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return { results, errors };
}

async function main() {
  const args = parseArgs();
  const cliEnv = (args.env || '').toString().trim().toLowerCase();
  const envName = cliEnv || (process.env.ENV || process.env.SEED_ENV || process.env.NODE_ENV || '').toString().trim().toLowerCase();

  function envGet(key) {
    const up = (envName || '').toUpperCase();
    if (up) {
      const alt = `${key}_${up}`;
      if (process.env[alt]) return process.env[alt];
    }
    if (process.env[key]) return process.env[key];
    return undefined;
  }

  const batchFile = args.batch || envGet('BATCH_FILE');
  const parallelPairs = parseInt(args.parallelPairs || envGet('PARALLEL_PAIRS') || '1', 10) || 1;

  if (batchFile) {
    // Read batch CSV: builderId,projectId,mediaRoot(optional)
    const batchPath = path.resolve(batchFile);
    if (!fs.existsSync(batchPath)) usageAndExit('Batch file not found: ' + batchPath);
    const txt = await fsp.readFile(batchPath, 'utf8');
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const pairs = [];
    for (const ln of lines) {
      const cols = ln.split(',').map(c => c.trim());
      const b = cols[0];
      const p = cols[1];
      let r = cols[2];
      if (!b || !p) { console.warn('Skipping invalid batch line:', ln); continue; }
      if (!r) {
        // fallback to MEDIA_ROOT pattern or default path
        const mediaRootTemplate = envGet('MEDIA_ROOT') || 'tools/seed/{builderId}/{projectId}/media';
        r = mediaRootTemplate.replace('{builderId}', b).replace('{projectId}', p);
      }
      pairs.push({ builderId: b, projectId: p, root: path.resolve(r) });
    }

    console.log('Launching batch for', pairs.length, 'pairs with parallelPairs=', parallelPairs);

    const pairResults = [];
    const pairErrors = [];
    let pidx = 0;

    async function pairWorker() {
      while (true) {
        const i = pidx++;
        if (i >= pairs.length) return;
        const pair = pairs[i];
        try {
          // resolve apiBase and headers per env / global
          const apiBase = args.apiBase || envGet('API_BASE') || DEFAULT_API_BASE;
          const adminKey = args.adminKey || envGet('SEED_ADMIN_KEY') || ADMIN_KEY || envGet('ADMIN_API_KEY');
          const headers = {};
          if (adminKey) headers['x-admin-key'] = adminKey;
          const bearer = args.bearer || envGet('SEED_BEARER') || process.env.SEED_BEARER || process.env.BEARER;
          if (!headers['x-admin-key'] && bearer) headers['Authorization'] = 'Bearer ' + bearer;
          const concurrency = parseInt(args.concurrency || envGet('CONCURRENCY') || DEFAULT_CONCURRENCY, 10) || DEFAULT_CONCURRENCY;
          const dryRun = !!(args.dryRun || ((envGet('DRY_RUN') || '').toString().toLowerCase() === 'true'));
          const skipNotify = !!(args.skipNotify || ((envGet('SKIP_NOTIFY') || '').toString().toLowerCase() === 'true'));

          const absRoot = pair.root;
          if (!fs.existsSync(absRoot)) { console.warn('Pair root does not exist, skipping:', absRoot); pairErrors.push({ pair, error: 'root missing' }); continue; }

          const { results, errors } = await processPair(pair.builderId, pair.projectId, absRoot, apiBase, headers, concurrency, dryRun, skipNotify);
          pairResults.push({ pair, results });
          if (errors && errors.length) pairErrors.push({ pair, errors });

          // write per-pair manifest
          const outManifest = {
            env: envName || process.env.NODE_ENV || 'local',
            apiBase: apiBase,
            builderId: pair.builderId,
            projectId: pair.projectId,
            generatedAt: new Date().toISOString(),
            files: results,
            errors,
          };
          const outDir = path.join(process.cwd(), 'tools', 'seed', pair.builderId, pair.projectId);
          try { await fsp.mkdir(outDir, { recursive: true }); } catch {}
          const outPath = path.join(outDir, 'uploaded_manifest.json');
          await fsp.writeFile(outPath, JSON.stringify(outManifest, null, 2), 'utf8');
          console.log('Wrote manifest to', outPath);

        } catch (err) {
          console.error('Batch pair failed', pair, err);
          pairErrors.push({ pair, error: String(err?.message || err) });
        }
      }
    }

    const workers = [];
    for (let i = 0; i < parallelPairs; i++) workers.push(pairWorker());
    await Promise.all(workers);

    console.log('Batch complete. pairs:', pairs.length, 'success:', pairResults.length, 'errors:', pairErrors.length);
    const batchOut = { env: envName || 'local', pairs: pairs.length, successes: pairResults.length, errors: pairErrors.length, details: { successes: pairResults.length, errors: pairErrors } };
    const batchOutPath = path.join(process.cwd(), 'tools', 'seed', 'batch_result_' + Date.now() + '.json');
    await fsp.writeFile(batchOutPath, JSON.stringify(batchOut, null, 2), 'utf8');
    console.log('Wrote batch summary to', batchOutPath);
    if (pairErrors.length) process.exit(2);
    process.exit(0);
  }

  // Single pair default behavior
  const builderId = args.builderId || envGet('BUILDER_ID');
  const projectId = args.projectId || envGet('PROJECT_ID');
  const root = args.root || envGet('MEDIA_ROOT') || args.path;

  const apiBase = args.apiBase || envGet('API_BASE') || DEFAULT_API_BASE;
  const adminKey = args.adminKey || envGet('SEED_ADMIN_KEY') || ADMIN_KEY || envGet('ADMIN_API_KEY');
  const headers = {};
  if (adminKey) headers['x-admin-key'] = adminKey;
  const bearer = args.bearer || envGet('SEED_BEARER') || process.env.SEED_BEARER || process.env.BEARER;
  if (!headers['x-admin-key'] && bearer) headers['Authorization'] = 'Bearer ' + bearer;

  const concurrency = parseInt(args.concurrency || envGet('CONCURRENCY') || DEFAULT_CONCURRENCY, 10) || DEFAULT_CONCURRENCY;
  const dryRun = !!(args.dryRun || ((envGet('DRY_RUN') || '').toString().toLowerCase() === 'true'));
  const skipNotify = !!(args.skipNotify || ((envGet('SKIP_NOTIFY') || '').toString().toLowerCase() === 'true'));

  if (!builderId || !projectId || !root) usageAndExit('Missing required builderId, projectId or root. Provide via CLI or .env (BUILDER_ID, PROJECT_ID, MEDIA_ROOT)');
  if (!apiBase) usageAndExit('Missing API base URL. Set --apiBase, API_BASE or API_BASE_<ENV> env var');

  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot)) usageAndExit('root path does not exist: ' + absRoot);

  console.log('Environment:', envName || 'local');
  console.log('API base:', apiBase);
  console.log('Builder:', builderId, 'Project:', projectId);
  console.log('Media root:', absRoot);
  console.log('Concurrency:', concurrency, 'dryRun:', dryRun, 'skipNotify:', skipNotify);

  const { results, errors } = await processPair(builderId, projectId, absRoot, apiBase, headers, concurrency, dryRun, skipNotify);

  console.log('Uploads finished. success=', results.length, 'errors=', errors.length);

  const outManifest = {
    env: envName || process.env.NODE_ENV || 'local',
    apiBase: apiBase,
    builderId,
    projectId,
    generatedAt: new Date().toISOString(),
    files: results,
    errors,
  };

  const outDir = path.join(process.cwd(), 'tools', 'seed', builderId, projectId);
  try { await fsp.mkdir(outDir, { recursive: true }); } catch {}
  const outPath = path.join(outDir, 'uploaded_manifest.json');
  await fsp.writeFile(outPath, JSON.stringify(outManifest, null, 2), 'utf8');
  console.log('Wrote manifest to', outPath);

  if (errors.length) {
    console.error('Some uploads failed. See manifest errors.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => { console.error('Fatal error', err); process.exit(1); });
