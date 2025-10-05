const path = require('path');
const fs = require('fs-extra');

/**
 * Load builder and project details from builders.json
 * @param {string} builderId
 * @param {string} projectId
 * @param {string} [buildersPath]
 * @returns {object|null}
 */
function getBuilderProjectDetails(builderId, projectId, buildersPath) {
  try {
    const filePath = buildersPath || path.join(__dirname, '..', 'data', 'builders.json');
    const buildersData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const builder = buildersData.builders.find(b => b.builderId === builderId);
    if (!builder) return null;
    const project = builder.projects.find(p => p.projectId === projectId);
    if (!project) return null;
    return {
      builder_id: builder.builderId,
      builder_name: builder.builderName,
      builder_logo: builder.builder_logo,
      project_id: project.projectId,
      project_name: project.projectName,
      project_logo: project.project_logo
    };
  } catch (error) {
    console.error('Error reading builders.json:', error.message);
    return null;
  }
}

/**
 * Load location and city from locations.json for a builder/project
 * @param {string} builderId
 * @param {string} projectId
 * @param {string} [locationsPath]
 * @returns {object|null}
 */
function getLocationDetails(builderId, projectId, locationsPath) {
  try {
    const filePath = locationsPath || path.join(__dirname, '..', 'data', 'locations.json');
    const locationsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const entry of locationsData) {
      const found = entry.projects.find(p => p.builder_id === builderId && p.project_id === projectId);
      if (found) {
        return {
          city: entry.city,
          location: entry.location
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error reading locations.json:', error.message);
    return null;
  }
}

module.exports = { getBuilderProjectDetails, getLocationDetails };
