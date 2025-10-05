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
const { getProjectData, getBuilderProjectDetails, isValidLocalFile } = require('../project-utils');

// Use minimal media subfolders like scrape_project_minimal.js
const SUBFOLDERS = ['floor_plans', 'photos', 'layouts', 'brochures'];

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
 * Merge media collections into details
 */
function mergeMediaCollections(details, mediaCollections) {
  for (const subfolder of SUBFOLDERS) {
    // Always overwrite with fresh scan results
    details[subfolder] = Array.isArray(mediaCollections[subfolder]) ? [...mediaCollections[subfolder]] : [];
  }
}

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
  
  // Get builder/project details from builders.json
  const builderProjectDetails = getBuilderProjectDetails(builderId, projectId, buildersPath);
  if (!builderProjectDetails) {
    console.error('Builder/project not found in builders.json');
    process.exit(1);
  }

  // Ensure key_project_details exists
  if (!details.key_project_details) {
    details.key_project_details = {};
  }
  const kpd = details.key_project_details;
  kpd.builder_id = builderProjectDetails.builder_id;
  kpd.builder_name = builderProjectDetails.builder_name;
  kpd.project_id = builderProjectDetails.project_id;
  kpd.project_name = builderProjectDetails.project_name;
  kpd.builder_logo = builderProjectDetails.builder_logo;
  kpd.project_logo = builderProjectDetails.project_logo;
  kpd.scrapedAt = new Date().toISOString();

  // Ensure all standard metadata fields exist (preserve existing values or set to empty)
  if (!kpd.hasOwnProperty('flats_per_floor')) kpd.flats_per_floor = "";
  if (!kpd.hasOwnProperty('config')) kpd.config = "";
  if (!kpd.hasOwnProperty('flat_sizes')) kpd.flat_sizes = "";
  if (!kpd.hasOwnProperty('total_flats')) kpd.total_flats = "";
  if (!kpd.hasOwnProperty('flats_per_acre')) kpd.flats_per_acre = "";

  // Add location fields to key_project_details
  if (projectData.location && !kpd.project_location) kpd.project_location = projectData.location;
  if (projectData.city && !kpd.project_city) kpd.project_city = projectData.city;

  // Ensure other fields exist with empty defaults to match minimal script structure
  if (!kpd.hasOwnProperty('rera_number')) kpd.rera_number = "";
  if (!kpd.hasOwnProperty('total_acres')) kpd.total_acres = "";
  if (!kpd.hasOwnProperty('total_towers')) kpd.total_towers = null;
  if (!kpd.hasOwnProperty('total_floors')) kpd.total_floors = "";
  if (!kpd.hasOwnProperty('total_flats')) kpd.total_flats = "";
  if (!kpd.hasOwnProperty('open_space_percent')) kpd.open_space_percent = "";
  if (!kpd.hasOwnProperty('gps')) kpd.gps = { lat: null, lng: null };
  if (!kpd.hasOwnProperty('url')) kpd.url = "";
  if (!kpd.hasOwnProperty('videos')) kpd.videos = [];
  
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
  mergeMediaCollections(details, mediaCollections);
  
  // Set logo references to match minimal script approach (use defaults from builders.json)
  try {
    // Use logos from builders.json or set defaults like minimal script
    if (!kpd.builder_logo) {
      kpd.builder_logo = builderProjectDetails.builder_logo || `${builderId}/${builderId}_logo.webp`;
    }
    if (!kpd.project_logo) {
      kpd.project_logo = builderProjectDetails.project_logo || `logos/${projectId}_logo.webp`;
    }
  } catch (e) {
    console.warn('Failed to set logo references:', e.message);
  }
  
  // Build final output structure to match scraping script format
  const finalOutput = {
    scrapedAt: new Date().toISOString(),
    key_project_details: kpd
  };

  // Add media arrays for all subfolders
  for (const subfolder of SUBFOLDERS) {
    finalOutput[subfolder] = details[subfolder] || [];
  }

  // Add amenities array if it exists (preserve existing structure)
  // NOTE: Commented out as scraping script doesn't handle amenities - keeping for future use
  /*
  if (details.amenities && Array.isArray(details.amenities)) {
    finalOutput.amenities = details.amenities;
  } else {
    finalOutput.amenities = [];
  }

  // Handle any existing amenities from previous runs
  if (preserveDetails && !finalOutput.amenities.length) {
    const detailsPath = path.join(baseDir, `${projectId}-details.json`);
    try {
      if (fs.existsSync(detailsPath)) {
        const existingData = JSON.parse(await fs.readFile(detailsPath, 'utf8'));
        if (existingData.amenities && Array.isArray(existingData.amenities)) {
          finalOutput.amenities = existingData.amenities;
        }
      }
    } catch (e) {
      // Ignore errors, amenities will remain empty array
    }
  }
  */
  
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

  // Display amenities count if present (commented out - amenities not handled)
  // if (finalOutput.amenities && finalOutput.amenities.length > 0) {
  //   console.log(`Amenities: ${finalOutput.amenities.length} items`);
  // }
  
  // Summary
  let totalFiles = 0;
  for (const subfolder of SUBFOLDERS) {
    const count = (finalOutput[subfolder] || []).length;
    if (count > 0) {
      console.log(`  ${subfolder}: ${count} files`);
      totalFiles += count;
    }
  }

  console.log(`\nTotal media files: ${totalFiles}`);
  console.log(`Project structure aligned with scraping script format.`);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, buildMediaCollections, cleanMediaDir };
