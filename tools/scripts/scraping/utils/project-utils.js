/**
 * project-utils.js - Common utilities for project data management
 * 
 * This module provides shared functionality for both scrape_project.js and build_project_json.js
 * including location lookup, builder/project name resolution, and data validation.
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Find project location and city from locations.json
 * @param {string} builderId - The builder ID
 * @param {string} projectId - The project ID
 * @param {string} locationsPath - Path to locations.json file
 * @returns {object} - Object with location and city properties
 */
function findProjectLocation(builderId, projectId, locationsPath) {
  try {
    if (!fs.existsSync(locationsPath)) {
      console.warn('locations.json not found, location fields will be blank');
      return { location: '', city: '' };
    }
    
    const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    
    for (const locationEntry of locations) {
      const project = locationEntry.projects.find(p => 
        p.builder_id === builderId && p.project_id === projectId
      );
      
      if (project) {
        console.log(`Found project in locations.json: ${locationEntry.city}, ${locationEntry.location}`);
        return {
          location: locationEntry.location,
          city: locationEntry.city
        };
      }
    }
    
    console.warn(`Project ${builderId}/${projectId} not found in locations.json - location fields will be blank`);
    return { location: '', city: '' };
  } catch (e) {
    console.warn('Failed to read locations.json:', e.message, '- location fields will be blank');
    return { location: '', city: '' };
  }
}

/**
 * Find builder and project names and logos from builders.json
 * @param {string} builderId - The builder ID
 * @param {string} projectId - The project ID
 * @param {string} buildersPath - Path to builders.json file
 * @returns {object} - Object with builderName, projectName, builderLogo, and projectLogo properties
 */
function findBuilderProjectNames(builderId, projectId, buildersPath) {
  try {
    if (!fs.existsSync(buildersPath)) {
      console.warn('builders.json not found, using IDs as names');
      return { 
        builderName: builderId, 
        projectName: projectId,
        builderLogo: '',
        projectLogo: ''
      };
    }
    
    const buildersData = JSON.parse(fs.readFileSync(buildersPath, 'utf8'));
    
    // Handle both possible structures
    const builders = buildersData.builders || buildersData;
    
    for (const builder of builders) {
      if (builder.builderId === builderId) {
        const project = builder.projects.find(p => p.projectId === projectId);
        
        if (project) {
          console.log(`Found builder/project data: ${builder.builderName}, ${project.projectName}`);
          return {
            builderName: builder.builderName,
            projectName: project.projectName,
            builderLogo: builder.builder_logo || '',
            projectLogo: project.project_logo || ''
          };
        } else {
          console.warn(`Project ${projectId} not found for builder ${builderId} in builders.json`);
          return {
            builderName: builder.builderName,
            projectName: projectId,
            builderLogo: builder.builder_logo || '',
            projectLogo: ''
          };
        }
      }
    }
    
    console.warn(`Builder ${builderId} not found in builders.json - using IDs as names`);
    return { 
      builderName: builderId, 
      projectName: projectId,
      builderLogo: '',
      projectLogo: ''
    };
  } catch (e) {
    console.warn('Failed to read builders.json:', e.message, '- using IDs as names');
    return { 
      builderName: builderId, 
      projectName: projectId,
      builderLogo: '',
      projectLogo: ''
    };
  }
}

/**
 * Get standardized project data from both locations.json and builders.json
 * @param {string} builderId - The builder ID
 * @param {string} projectId - The project ID
 * @param {string} locationsPath - Path to locations.json file
 * @param {string} buildersPath - Path to builders.json file
 * @returns {object} - Combined project data with location, city, builderName, projectName, builderLogo, and projectLogo
 */
function getProjectData(builderId, projectId, locationsPath, buildersPath) {
  const locationData = findProjectLocation(builderId, projectId, locationsPath);
  const nameData = findBuilderProjectNames(builderId, projectId, buildersPath);
  
  return {
    location: locationData.location,
    city: locationData.city,
    builderName: nameData.builderName,
    projectName: nameData.projectName,
    builderLogo: nameData.builderLogo,
    projectLogo: nameData.projectLogo
  };
}

/**
 * Get builder and project details from builders.json (scraping script structure)
 * @param {string} builderId
 * @param {string} projectId
 * @param {string} buildersPath
 * @returns {object|null}
 */
function getBuilderProjectDetails(builderId, projectId, buildersPath) {
  try {
    const buildersData = JSON.parse(fs.readFileSync(buildersPath, 'utf8'));
    const builders = buildersData.builders || buildersData;
    const builder = builders.find(b => b.builderId === builderId);
    if (!builder) return null;
    const project = builder.projects.find(p => p.projectId === projectId);
    if (!project) return null;
    return {
      builder_id: builder.builderId,
      builder_name: builder.builderName,
      builder_logo: builder.builder_logo || '',
      project_id: project.projectId,
      project_name: project.projectName,
      project_logo: project.project_logo || ''
    };
  } catch (error) {
    console.error('Error reading builders.json:', error.message);
    return null;
  }
}

/**
 * Get location and city from locations.json (scraping script structure)
 * @param {string} builderId
 * @param {string} projectId
 * @param {string} locationsPath
 * @returns {object|null}
 */
function getLocationDetails(builderId, projectId, locationsPath) {
  try {
    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
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

/**
 * Unified project metadata for scraping/build scripts
 * @param {string} builderId
 * @param {string} projectId
 * @param {string} locationsPath
 * @param {string} buildersPath
 * @returns {object} - { builder_id, builder_name, builder_logo, project_id, project_name, project_logo, city, location }
 */
function getUnifiedProjectData(builderId, projectId, locationsPath, buildersPath) {
  const builderData = getBuilderProjectDetails(builderId, projectId, buildersPath) || {};
  const locationData = getLocationDetails(builderId, projectId, locationsPath) || {};
  return {
    ...builderData,
    ...locationData
  };
}

/**
 * Validate if a local file is valid (not empty, has proper extension, basic header check)
 * @param {string} filePath - Path to the file to validate
 * @returns {boolean} - True if file appears valid
 */
function isValidLocalFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return false;
    if (stats.size === 0) return false;

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.pdf', '.bmp', '.docx', '.doc', '.pptx', '.ppt'];
    if (!validExtensions.includes(ext)) return false;

    // Basic file header validation for common types
    try {
      const buffer = fs.readFileSync(filePath, { encoding: null });
      if (buffer.length < 4) return false;

      // Check magic numbers for common file types
      const header = buffer.slice(0, 12);

      if (ext === '.pdf' && header.toString('ascii', 0, 4) !== '%PDF') return false;
      if ((ext === '.jpg' || ext === '.jpeg') && (header[0] !== 0xFF || header[1] !== 0xD8)) return false;
      if (ext === '.png' && (header[0] !== 0x89 || header[1] !== 0x50 || header[2] !== 0x4E || header[3] !== 0x47)) return false;
      if (ext === '.gif' && header.toString('ascii', 0, 3) !== 'GIF') return false;
      if (ext === '.webp') {
        const riff = header.toString('ascii', 0, 4);
        const webp = header.toString('ascii', 8, 12);
        if (riff !== 'RIFF' || webp !== 'WEBP') return false;
      }

      return true;
    } catch (e) {
      // If we can't read the file, consider it invalid
      return false;
    }
  } catch (e) {
    return false;
  }
}

/**
 * Standardized media subfolders used across all scripts (minimal approach)
 * Aligned with scrape_project_minimal.js - excludes amenities, logos, news, documents, banners
 */
const SUBFOLDERS = [
  'floor_plans', 'photos', 'layouts', 'brochures'
];

module.exports = {
  findProjectLocation,
  findBuilderProjectNames,
  getProjectData,
  getBuilderProjectDetails,
  getLocationDetails,
  getUnifiedProjectData,
  isValidLocalFile,
  SUBFOLDERS
};
