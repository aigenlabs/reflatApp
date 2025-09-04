// Auto-populate subcollection arrays in apas-details.json based on files in media subfolders
// Usage: node auto_populate_json_media_arrays.js <builderId> <projectId> [--dry-run]

const fs = require('fs');
const path = require('path');

function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath));
    } else if (stat && stat.isFile()) {
      results.push(filePath);
    }
  });
  return results;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('Usage: node auto_populate_json_media_arrays.js <builderId> <projectId> [--dry-run]');
    process.exit(1);
  }
  const builderId = argv[0];
  const projectId = argv[1];
  const dryRun = argv.includes('--dry-run');

  const dataDir = path.join('tools', 'data', builderId, projectId);
  const jsonPath = path.join(dataDir, 'apas-details.json');
  const mediaDir = path.join(dataDir, 'media');

  if (!fs.existsSync(jsonPath)) {
    console.error('JSON file not found:', jsonPath);
    process.exit(1);
  }
  if (!fs.existsSync(mediaDir)) {
    console.error('Media directory not found:', mediaDir);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const subfolders = fs.readdirSync(mediaDir).filter(f => fs.statSync(path.join(mediaDir, f)).isDirectory());

  let changed = false;
  for (const sub of subfolders) {
    const subPath = path.join(mediaDir, sub);
    const files = getAllFiles(subPath)
      .map(f => 'media/' + path.relative(mediaDir, f).replace(/\\/g, '/'));
    if (Array.isArray(json[sub])) {
      if (JSON.stringify(json[sub]) !== JSON.stringify(files)) {
        json[sub] = files;
        changed = true;
        console.log(`Updated array for subcollection: ${sub} (${files.length} items)`);
      }
    } else if (files.length > 0) {
      json[sub] = files;
      changed = true;
      console.log(`Created array for subcollection: ${sub} (${files.length} items)`);
    }
  }

  if (changed) {
    if (dryRun) {
      console.log('[Dry Run] Would update', jsonPath);
    } else {
      fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
      console.log('Updated', jsonPath);
    }
  } else {
    console.log('No changes needed. All arrays are up to date.');
  }
}

main();
