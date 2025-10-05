# Project Management Scripts

This directory contains scripts for managing real estate project data, including web scraping, JSON building, and centralized amenity management:

## 1. scrape_project.js - Web Scraping and Media Download

**Purpose**: Scrapes project details and media from real estate project websites.

**Usage**:
```bash
node scrape_project.js <builderId> <projectId> <websiteUrl>
```

**Example**:
```bash
node scrape_project.js myhome grava https://myhomeconstructions.com/ongoing-projects/grava/
```

**Features**:
- Extracts project details (name, description, GPS coordinates)
- Uses locations.json as single source of truth for location and city data
- Downloads media into organized subfolders
- Filters out social media platform URLs and images
- Automatically categorizes images (logo → logos folder, banner → banners folder)
- Extracts amenities with associated icons
- Attempts to parse key highlights for numeric fields
- Reverse geocoding for address details (suburb, GPS)
- Deduplicates media using SHA256 hashes
- Creates comprehensive project-details.json

## 2. build_project_json.js - JSON Builder from Existing Files

**Purpose**: Builds project JSON from existing folder contents without web scraping.

**Usage**:
```bash
node build_project_json.js <builderId> <projectId> [options]
```

**Options**:
- `--preserve-details`: Preserve existing project details from JSON (default)
- `--minimal-details`: Create minimal project details only

**Examples**:
```bash
# Rebuild JSON preserving existing details
node build_project_json.js myhome grava

# Create minimal JSON from files only
node build_project_json.js myhome grava --minimal-details
```

**Use Cases**:
- Updating JSON after manually organizing files
- Rebuilding JSON after file deletions/additions
- Creating JSON for projects where media was sourced offline
- Quick refresh of file listings without re-scraping
- Ensuring location data consistency with locations.json

## 3. 🎯 Centralized Amenity Management System

**New centralized system for managing amenities across all projects!**

### amenity-cli.js - Command Line Interface

**Purpose**: Manage amenities for all projects from a central configuration.

**Quick Start**:
```bash
# View all projects and their amenity counts
node amenity-cli.js list

# View amenities for a specific project
node amenity-cli.js list myhome apas

# Add amenity to a project
node amenity-cli.js add myhome apas spa

# Remove amenity from a project
node amenity-cli.js remove myhome apas tennis-court

# Set all amenities for a project
node amenity-cli.js set myhome apas swimming-pool gym tennis-court clubhouse

# DEPRECATED: Sync existing amenities from project JSON to central config
# node amenity-cli.js sync myhome apas  # ⚠️ RISKY: Can overwrite curated config

# Apply centralized amenities back to project JSON
node amenity-cli.js apply myhome apas

# Show all available standard amenities
node amenity-cli.js available
```

### standardize-amenities.js - Legacy + Migration Tool

**Purpose**: Standardize amenities and migrate to centralized system.

**Usage**:
```bash
# Get help for centralized system
node standardize-amenities.js central

# Legacy standardization (not recommended)
node standardize-amenities.js test myhome apas
```

### Key Benefits of Centralized System

✅ **Centralized Configuration**: `tools/data/common/project-amenities.json`  
✅ **Builder Defaults**: Common amenities for all projects of a builder  
✅ **Standardized Icons**: All icons in `tools/data/common/amenities/standard/`  
✅ **Easy Bulk Operations**: Add/remove amenities across multiple projects  
✅ **Version Control Friendly**: JSON config is easy to track and merge  
✅ **Backward Compatible**: Existing project JSON files still work  

### Migration Workflow

```bash
# 1. MANUAL: Review existing project amenities and configure centrally
node amenity-cli.js list myhome apas  # See current amenities
node amenity-cli.js set myhome apas swimming-pool gym spa clubhouse  # Set manually

# 2. Manage amenities centrally going forward
node amenity-cli.js add myhome apas new-amenity
node amenity-cli.js remove myhome apas old-amenity

# 3. Apply changes back to project JSON
node amenity-cli.js apply myhome apas
```

## Workflow

### Fresh Project Scraping
```bash
# 1. Scrape website and download media
node scrape_project.js myhome grava https://example.com

# 2. MANUAL: Configure amenities centrally (review scraped amenities first)
node amenity-cli.js list myhome grava  # Check what was scraped
node amenity-cli.js set myhome grava swimming-pool gym tennis-court  # Set manually

# 3. Manually organize files if needed
# (move files between subfolders, delete unwanted files, etc.)

# 4. Rebuild JSON to reflect manual changes
node build_project_json.js myhome grava

# 5. Fine-tune amenities centrally
node amenity-cli.js add myhome grava spa
node amenity-cli.js apply myhome grava
```

### Update Existing Project
```bash
# Option 1: Full re-scrape (gets latest content from website)
node scrape_project.js myhome grava https://example.com
# MANUAL: Review and configure amenities centrally after scraping

# Option 2: Just rebuild JSON from existing files
node build_project_json.js myhome grava

# Option 3: Update amenities only
node amenity-cli.js add myhome grava new-amenity
node amenity-cli.js apply myhome grava
```

### Bulk Amenity Management
```bash
# View all projects
node amenity-cli.js list

# Add amenity to multiple projects
node amenity-cli.js add myhome project1 spa
node amenity-cli.js add myhome project2 spa
node amenity-cli.js add aparna project3 spa

# Apply changes to all projects
node amenity-cli.js apply myhome project1
node amenity-cli.js apply myhome project2
node amenity-cli.js apply aparna project3
```

## Media Organization

### Project Structure
All scripts work with this standardized folder structure:

```
tools/data/
├── common/                           # 🆕 Centralized resources
│   ├── amenities/standard/          # Standard amenity icons
│   └── project-amenities.json      # Central amenity configuration
├── <builderId>/<projectId>/         # Individual projects
│   ├── <projectId>-details.json
│   └── media/
│       ├── logos/
│       ├── floor_plans/
│       ├── brochures/
│       ├── banners/
│       ├── photos/
│       ├── layouts/
│       ├── news/
│       ├── documents/
│       └── amenities/               # Project-specific amenity files
```

### Amenity Icon Paths
- **Legacy**: `amenities/standard/icon-name.webp`
- **New**: `common/amenities/standard/icon-name.webp` ✅

The centralized system automatically uses the new paths for consistency across all projects.

## Key Benefits of Split Architecture

1. **Separation of Concerns**: Web scraping logic is separate from file management logic
2. **Single Source of Truth**: Location data comes only from locations.json for consistency
3. **Flexibility**: Can update JSON without re-scraping websites
4. **Manual Curation**: Easy to manually organize files and rebuild JSON
5. **Performance**: Quick JSON updates for file management tasks
6. **Reliability**: If scraping fails, can still work with existing files
7. **Development**: Easier to test and maintain individual components
8. **Data Consistency**: All projects use standardized location data

## Dependencies

### Core Scripts
```bash
npm install axios cheerio node-fetch@2 fs-extra
```

### Amenity Management Scripts
- `amenity-utils.js` - Core amenity standardization functions
- `amenity-manager.js` - Centralized amenity management backend
- `amenity-cli.js` - Command-line interface for amenity management
- `standardize-amenities.js` - Legacy standardization tool

## Location Data

Both scripts use `tools/data/locations.json` as the single source of truth for project location and city data. If a project is not found in locations.json, the location fields will be left blank. This ensures data consistency across all projects.

To add a new project to locations.json:
```json
{
  "city": "CityName",
  "location": "LocationName", 
  "projects": [
    {
      "builder_id": "builderid",
      "project_id": "projectid"
    }
  ]
}
```
