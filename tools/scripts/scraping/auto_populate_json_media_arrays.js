// Auto-populate subcollection arrays in project-details.json based on files in media subfolders
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
    } else if (stat && stat.isFile() && !path.basename(file).startsWith('.')) {
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

  const dataDir = path.join(__dirname, '..', '..', 'data', builderId, projectId);
  const jsonPath = path.join(dataDir, `${projectId}-details.json`);
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
    const existingFiles = getAllFiles(subPath)
      .map(f => path.relative(mediaDir, f).replace(/\\/g, '/'));
    
    // Get current array from JSON or empty array
    const currentArray = Array.isArray(json[sub]) ? json[sub] : [];
    
    // Filter out references to files that no longer exist
    const validFiles = currentArray.filter(fileRef => {
      // Handle both "media/subfolder/file" and "subfolder/file" formats
      let relativePath = fileRef;
      if (fileRef.startsWith('media/')) {
        relativePath = fileRef.substring(6); // Remove 'media/' prefix
      }
      const absolutePath = path.join(mediaDir, relativePath);
      return fs.existsSync(absolutePath);
    }).map(fileRef => {
      // Normalize to "subfolder/file" format
      if (fileRef.startsWith('media/')) {
        return fileRef.substring(6);
      }
      return fileRef;
    });
    
    // Check if we removed any invalid references
    if (validFiles.length !== currentArray.length) {
      console.log(`Removed ${currentArray.length - validFiles.length} invalid references from ${sub}`);
      changed = true;
    }
    
    // Check if there are new files not in the array
    const newFiles = existingFiles.filter(file => !validFiles.includes(file));
    if (newFiles.length > 0) {
      console.log(`Added ${newFiles.length} new files to ${sub}`);
      changed = true;
    }
    
    // Combine valid existing files with new files
    const updatedFiles = [...validFiles, ...newFiles].sort();
    
    // Update the JSON if there were changes
    if (JSON.stringify(json[sub] || []) !== JSON.stringify(updatedFiles)) {
      json[sub] = updatedFiles;
      changed = true;
      console.log(`Updated array for subcollection: ${sub} (${updatedFiles.length} items)`);
    } else if (!Array.isArray(json[sub]) && updatedFiles.length > 0) {
      json[sub] = updatedFiles;
      changed = true;
      console.log(`Created array for subcollection: ${sub} (${updatedFiles.length} items)`);
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
