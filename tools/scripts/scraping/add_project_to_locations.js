// Adds a project to locations.json, automatically extracting data from project details
const fs = require('fs');
const path = require('path');

// Support two usage modes:
// 1. Automatic: node add_project_to_locations.js <builder_id> <project_id>
//    - Reads data from {project_id}-details.json automatically
// 2. Manual: node add_project_to_locations.js <builder_id> <project_id> <project_name> <city> <location>
//    - Uses provided parameters (legacy mode)

if (process.argv.length < 4) {
  console.error('Usage: node add_project_to_locations.js <builder_id> <project_id> [project_name] [city] [location]');
  console.error('  Automatic mode: Reads from project-details.json (recommended)');
  console.error('  Manual mode: Provide all parameters explicitly');
  process.exit(1);
}

const [builder_id, project_id, project_name_raw, city_raw, location_raw] = process.argv.slice(2);
const isAutomaticMode = process.argv.length === 4; // Only builder_id and project_id provided

// Basic validation and normalization. Treat literal 'undefined'/'null' strings as missing values.
function normalizeVal(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return '';
  return s;
}

const project_name = normalizeVal(project_name_raw);
const city_manual = normalizeVal(city_raw);
const location_manual = normalizeVal(location_raw);

// In automatic mode, extract data from project details JSON
let projectData = {};
if (isAutomaticMode) {
  const projectDetailsPath = path.join(__dirname, '..', 'data', builder_id, project_id, `${project_id}-details.json`);
  
  if (!fs.existsSync(projectDetailsPath)) {
    console.error(`❌ Project details not found: ${projectDetailsPath}`);
    console.error('💡 Run build_project_json.js first or use manual mode');
    process.exit(1);
  }
  
  try {
    const detailsRaw = fs.readFileSync(projectDetailsPath, 'utf8');
    const details = JSON.parse(detailsRaw);
    const kpd = details.key_project_details || {};
    
    projectData = {
      project_name: normalizeVal(kpd.project_name),
      city: normalizeVal(kpd.project_city),
      location: normalizeVal(kpd.project_location),
      builder_name: normalizeVal(kpd.builder_name),
      gps: kpd.gps && typeof kpd.gps === 'object' ? {
        lat: parseFloat(kpd.gps.lat || 0),
        lng: parseFloat(kpd.gps.lng || 0)
      } : null
    };
    
    console.log(`📋 Auto-extracted project data:`);
    console.log(`   Builder: ${projectData.builder_name} (${builder_id})`);
    console.log(`   Project: ${projectData.project_name} (${project_id})`);
    if (projectData.city && projectData.location) {
      console.log(`   Location: ${projectData.location}, ${projectData.city}`);
    }
    if (projectData.gps && projectData.gps.lat && projectData.gps.lng) {
      console.log(`   GPS: ${projectData.gps.lat}, ${projectData.gps.lng}`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to read project details: ${error.message}`);
    process.exit(1);
  }
} else {
  // Manual mode: use provided parameters
  projectData = {
    project_name: project_name,
    city: city_manual,
    location: location_manual,
    builder_name: '', // Not available in manual mode
    gps: null
  };
  
  console.log(`📝 Using provided parameters:`);
  console.log(`   Project: ${project_name} (${project_id})`);
  console.log(`   Location: ${location_manual}, ${city_manual}`);
}

// Validate required data
if (!builder_id || !project_id) {
  console.error('❌ builder_id and project_id are required');
  process.exit(1);
}

if (!projectData.project_name) {
  console.error(`❌ project_name is required for ${builder_id}/${project_id}`);
  if (isAutomaticMode) {
    console.error('💡 Check key_project_details.project_name in the project JSON file');
  } else {
    console.error('💡 Provide project_name as the third parameter');
  }
  process.exit(1);
}

// In automatic mode, we're more flexible about city/location (they can be empty)
// In manual mode, we require them as before for backward compatibility
if (!isAutomaticMode) {
  if (!projectData.city || !projectData.location) {
    console.error('❌ In manual mode, city and location are required');
    console.error('💡 Use automatic mode: node add_project_to_locations.js <builder> <project>');
    process.exit(1);
  }
}

const locationsPath = path.join(__dirname, '../data/locations.json');

let locations = [];
if (fs.existsSync(locationsPath)) {
  try {
    const raw = fs.readFileSync(locationsPath, 'utf8');
    locations = JSON.parse(raw || '[]');
  } catch (err) {
    // If parsing fails, make a backup and continue with empty locations
    try {
      const bak = locationsPath + '.corrupt.' + Date.now();
      fs.copyFileSync(locationsPath, bak);
      console.warn(`locations.json parse failed; original file backed up to ${bak}. Proceeding with empty locations array.`);
      locations = [];
    } catch (copyErr) {
      console.error('Failed to back up corrupt locations.json:', copyErr.message);
      process.exit(1);
    }
  }
}

// Find or create the city/location entry  
const entryCity = projectData.city || 'Unknown City';
const entryLocation = projectData.location || 'Unknown Location';

let entry = locations.find(e => String(e.city).trim() === entryCity && String(e.location).trim() === entryLocation);
if (!entry) {
  entry = { city: entryCity, location: entryLocation, projects: [] };
  locations.push(entry);
  console.log(`📁 Created new location entry: ${entryLocation}, ${entryCity}`);
}

// Ensure projects array exists on entry
if (!Array.isArray(entry.projects)) entry.projects = [];

// Check for duplicate project
const existingProject = entry.projects.find(p => p.builder_id === builder_id && p.project_id === project_id);

if (!existingProject) {
  const newProject = { 
    builder_id, 
    project_id
  };
  
  entry.projects.push(newProject);
  console.log(`✅ Added project "${projectData.project_name}" (${builder_id}/${project_id}) to ${entryLocation}, ${entryCity}`);
} else {
  // Project already exists, no updates needed since we only store builder_id and project_id
  console.log(`� Project "${projectData.project_name}" (${builder_id}/${project_id}) already exists in ${entryLocation}, ${entryCity}`);
}

// Write atomically: write to temp file then rename
try {
  const tmpPath = locationsPath + '.tmp';
  fs.mkdirSync(path.dirname(locationsPath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(locations, null, 2), 'utf8');
  fs.renameSync(tmpPath, locationsPath);
  console.log(`💾 locations.json updated: ${locationsPath}`);
  console.log(`📊 Total locations: ${locations.length}`);
  console.log(`📍 Projects in ${entryLocation}, ${entryCity}: ${entry.projects.length}`);
  process.exit(0);
} catch (err) {
  console.error('❌ Failed to write locations.json:', err.message);
  process.exit(1);
}
