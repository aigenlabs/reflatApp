#!/usr/bin/env node
/*
Generate a manifest.json for a project media folder.
Usage:
  node generate_manifest.js <builderId> <projectId>
Outputs: tools/seed/<builderId>/<projectId>/manifest.json
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walkDir(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const it of fs.readdirSync(dir)) {
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

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('Usage: node generate_manifest.js <builderId> <projectId>');
    process.exit(1);
  }
  const builderId = argv[0];
  const projectId = argv[1];
  const repoRoot = path.resolve(__dirname, '../../'); // resolve from tools/seed

  // Try tools/seed first, then tools/data
  let mediaRoot = path.join(repoRoot, 'tools', 'seed', builderId, projectId, 'media');
  if (!fs.existsSync(mediaRoot)) {
    mediaRoot = path.join(repoRoot, 'tools', 'data', builderId, projectId, 'media');
    if (!fs.existsSync(mediaRoot)) {
      console.error('Media folder not found in either tools/seed or tools/data:', mediaRoot);
      process.exit(1);
    } else {
      console.log('Using media folder from tools/data:', mediaRoot);
    }
  }

  // Write manifest to the same parent as mediaRoot
  const manifestDir = path.dirname(mediaRoot);
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  const subfolders = ['photos', 'layouts', 'floor_plans', 'logos', 'brochures', 'banners'];
  const manifest = { generatedAt: Date.now(), files: {} };

  for (const sub of subfolders) {
    const dir = path.join(mediaRoot, sub);
    if (!fs.existsSync(dir)) continue;
    const files = walkDir(dir).map(f => {
      const rel = path.relative(dir, f).replace(/\\/g, '/');
      const size = fs.statSync(f).size;
      const sha = sha256File(f);
      return { path: rel, size, sha };
    });
    if (files.length) manifest.files[sub] = files;
  }

  const outPath = path.join(manifestDir, 'manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Wrote manifest:', outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
