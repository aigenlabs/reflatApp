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
 * Check if a file is valid by examining its header bytes
 * @param {string} filePath - Path to the file to validate
 * @returns {boolean} - True if file appears valid
 */
function isValidLocalFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size === 0) return false;
    
    const buffer = fs.readFileSync(filePath, { start: 0, end: Math.min(16, stats.size - 1) });
    if (!buffer || buffer.length === 0) return false;
    
    // Check for common file signatures
    const hex = buffer.toString('hex').toLowerCase();
    
    // Image formats
    if (hex.startsWith('ffd8ff')) return true; // JPEG
    if (hex.startsWith('89504e47')) return true; // PNG
    if (hex.startsWith('47494638')) return true; // GIF
    if (hex.startsWith('52494646') && hex.includes('57454250')) return true; // WebP
    if (hex.startsWith('3c3f786d6c') || hex.startsWith('3c737667')) return true; // SVG
    
    // PDF
    if (hex.startsWith('25504446')) return true; // PDF
    
    // Documents
    if (hex.startsWith('504b0304')) return true; // ZIP-based (DOCX, PPTX, etc.)
    if (hex.startsWith('d0cf11e0')) return true; // DOC, XLS, PPT
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Standardized media subfolders used across all scripts
 */
const SUBFOLDERS = [
  'logos', 'floor_plans', 'brochures', 'banners', 'photos', 
  'layouts', 'news', 'documents', 'amenities'
];

module.exports = {
  findProjectLocation,
  findBuilderProjectNames,
  getProjectData,
  isValidLocalFile,
  SUBFOLDERS
};
