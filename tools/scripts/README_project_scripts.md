# Project Scraping Scripts

This directory contains two complementary scripts for managing real estate project data:

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

## Workflow

### Fresh Project Scraping
```bash
# 1. Scrape website and download media
node scrape_project.js myhome grava https://example.com

# 2. Manually organize files if needed
# (move files between subfolders, delete unwanted files, etc.)

# 3. Rebuild JSON to reflect manual changes
node build_project_json.js myhome grava
```

### Update Existing Project
```bash
# Option 1: Full re-scrape (gets latest content from website)
node scrape_project.js myhome grava https://example.com

# Option 2: Just rebuild JSON from existing files
node build_project_json.js myhome grava
```

## Media Organization

Both scripts work with the same standardized folder structure:

```
tools/data/<builderId>/<projectId>/
├── <projectId>-details.json
└── media/
    ├── logos/
    ├── floor_plans/
    ├── brochures/
    ├── banners/
    ├── photos/
    ├── layouts/
    ├── news/
    ├── documents/
    └── amenities/
```

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

Both scripts require:
```bash
npm install axios cheerio node-fetch@2 fs-extra
```

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
