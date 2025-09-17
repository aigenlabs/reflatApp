#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

/**
 * Update project metadata fields in the key_project_details section
 * Usage: node update_project_metadata.js <builderId> <projectId> [field=value ...]
 * 
 * Example:
 * node update_project_metadata.js myhome grava flats_per_floor=8 config="2/3 BHK" total_flats=1200
 */

async function updateProjectMetadata() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node update_project_metadata.js <builderId> <projectId> [field=value ...]');
    console.error('');
    console.error('Available metadata fields:');
    console.error('  flats_per_floor     - Number of flats per floor');
    console.error('  config              - BHK configuration (e.g., "2/2.5/3 BHK")');
    console.error('  flat_sizes          - Size ranges (e.g., "1399-2347 SFT")');
    console.error('  total_flats         - Total number of flats');
    console.error('  flats_per_acre      - Density (flats per acre)');
    console.error('');
    console.error('Example:');
    console.error('  node update_project_metadata.js myhome grava flats_per_floor=8 config="2/3 BHK"');
    process.exit(1);
  }

  const builderId = args[0];
  const projectId = args[1];
  const updates = {};

  // Parse field=value pairs
  for (let i = 2; i < args.length; i++) {
    const [field, value] = args[i].split('=');
    if (!field || value === undefined) {
      console.error(`Invalid format: ${args[i]} (expected field=value)`);
      process.exit(1);
    }
    updates[field] = value;
  }

  // Construct paths
  const projectPath = path.join(__dirname, '..', 'data', builderId, projectId);
  const detailsPath = path.join(projectPath, `${projectId}-details.json`);

  if (!fs.existsSync(detailsPath)) {
    console.error(`Project details not found: ${detailsPath}`);
    process.exit(1);
  }

  try {
    // Load existing details
    const details = await fs.readJson(detailsPath);
    
    if (!details.key_project_details) {
      console.error('No key_project_details section found in project JSON');
      process.exit(1);
    }

    // Apply updates
    let changesMade = false;
    for (const [field, value] of Object.entries(updates)) {
      const oldValue = details.key_project_details[field];
      details.key_project_details[field] = value;
      console.log(`${field}: "${oldValue}" -> "${value}"`);
      changesMade = true;
    }

    if (changesMade) {
      // Update scrapedAt timestamp
      details.key_project_details.scrapedAt = new Date().toISOString();
      
      // Save updated details
      await fs.writeJson(detailsPath, details, { spaces: 2 });
      console.log(`\nUpdated ${Object.keys(updates).length} fields in ${detailsPath}`);
    } else {
      console.log('No changes to apply');
    }

  } catch (error) {
    console.error('Error updating project metadata:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  updateProjectMetadata().catch(err => {
    console.error('Update failed:', err);
    process.exit(1);
  });
}

module.exports = { updateProjectMetadata };
