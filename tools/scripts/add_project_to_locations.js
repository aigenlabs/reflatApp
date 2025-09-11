// Adds a project to locations.json in the correct city/location, avoiding duplicates
const fs = require('fs');
const path = require('path');

if (process.argv.length < 6) {
  console.error('Usage: node add_project_to_locations.js <builder_id> <project_id> <project_name> <city> <location>');
  process.exit(1);
}

const [builder_id, project_id, project_name_raw, city_raw, location_raw] = process.argv.slice(2);

// Basic validation and normalization
const project_name = project_name_raw ? String(project_name_raw).trim() : '';
const city = city_raw ? String(city_raw).trim() : '';
const location = location_raw ? String(location_raw).trim() : '';

if (!builder_id || !project_id) {
  console.error('builder_id and project_id are required');
  process.exit(1);
}
if (!project_name) {
  console.error('project_name is required and must not be empty');
  process.exit(1);
}
if (!city || !location) {
  console.error('city and location are required and must not be empty');
  process.exit(1);
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
let entry = locations.find(e => String(e.city).trim() === city && String(e.location).trim() === location);
if (!entry) {
  entry = { city, location, projects: [] };
  locations.push(entry);
}

// Ensure projects array exists on entry
if (!Array.isArray(entry.projects)) entry.projects = [];

// Check for duplicate project
if (!entry.projects.some(p => p.builder_id === builder_id && p.project_id === project_id)) {
  entry.projects.push({ name: project_name, builder_id, project_id });
  console.log(`Added project ${project_name} to ${city} / ${location}`);
} else {
  console.log('Project already exists in locations.json');
}

// Write atomically: write to temp file then rename
try {
  const tmpPath = locationsPath + '.tmp';
  fs.mkdirSync(path.dirname(locationsPath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(locations, null, 2), 'utf8');
  fs.renameSync(tmpPath, locationsPath);
  console.log('locations.json updated at', locationsPath);
  process.exit(0);
} catch (err) {
  console.error('Failed to write locations.json:', err.message);
  process.exit(1);
}
