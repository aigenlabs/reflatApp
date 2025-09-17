#!/usr/bin/env node

/**
 * build_project_json.js - Build project JSON from existing folder contents
 * 
 * This script builds the project details JSON file based on the media files
 * already present in the subfolders. It's useful for:
 * - Updating JSON after manually organizing files
 * - Rebuilding JSON after file deletions/additions
 * - Creating JSON for projects where media was sourced offline
 * 
 * Usage: node build_project_json.js <builderId> <projectId> [options]
 * 
 * Options:
 *   --preserve-details  Preserve existing project details from JSON (default: true)
 *   --minimal-details   Create minimal project details only (ignores existing)
 * 
 * Examples:
 *   node build_project_json.js myhome grava
 *   node build_project_json.js myhome grava --minimal-details
 *   node build_project_json.js myhome grava --preserve-details
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { getProjectData, isValidLocalFile, SUBFOLDERS } = require('./project-utils');

// Note: SUBFOLDERS and isValidLocalFile are now imported from project-utils.js

// Note: isValidLocalFile function is now imported from project-utils.js

/**
 * Clean media directory of invalid files and OS artifacts
 */
async function cleanMediaDir(mediaDir) {
  try {
    for (const subfolder of SUBFOLDERS) {
      const dir = path.join(mediaDir, subfolder);
      if (!fs.existsSync(dir)) continue;
      
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        
        // Remove OS artifacts
        if (file.startsWith('.') || file.startsWith('._') || file.toLowerCase() === '.ds_store') {
          try {
            await fs.remove(filePath);
            console.log(`Removed OS artifact: ${file}`);
          } catch (e) {
            console.warn(`Failed to remove ${file}:`, e.message);
          }
          continue;
        }
        
        // Remove invalid files
        if (!isValidLocalFile(filePath)) {
          try {
            await fs.remove(filePath);
            console.log(`Removed invalid file: ${file}`);
          } catch (e) {
            console.warn(`Failed to remove invalid file ${file}:`, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to clean media directory:', e.message);
  }
}

/**
 * Build media collections from existing files
 */
async function buildMediaCollections(mediaDir) {
  const mediaCollections = {};
  
  for (const subfolder of SUBFOLDERS) {
    mediaCollections[subfolder] = [];
    
    try {
      const dir = path.join(mediaDir, subfolder);
      if (fs.existsSync(dir)) {
        const files = (await fs.readdir(dir)).filter(f => fs.statSync(path.join(dir, f)).isFile());
        for (const file of files) {
          const full = path.join(dir, file);
          
          // Skip hidden or artifact files
          if (file.startsWith('.') || file.startsWith('._')) continue;
          
          // Validate file
          if (!isValidLocalFile(full)) {
            console.warn(`Invalid file detected: ${file} (will be cleaned up)`);
            continue;
          }
          
          const rel = `${subfolder}/${file}`;
          if (!mediaCollections[subfolder].includes(rel)) {
            mediaCollections[subfolder].push(rel);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to read ${subfolder} directory:`, e.message);
    }
  }
  
  return mediaCollections;
}

/**
 * Merge amenities files with amenities data
 */
async function mergeAmenitiesFiles(details, mediaCollections) {
  if (!details.amenities || !Array.isArray(details.amenities)) return;
  
  const amenitiesFiles = mediaCollections.amenities || [];
  if (!amenitiesFiles.length) return;
  
  function normText(s) { 
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); 
  }
  
  // Build file metadata
  const fileMeta = amenitiesFiles.map(f => ({ 
    file: f, 
    base: normText(path.parse(f).name) 
  }));
  
  for (const amenity of details.amenities) {
    // Skip if already has icon/path/filename
    if (amenity && (amenity.icon || amenity.filename || amenity.path)) continue;
    
    const nameNorm = normText(amenity.name || '');
    const keyNorm = normText(amenity.key || '');
    let best = null;
    let bestScore = 0;
    
    for (const fm of fileMeta) {
      if (!fm.base) continue;
      
      // Direct match scores highly
      if (keyNorm && fm.base.includes(keyNorm)) { 
        best = fm; 
        bestScore = 100; 
        break; 
      }
      if (nameNorm && fm.base.includes(nameNorm)) { 
        best = fm; 
        bestScore = 90; 
        break; 
      }
      
      // Token intersection fallback
      const aTokens = new Set((nameNorm + ' ' + keyNorm).split(' ').filter(Boolean));
      const fTokens = new Set(fm.base.split(' ').filter(Boolean));
      let common = 0;
      for (const t of aTokens) if (fTokens.has(t)) common++;
      if (common > bestScore) { 
        bestScore = common; 
        best = fm; 
      }
    }
    
    if (best && best.file) {
      amenity.filename = path.basename(best.file);
      amenity.path = best.file;
      amenity.icon = best.file;
    }
  }
}

/**
 * Simplify amenities to clean format
 */
function simplifyAmenities(details, builderId, projectId) {
  try {
    if (!details.amenities || !Array.isArray(details.amenities)) return;
    
    function escRx(s) { 
      return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
    }
    
    const bn = String(builderId || '').toLowerCase();
    const pn = String(projectId || '').toLowerCase();
    const bname = String((details.builder_name || details.builder_id || '')).toLowerCase();
    const pname = String((details.project_name || details.project_id || '')).toLowerCase();
    const patterns = [bn, pn, bname, pname].filter(Boolean).map(escRx);
    const stripRe = patterns.length ? new RegExp('\\b(' + patterns.join('|') + ')\\b', 'ig') : null;
    
    details.amenities = details.amenities.map(a => {
      let name = a && (a.name || a.key) ? String(a.name || a.key).trim() : null;
      if (name && stripRe) {
        name = name.replace(stripRe, '');
      }
      
      // Cleanup
      if (name) {
        name = name.replace(/[-_\/:]+/g, ' ')
                   .replace(/[()\[\]\{\}\.|,]/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
        
        // Remove noise tokens
        name = name.replace(/\b(area|areas|img|image|images|cotta|terra|lobby|hall|saloon|salon|clubhouse|club)\b/ig, '')
                   .replace(/\s+/g, ' ')
                   .trim();
        
        // Remove trailing connectors
        name = name.replace(/[\-:\/]$/g, '').trim();
        
        // Title case
        name = name.split(' ')
                   .filter(Boolean)
                   .map(w => w.length > 1 ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w.toUpperCase())
                   .join(' ');
      }
      
      const icon = a && (a.icon || a.path || a.filename) ? (a.icon || a.path || a.filename) : null;
      return { name: name || null, icon: icon || null };
    }).filter(x => x && (x.name || x.icon));
  } catch (e) {
    console.warn('Failed to simplify amenities:', e.message);
  }
}

// Note: Location and builder name lookup functions are now imported from project-utils.js

/**
 * Main function
 */
async function main() {
  console.log('Starting build_project_json.js...');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const builderId = args[0];
  const projectId = args[1];
  
  if (!builderId || !projectId) {
    console.error('Usage: node build_project_json.js <builderId> <projectId> [options]');
    console.error('Options:');
    console.error('  --preserve-details  Preserve existing project details from JSON (default)');
    console.error('  --minimal-details   Create minimal project details only');
    console.error('Examples:');
    console.error('  node build_project_json.js myhome grava');
    console.error('  node build_project_json.js myhome grava --minimal-details');
    process.exit(1);
  }
  
  const preserveDetails = !args.includes('--minimal-details');
  
  console.log(`Builder: ${builderId}`);
  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${preserveDetails ? 'preserve existing details' : 'minimal details only'}`);
  
  // Setup paths
  const baseDir = path.join(__dirname, '..', 'data', builderId, projectId);
  const mediaDir = path.join(baseDir, 'media');
  const dataDir = path.join(__dirname, '..', 'data');
  const locationsPath = path.join(dataDir, 'locations.json');
  const buildersPath = path.join(dataDir, 'builders.json');
  
  // Get project data from both locations.json and builders.json
  const projectData = getProjectData(builderId, projectId, locationsPath, buildersPath);
  
  // Ensure directories exist
  await fs.ensureDir(mediaDir);
  for (const subfolder of SUBFOLDERS) {
    await fs.ensureDir(path.join(mediaDir, subfolder));
  }
  
  // Clean media directory
  await cleanMediaDir(mediaDir);
  
  // Initialize details object
  let details = {};
  
  if (preserveDetails) {
    // Try to load existing details
    const detailsPath = path.join(baseDir, `${projectId}-details.json`);
    try {
      if (fs.existsSync(detailsPath)) {
        const existingData = JSON.parse(await fs.readFile(detailsPath, 'utf8'));
        details = { ...existingData };
        console.log('Loaded existing project details');
      } else {
        console.log('No existing project details found, creating new details');
      }
    } catch (e) {
      console.warn('Failed to load existing details:', e.message);
    }
  }
  
  // Ensure key_project_details exists
  if (!details.key_project_details) {
    details.key_project_details = {};
  }
  
  // Ensure basic fields are set
  const kpd = details.key_project_details;
  kpd.builder_id = kpd.builder_id || builderId;
  kpd.builder_name = projectData.builderName; // Single source of truth from builders.json
  kpd.builder_logo = projectData.builderLogo; // Single source of truth from builders.json
  kpd.project_id = kpd.project_id || projectId;
  kpd.project_name = projectData.projectName; // Single source of truth from builders.json
  kpd.project_logo = projectData.projectLogo; // Single source of truth from builders.json
  
  // Set location data from locations.json (single source of truth)
  kpd.project_city = projectData.city || '';
  kpd.project_location = projectData.location || '';
  
  // Ensure all standard metadata fields exist (preserve existing values or set to empty)
  if (!kpd.hasOwnProperty('flats_per_floor')) kpd.flats_per_floor = "";
  if (!kpd.hasOwnProperty('config')) kpd.config = "";
  if (!kpd.hasOwnProperty('flat_sizes')) kpd.flat_sizes = "";
  if (!kpd.hasOwnProperty('total_flats')) kpd.total_flats = "";
  if (!kpd.hasOwnProperty('flats_per_acre')) kpd.flats_per_acre = "";
  
  kpd.scrapedAt = new Date().toISOString();
  
  if (!kpd.videos) kpd.videos = [];
  
  // Build media collections from existing files
  console.log('Scanning media folders...');
  const mediaCollections = await buildMediaCollections(mediaDir);
  
  // Log what was found
  for (const [subfolder, files] of Object.entries(mediaCollections)) {
    if (files.length > 0) {
      console.log(`Found ${files.length} files in ${subfolder}/`);
    }
  }
  
  // Merge media collections into details
  for (const subfolder of SUBFOLDERS) {
    const collected = (mediaCollections[subfolder] || []).filter(p => {
      const b = path.basename(p || '');
      return b && !b.startsWith('.') && b.toLowerCase() !== '.ds_store';
    });
    
    // Handle amenities specially (preserve object structure)
    if (subfolder === 'amenities') {
      if (details.amenities && Array.isArray(details.amenities)) {
        // Merge files with existing amenity objects
        await mergeAmenitiesFiles(details, mediaCollections);
      }
      // Also store as amenities_files for reference
      details.amenities_files = collected;
    } else {
      // For other subfolders, just store the file list
      details[subfolder] = collected;
    }
  }
  
  // Simplify amenities
  simplifyAmenities(details, builderId, projectId);
  
  // Remove amenities_files after merging
  if (details.amenities_files) {
    delete details.amenities_files;
  }
  
  // Set logo references in key_project_details
  try {
    const logosArr = Array.isArray(details.logos) ? details.logos : [];
    if (logosArr.length) {
      kpd.builder_logo = kpd.builder_logo || logosArr[0];
      kpd.project_logo = kpd.project_logo || (logosArr[1] || logosArr[0]);
    }
  } catch (e) {
    console.warn('Failed to set logo references:', e.message);
  }
  
  // Build final output structure
  const finalOutput = {
    scrapedAt: new Date().toISOString(),
    key_project_details: kpd
  };
  
  // Add media arrays
  for (const subfolder of SUBFOLDERS) {
    finalOutput[subfolder] = details[subfolder] || [];
  }
  
  // Add amenities if they exist
  if (details.amenities) {
    finalOutput.amenities = details.amenities;
  }
  
  // Save the JSON file
  const detailsJsonPath = path.join(baseDir, `${projectId}-details.json`);
  await fs.writeJson(detailsJsonPath, finalOutput, { spaces: 2 });
  
  console.log(`\nProject JSON built successfully!`);
  console.log(`Builder: ${kpd.builder_name}`);
  console.log(`Project: ${kpd.project_name}`);
  if (kpd.project_city && kpd.project_location) {
    console.log(`Location: ${kpd.project_location}, ${kpd.project_city}`);
  }
  console.log(`Saved to: ${detailsJsonPath}`);
  
  // Summary
  let totalFiles = 0;
  for (const subfolder of SUBFOLDERS) {
    const count = (finalOutput[subfolder] || []).length;
    if (count > 0) {
      console.log(`  ${subfolder}: ${count} files`);
      totalFiles += count;
    }
  }
  
  if (finalOutput.amenities && finalOutput.amenities.length > 0) {
    console.log(`  amenities: ${finalOutput.amenities.length} items`);
  }
  
  console.log(`\nTotal files: ${totalFiles}`);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, buildMediaCollections, cleanMediaDir };
