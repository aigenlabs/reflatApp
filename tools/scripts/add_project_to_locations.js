// Adds a project to locations.json in the correct city/location, avoiding duplicates
const fs = require('fs');
const path = require('path');

if (process.argv.length < 6) {
  console.error('Usage: node add_project_to_locations.js <builder_id> <project_id> <project_name> <city> <location>');
  process.exit(1);
}

const [builder_id, project_id, project_name, city, location] = process.argv.slice(2);
const locationsPath = path.join(__dirname, '../data/locations.json');

let locations = [];
if (fs.existsSync(locationsPath)) {
  locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
}

// Find or create the city/location entry
let entry = locations.find(e => e.city === city && e.location === location);
if (!entry) {
  entry = { city, location, projects: [] };
  locations.push(entry);
}

// Check for duplicate project
if (!entry.projects.some(p => p.builder_id === builder_id && p.project_id === project_id)) {
  entry.projects.push({ name: project_name, builder_id, project_id });
  console.log(`Added project ${project_name} to ${city} / ${location}`);
} else {
  console.log('Project already exists in locations.json');
}

fs.writeFileSync(locationsPath, JSON.stringify(locations, null, 2));
console.log('locations.json updated.');
