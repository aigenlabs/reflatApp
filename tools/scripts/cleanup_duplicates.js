#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// SUBFOLDERS in priority order (higher priority = keep file here, remove from lower priority folders)
const SUBFOLDER_PRIORITY = [
  'amenities',     // Highest priority - amenity icons should stay here
  'logos',         // High priority - logos should stay here  
  'floor_plans',   // High priority - floor plans should stay here
  'banners',       // Medium priority - banners should stay here
  'brochures',     // Medium priority - brochures should stay here
  'layouts',       // Medium priority - layouts should stay here
  'documents',     // Medium priority - documents should stay here
  'news',          // Low priority - news images
  'photos'         // Lowest priority - general photos (duplicates removed from here)
];

async function cleanupDuplicates(projectPath) {
  const mediaDir = path.join(projectPath, 'media');
  
  console.log(`Cleaning up duplicates in: ${mediaDir}`);
  
  // Map of hash -> {subfolder, filename, fullPath}
  const filesByHash = {};
  const duplicatesToRemove = [];
  
  // First pass: catalog all files by hash
  for (const subfolder of SUBFOLDER_PRIORITY) {
    const subDir = path.join(mediaDir, subfolder);
    if (!fs.existsSync(subDir)) continue;
    
    try {
      const files = await fs.readdir(subDir);
      for (const file of files) {
        if (file.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(subDir, file);
        const stats = await fs.stat(fullPath);
        if (!stats.isFile()) continue;
        
        // Extract hash from filename (first part before -)
        const hashMatch = file.match(/^([a-f0-9]{12})-/);
        if (!hashMatch) continue;
        
        const hash = hashMatch[1];
        
        if (filesByHash[hash]) {
          // Duplicate found!
          const existing = filesByHash[hash];
          const existingPriority = SUBFOLDER_PRIORITY.indexOf(existing.subfolder);
          const currentPriority = SUBFOLDER_PRIORITY.indexOf(subfolder);
          
          if (currentPriority < existingPriority) {
            // Current location has higher priority, mark existing for removal
            duplicatesToRemove.push(existing);
            filesByHash[hash] = { subfolder, filename: file, fullPath };
            console.log(`Duplicate: ${existing.subfolder}/${existing.filename} -> REMOVE (keeping ${subfolder}/${file})`);
          } else {
            // Existing location has higher priority, mark current for removal
            duplicatesToRemove.push({ subfolder, filename: file, fullPath });
            console.log(`Duplicate: ${subfolder}/${file} -> REMOVE (keeping ${existing.subfolder}/${existing.filename})`);
          }
        } else {
          // First occurrence of this hash
          filesByHash[hash] = { subfolder, filename: file, fullPath };
        }
      }
    } catch (e) {
      console.warn(`Error reading ${subDir}:`, e.message);
    }
  }
  
  // Second pass: remove duplicates
  console.log(`\nRemoving ${duplicatesToRemove.length} duplicate files...`);
  for (const duplicate of duplicatesToRemove) {
    try {
      await fs.remove(duplicate.fullPath);
      console.log(`Removed: ${duplicate.subfolder}/${duplicate.filename}`);
    } catch (e) {
      console.warn(`Failed to remove ${duplicate.fullPath}:`, e.message);
    }
  }
  
  console.log(`\nCleanup complete! Removed ${duplicatesToRemove.length} duplicate files.`);
  console.log('Remaining files are organized by priority:');
  console.log('  amenities/ > logos/ > floor_plans/ > banners/ > ... > photos/');
}

// Run cleanup
if (require.main === module) {
  const projectPath = process.argv[2];
  if (!projectPath) {
    console.error('Usage: node cleanup_duplicates.js <project_path>');
    console.error('Example: node cleanup_duplicates.js /path/to/myhome/grava');
    process.exit(1);
  }
  
  cleanupDuplicates(projectPath).catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
}

module.exports = { cleanupDuplicates };
