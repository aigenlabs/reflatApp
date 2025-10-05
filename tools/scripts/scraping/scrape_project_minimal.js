#!/usr/bin/env node
/*
Usage:
  node scrape_project_minimal.js <builderId> <projectId> <websiteUrl> [flags]

Flags:
  --allow-reorganize    Allow re-downloading files that exist in other subfolders
  --no-download         Scan website and build JSON but skip downloading files

Example:
  node scrape_project_minimal.js myhome apas https://example.com
  node scrape_project_minimal.js myhome apas https://example.com --no-download

- Scrapes the given project website for ONLY layout files, floor plans, photos, brochures, and banner images.
- Excludes amenities, logos, and complex metadata from scraping.
- Filters out social media icons, non-project logos, and other builder project files.
- Includes key_project_details populated from builders.json (builder info, project info, logos).
- Extracts video URLs from various sources (HTML5, YouTube, Vimeo, etc.).
- Saves details as project-details.json.
- Downloads media into standard subfolders (floor_plans, photos, layouts, brochures, banners) under tools/data/<builderId>/<projectId>/media/<subfolder>/
- If no files for a subfolder, it remains empty.
- Use --no-download to preserve existing organization and only update metadata.

Requires: npm install axios cheerio node-fetch@2 fs-extra
*/

const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Only include the media types we want to scrape
const SUBFOLDERS = ['floor_plans', 'photos', 'layouts', 'brochures', 'banners'];

// Helper function for reverse geocoding GPS coordinates
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': 'reflatapp-scraper/1.0' } });
    return res.data;
  } catch (e) {
    console.warn('Reverse geocoding failed:', e.message);
    return null;
  }
}

// Helper to load builder and project details from builders.json
function getBuilderProjectDetails(builderId, projectId) {
  try {
    const buildersPath = path.join(__dirname, '../..', 'data', 'builders.json');
    const buildersData = JSON.parse(fs.readFileSync(buildersPath, 'utf8'));
    
    const builder = buildersData.builders.find(b => b.builderId === builderId);
    if (!builder) {
      console.warn(`Builder ${builderId} not found in builders.json`);
      return null;
    }
    
    const project = builder.projects.find(p => p.projectId === projectId);
    if (!project) {
      console.warn(`Project ${projectId} not found for builder ${builderId} in builders.json`);
      return null;
    }
    
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

// Helper to load location details from locations.json
function getLocationDetails(builderId, projectId) {
  try {
    const locationsPath = path.join(__dirname, '../..', 'data', 'locations.json');
    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    
    for (const locationEntry of locationsData) {
      const project = locationEntry.projects.find(p => 
        p.builder_id === builderId && p.project_id === projectId
      );
      if (project) {
        return {
          city: locationEntry.city,
          location: locationEntry.location
        };
      }
    }
    
    console.warn(`Location not found for ${builderId}/${projectId} in locations.json`);
    return null;
  } catch (error) {
    console.error('Error reading locations.json:', error.message);
    return null;
  }
}

// Helper: quick file type check by extension
function isLikelyMediaExt(ext) {
  if (!ext) return false;
  const e = ext.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.pdf', '.bmp', '.webp'].includes(e);
}

// Helper: validate a buffer looks like an expected file type (basic magic checks)
function bufferLooksValid(buffer, ext) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 64) return false;
  const sig = buffer.slice(0, 12);
  const s = sig.toString('ascii', 0, 12);
  const e = (ext || '').toLowerCase();
  try {
    if (e.includes('jpg') || e.includes('jpeg')) return buffer[0] === 0xFF && buffer[1] === 0xD8;
    if (e.includes('png')) return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    if (e.includes('webp')) return s.slice(0,4) === 'RIFF' && s.slice(8,12) === 'WEBP';
    if (e.includes('gif')) return s.slice(0,3) === 'GIF';
    if (e.includes('svg')) {
      const head = buffer.toString('utf8', 0, Math.min(buffer.length, 512)).toLowerCase();
      return head.includes('<svg') || head.trim().startsWith('<?xml');
    }
    if (e === '.pdf' || e.includes('pdf')) return buffer.toString('ascii', 0, 4) === '%PDF';
  } catch (e) {
    return false;
  }
  // fallback: accept non-empty buffers for unknown ext
  return buffer.length > 128;
}

// Helper: check if a file with the same content hash exists in any subfolder
function findExistingFileByHash(hash, mediaDir) {
  for (const subfolder of SUBFOLDERS) {
    const dir = path.join(mediaDir, subfolder);
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file || file.startsWith('.')) continue;
        const filePath = path.join(dir, file);
        try {
          const fileBuffer = fs.readFileSync(filePath);
          const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').slice(0,12);
          if (fileHash === hash) {
            return {
              subfolder: subfolder,
              filename: file,
              relativePath: `${subfolder}/${file}`,
              fullPath: filePath
            };
          }
        } catch (e) {
          // ignore errors reading individual files
        }
      }
    } catch (e) {
      // ignore read errors for this subfolder
    }
  }
  return null;
}

// Remove obvious OS artifacts and invalid files from media subfolders
async function cleanMediaDir(mediaDir) {
  try {
    for (const s of SUBFOLDERS) {
      const dir = path.join(mediaDir, s);
      if (!fs.existsSync(dir)) continue;
      const files = await fs.readdir(dir);
      for (const f of files) {
        const full = path.join(dir, f);
        // remove .DS_Store and AppleDouble/hidden files
        if (f === '.DS_Store' || f.startsWith('._') || f === '.gitkeep' || f.startsWith('.') ) {
          try { await fs.remove(full); console.log('Removed artifact', full); } catch (e) { }
          continue;
        }
      }
    }
  } catch (e) {
    console.warn('cleanMediaDir failed:', e && e.message);
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}`);
  await fs.ensureDir(path.dirname(dest));
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

// Helper to get builder and project names to exclude (all except current)
function getExclusionNames(currentBuilderId, currentProjectId) {
  try {
    const buildersPath = path.join(__dirname, '../..', 'data', 'builders.json');
    const buildersData = JSON.parse(fs.readFileSync(buildersPath, 'utf8'));
    
    const excludeNames = new Set();
    
    for (const builder of buildersData.builders) {
      // Add all builder IDs except current
      if (builder.builderId !== currentBuilderId) {
        excludeNames.add(builder.builderId);
      }
      
      for (const project of builder.projects) {
        // Add all project IDs except current
        if (project.projectId !== currentProjectId) {
          excludeNames.add(project.projectId);
        }
      }
    }
    
    return Array.from(excludeNames);
  } catch (error) {
    console.warn('Error reading builders.json for exclusions:', error.message);
    return [];
  }
}

async function main() {
  console.log('Starting scrape_project_minimal.js (layouts, floor plans, photos only)...');
  
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node scrape_project_minimal.js <builderId> <projectId> <websiteUrl> [flags]');
    process.exit(1);
  }

  const builderId = args[0];
  const projectId = args[1];
  const websiteUrl = args[2];
  const allowReorganize = args.includes('--allow-reorganize');
  const noDownload = args.includes('--no-download');

  // Get names to exclude from other builders/projects
  const excludeNames = getExclusionNames(builderId, projectId);
  const excludePattern = excludeNames.length > 0 ? new RegExp(`\\b(${excludeNames.join('|')})\\b`, 'i') : null;

  console.log(`Scraping project: ${builderId}/${projectId} from ${websiteUrl}`);
  console.log(`Flags: allow-reorganize=${allowReorganize}, no-download=${noDownload}`);

  const basePath = path.join(__dirname, '../..', 'data', builderId, projectId);
  const mediaDir = path.join(basePath, 'media');

  // Ensure media directories exist
  for (const subfolder of SUBFOLDERS) {
    await fs.ensureDir(path.join(mediaDir, subfolder));
  }

  // Clean media directories
  await cleanMediaDir(mediaDir);

  let $;
  let mediaLinks = new Set();
  let extractedVideos = [];
  let extractedGPS = { lat: null, lng: null };
  let extractedLocation = '';
  let extractedCity = '';

  // Helper to add media links
  function pushMediaLink(url) {
    if (!url || typeof url !== 'string') return;
    try {
      const u = new URL(url);
      const ext = path.extname(u.pathname).toLowerCase();
      if (isLikelyMediaExt(ext) || ext === '') {
        mediaLinks.add(url);
      }
    } catch (e) {
      // ignore invalid URLs
    }
  }

  try {
    console.log('Fetching website content...');
    const response = await axios.get(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });

    $ = cheerio.load(response.data);
    console.log('Website content loaded successfully.');

    // Extract all image sources
    console.log('Extracting image URLs...');
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
      if (src) {
        try {
          pushMediaLink((new URL(src, websiteUrl)).href);
        } catch (e) {
          // ignore invalid URLs
        }
      }
    });

    // Specifically check hero sections for banner images
    console.log('Checking hero sections for banner images...');
    const heroSelectors = [
      '[class*="hero"]', '[id*="hero"]',
      '[class*="banner"]', '[id*="banner"]',
      '[class*="header"]', '[id*="header"]',
      '[class*="jumbotron"]', '[id*="jumbotron"]',
      '[class*="masthead"]', '[id*="masthead"]',
      '[class*="main-banner"]', '[id*="main-banner"]',
      '[class*="top-banner"]', '[id*="top-banner"]',
      '[class*="featured"]', '[id*="featured"]',
      'header', '.hero-section', '#hero-section',
      '.banner-section', '#banner-section',
      '.hero-slider-item'
    ];

    let heroImagesFound = 0;
    for (const selector of heroSelectors) {
      $(selector).find('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
        if (src) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            // Mark hero images by adding a special marker to help with classification
            const markedUrl = absoluteUrl + '#hero-section';
            pushMediaLink(markedUrl);
            heroImagesFound++;
            console.log(`Found hero section image: ${absoluteUrl}`);
          } catch (e) {
            // ignore invalid URLs
          }
        }
      });

      // Also check for background images in hero sections
      $(selector).each((i, el) => {
        const $el = $(el);
        const style = $el.attr('style');
        if (style) {
          const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
          if (bgMatch) {
            try {
              const absoluteUrl = (new URL(bgMatch[1], websiteUrl)).href;
              const markedUrl = absoluteUrl + '#hero-bg';
              pushMediaLink(markedUrl);
              heroImagesFound++;
              console.log(`Found hero background image: ${absoluteUrl}`);
            } catch (e) {
              // ignore invalid URLs
            }
          }
        }

        // Check for data attributes that might contain background images
        const dataBg = $el.attr('data-bg') || $el.attr('data-background') || $el.attr('data-image') || $el.attr('data-src');
        if (dataBg) {
          try {
            const absoluteUrl = (new URL(dataBg, websiteUrl)).href;
            const markedUrl = absoluteUrl + '#hero-bg-data';
            pushMediaLink(markedUrl);
            heroImagesFound++;
            console.log(`Found hero background image from data attribute: ${absoluteUrl}`);
          } catch (e) {
            // ignore invalid URLs
          }
        }

        // Check for background image classes (common patterns)
        const classAttr = $el.attr('class');
        if (classAttr) {
          const classes = classAttr.split(/\s+/);
          for (const cls of classes) {
            // Look for background image classes like bg-one, bg-two, etc.
            if (cls.startsWith('bg-') && cls.length > 3) {
              console.log(`Found background class: ${cls} on hero element`);
              
              // Try to find the CSS rule for this class in style tags
              $('style').each((i, styleEl) => {
                const cssContent = $(styleEl).html();
                if (cssContent) {
                  // Look for the class definition with background-image
                  const classRegex = new RegExp(`\\.${cls}\\s*\\{[^}]*background-image\\s*:\\s*url\\(['"]?([^'")]+)['"]?\\)`, 'i');
                  const match = cssContent.match(classRegex);
                  if (match) {
                    try {
                      const absoluteUrl = (new URL(match[1], websiteUrl)).href;
                      const markedUrl = absoluteUrl + '#hero-bg-class';
                      pushMediaLink(markedUrl);
                      heroImagesFound++;
                      console.log(`Found hero background image from CSS class ${cls}: ${absoluteUrl}`);
                    } catch (e) {
                      // ignore invalid URLs
                    }
                  }
                }
              });
            }
          }
        }
      });
    }

    if (heroImagesFound > 0) {
      console.log(`Found ${heroImagesFound} images in hero sections`);
    }

    // Fetch and parse external CSS files for background images
    console.log('Checking external CSS files for background images...');
    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, linkEl) => {
      const href = $(linkEl).attr('href');
      if (href) {
        try {
          const cssUrl = (new URL(href, websiteUrl)).href;
          cssUrls.push(cssUrl);
        } catch (e) {
          // ignore invalid URLs
        }
      }
    });

    // Process CSS files to find background images for classes like bg-one
    for (const cssUrl of cssUrls) {
      try {
        console.log(`Fetching CSS file: ${cssUrl}`);
        const cssResponse = await axios.get(cssUrl, { timeout: 10000 });
        const cssContent = cssResponse.data;
        
        // Look for background image classes (bg-one, bg-two, etc.)
        const bgClassRegex = /\.bg-\w+\s*\{[^}]*background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi;
        let match;
        while ((match = bgClassRegex.exec(cssContent)) !== null) {
          try {
            const imageUrl = match[1];
            const absoluteUrl = (new URL(imageUrl, cssUrl)).href;
            const markedUrl = absoluteUrl + '#hero-bg-css';
            pushMediaLink(markedUrl);
            heroImagesFound++;
            console.log(`Found hero background image from CSS: ${absoluteUrl}`);
          } catch (e) {
            console.log(`Error processing CSS background URL: ${e.message}`);
          }
        }
      } catch (e) {
        console.log(`Error fetching CSS file ${cssUrl}: ${e.message}`);
      }
    }

    // Extract background images from CSS
    $('*').each((i, el) => {
      const style = $(el).attr('style');
      if (style) {
        const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
        if (bgMatch) {
          try {
            pushMediaLink((new URL(bgMatch[1], websiteUrl)).href);
          } catch (e) {
            // ignore invalid URLs
          }
        }
      }
    });

    // Extract links to PDF files (for floor plans or layouts)
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href && (href.toLowerCase().includes('.pdf') || text.includes('brochure') || text.includes('pdf'))) {
        try {
          const absoluteUrl = (new URL(href, websiteUrl)).href;
          pushMediaLink(absoluteUrl);
          console.log(`Found PDF/brochure link: ${absoluteUrl}`);
        } catch (e) {
          // ignore invalid URLs
        }
      }
    });

    // Extract video URLs from various sources
    console.log('Extracting video URLs...');
    try {
      const videoUrls = new Set();
      
      // 1. HTML5 video elements with src attribute
      $('video[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found video src: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // 2. HTML5 video elements with source children
      $('video source[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found video source: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // 3. YouTube iframe embeds
      $('iframe[src*="youtube.com"], iframe[src*="youtu.be"]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found YouTube embed: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // 4. Vimeo iframe embeds
      $('iframe[src*="vimeo.com"]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found Vimeo embed: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // 5. Generic iframe embeds that might contain videos
      $('iframe').each((i, el) => {
        const src = $(el).attr('src');
        if (src && /video|player|embed/i.test(src)) {
          try {
            const absoluteUrl = (new URL(src, websiteUrl)).href;
            // Skip already found YouTube/Vimeo to avoid duplicates
            // Also skip Google Maps and other non-video embeds
            if (!absoluteUrl.includes('youtube.com') && 
                !absoluteUrl.includes('youtu.be') && 
                !absoluteUrl.includes('vimeo.com') &&
                !absoluteUrl.includes('google.com/maps') &&
                !absoluteUrl.includes('maps.google') &&
                !absoluteUrl.includes('openstreetmap') &&
                !absoluteUrl.includes('mapbox')) {
              videoUrls.add(absoluteUrl);
              console.log(`Found generic video embed: ${absoluteUrl}`);
            }
          } catch (e) {}
        }
      });

      // 6. Links to video files (mp4, webm, etc.)
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v)(\?|$)/i.test(href)) {
          try {
            const absoluteUrl = (new URL(href, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found video file link: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // 7. Data attributes that might contain video URLs
      $('[data-video-url], [data-video-src], [data-video]').each((i, el) => {
        const $el = $(el);
        const videoUrl = $el.attr('data-video-url') || $el.attr('data-video-src') || $el.attr('data-video');
        if (videoUrl) {
          try {
            const absoluteUrl = (new URL(videoUrl, websiteUrl)).href;
            videoUrls.add(absoluteUrl);
            console.log(`Found data-video: ${absoluteUrl}`);
          } catch (e) {}
        }
      });

      // Convert Set to Array
      extractedVideos.push(...Array.from(videoUrls));
      console.log(`Total videos found: ${extractedVideos.length}`);
      if (extractedVideos.length > 0) {
        extractedVideos.forEach((url, index) => {
          console.log(`  ${index + 1}. ${url}`);
        });
      }
    } catch (e) {
      console.warn('Error extracting videos:', e.message);
    }

    console.log(`Found ${mediaLinks.size} media links to process.`);

    // Extract GPS coordinates and location information
    console.log('Extracting GPS coordinates and location...');

    try {
      // Try to extract GPS from Google Maps embed or links (using original script logic)
      const mapEmbed = $('iframe[src*="google.com/maps"], a[href*="google.com/maps"], a[href*="goo.gl/maps"]').attr('src') || 
                      $('iframe[src*="google.com/maps"], a[href*="google.com/maps"], a[href*="goo.gl/maps"]').attr('href') || '';
      let lat = null, lng = null;
      const mapUrl = mapEmbed || '';
      
      // Look for pattern !3dLAT!4dLNG or !2dLNG!3dLAT (original script patterns)
      let match = mapUrl.match(/!3d([\d.\-]+)!4d([\d.\-]+)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
        console.log(`Found GPS from Google Maps (!3d!4d pattern): ${lat}, ${lng}`);
      } else {
        match = mapUrl.match(/!2d([\d.\-]+)!3d([\d.\-]+)/);
        if (match) {
          lng = parseFloat(match[1]);
          lat = parseFloat(match[2]);
          console.log(`Found GPS from Google Maps (!2d!3d pattern): ${lat}, ${lng}`);
        }
      }
      
      // Additional pattern: look for q=lat,lng in URL
      if (!lat && !lng) {
        const coordMatch = mapUrl.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (coordMatch) {
          lat = parseFloat(coordMatch[1]);
          lng = parseFloat(coordMatch[2]);
          console.log(`Found GPS from Google Maps (q= pattern): ${lat}, ${lng}`);
        }
      }
      
      if (lat && lng) {
        extractedGPS = { lat, lng };
      }

      // Method 2: Look for coordinates in script tags or data attributes
      if (!extractedGPS.lat && !extractedGPS.lng) {
        $('script, [data-lat], [data-lng], [data-latitude], [data-longitude]').each((i, el) => {
          const $el = $(el);
          
          // Check data attributes
          const dataLat = $el.attr('data-lat') || $el.attr('data-latitude');
          const dataLng = $el.attr('data-lng') || $el.attr('data-longitude');
          if (dataLat && dataLng) {
            extractedGPS.lat = parseFloat(dataLat);
            extractedGPS.lng = parseFloat(dataLng);
            console.log(`Found GPS from data attributes: ${extractedGPS.lat}, ${extractedGPS.lng}`);
            return false; // break
          }

          // Check script content for coordinates
          if (el.name === 'script') {
            const scriptContent = $el.html() || '';
            const coordPattern = /(?:lat|latitude)[:=]\s*(-?\d+\.?\d*)[,\s]*(?:lng|longitude|lon)[:=]\s*(-?\d+\.?\d*)/i;
            const scriptMatch = scriptContent.match(coordPattern);
            if (scriptMatch) {
              extractedGPS.lat = parseFloat(scriptMatch[1]);
              extractedGPS.lng = parseFloat(scriptMatch[2]);
              console.log(`Found GPS from script: ${extractedGPS.lat}, ${extractedGPS.lng}`);
              return false; // break
            }
          }
        });
      }

      // If we found GPS coordinates, try reverse geocoding to get location details
      if (extractedGPS.lat && extractedGPS.lng && !extractedLocation) {
        console.log(`Attempting reverse geocoding for coordinates: ${extractedGPS.lat}, ${extractedGPS.lng}`);
        const geo = await reverseGeocode(extractedGPS.lat, extractedGPS.lng);
        if (geo && geo.address) {
          // Extract suburb/location
          const suburb = geo.address.suburb || geo.address.neighbourhood || '';
          const city = geo.address.city || geo.address.town || geo.address.village || '';
          
          if (suburb) {
            extractedLocation = suburb;
            console.log(`Found location from reverse geocoding: ${extractedLocation}`);
          } else if (city) {
            extractedLocation = city;
            console.log(`Found location from reverse geocoding (city): ${extractedLocation}`);
          }
          
          if (city && !extractedCity) {
            extractedCity = city;
            console.log(`Found city from reverse geocoding: ${extractedCity}`);
          }
        }
      }

      // Method 3: Look for location/address information in text (fallback)
      if (!extractedLocation) {
        const pageText = $('body').text();
        const locationPatterns = [
          /(?:location|address|situated\s+(?:in|at))[:\-\s]*([^,\n\.]+)/i,
          /(?:hyderabad|bangalore|mumbai|delhi|chennai|pune)[,\s]*([^,\n\.]+)/i,
          /(?:at|in)\s+([a-zA-Z\s]+),?\s*(?:hyderabad|bangalore|mumbai|delhi|chennai|pune)/i
        ];

        for (const pattern of locationPatterns) {
          const textMatch = pageText.match(pattern);
          if (textMatch && textMatch[1]) {
            const location = textMatch[1].trim().replace(/[^\w\s]/g, '').trim();
            if (location.length > 2 && location.length < 50) {
              extractedLocation = location;
              console.log(`Found location from text: ${extractedLocation}`);
              break;
            }
          }
        }
      }

      // Method 4: Look for city information in text (fallback)
      if (!extractedCity) {
        const pageText = $('body').text();
        const cityPatterns = [
          /(?:hyderabad|bangalore|mumbai|delhi|chennai|pune|kolkata|ahmedabad)/gi
        ];

        for (const pattern of cityPatterns) {
          const cityMatch = pageText.match(pattern);
          if (cityMatch) {
            extractedCity = cityMatch[0].toLowerCase();
            extractedCity = extractedCity.charAt(0).toUpperCase() + extractedCity.slice(1);
            console.log(`Found city from text: ${extractedCity}`);
            break;
          }
        }
      }

      console.log(`GPS extraction result: lat=${extractedGPS.lat}, lng=${extractedGPS.lng}`);
      console.log(`Location extraction result: location="${extractedLocation}", city="${extractedCity}"`);

    } catch (e) {
      console.warn('Error extracting GPS/location:', e.message);
    }

    console.log(`Total media links processed: ${mediaLinks.size}`);

  } catch (error) {
    console.error('Error fetching website:', error.message);
    process.exit(1);
  }

  // Process and download media files
  const mediaCollections = {
    floor_plans: [],
    photos: [],
    layouts: [],
    brochures: [],
    banners: []
  };

  let filesDownloaded = 0;
  let filesSkipped = 0;
  let filesPreserved = 0;

  if (!noDownload && mediaLinks.size > 0) {
    console.log('Processing media files...');
    
    for (const url of mediaLinks) {
      try {
        console.log(`Processing: ${url}`);
        
        // Clean URL by removing hero markers for actual downloading
        const cleanUrl = url.replace(/#hero-(section|bg|bg-class|bg-data|bg-css)$/, '');
        
        // Download and check the file
        const response = await fetch(cleanUrl, { timeout: 60000 }); // 60 second timeout for large files like PDFs
        if (!response.ok) {
          console.log(`Failed to fetch ${cleanUrl}: ${response.status}`);
          filesSkipped++;
          continue;
        }

        const buffer = await response.buffer();
        const urlObj = new URL(cleanUrl);
        const pathname = urlObj.pathname;
        const basename = path.basename(pathname);
        const ext = path.extname(pathname);

        if (!bufferLooksValid(buffer, ext)) {
          // For hero background images, be more lenient - they might be valid even if buffer validation fails
          const isHeroBg = url.includes('#hero-bg') || url.includes('#hero-bg-class') || url.includes('#hero-bg-data') || url.includes('#hero-bg-css');
          if (!isHeroBg) {
            console.log(`Invalid file format for ${cleanUrl}`);
            filesSkipped++;
            continue;
          } else {
            console.log(`Hero background image buffer validation failed, but proceeding anyway: ${cleanUrl}`);
          }
        }

        // Generate hash for deduplication
        const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);

        // Check if file exists (unless reorganize is allowed)
        if (!allowReorganize) {
          const existingFile = findExistingFileByHash(hash, mediaDir);
          if (existingFile) {
            const rel = existingFile.relativePath;
            if (!mediaCollections[existingFile.subfolder].includes(rel)) {
              mediaCollections[existingFile.subfolder].push(rel);
            }
            filesPreserved++;
            console.log(`File already exists: ${existingFile.relativePath}`);
            continue;
          }
        }

        // Determine subfolder based on URL and filename
        let chosen = 'photos'; // default
        const lower = (pathname + ' ' + basename + ' ' + cleanUrl).toLowerCase();
        
        // Priority check: Images from hero sections are banners
        if (url.includes('#hero-section') || url.includes('#hero-bg') || url.includes('#hero-bg-class') || url.includes('#hero-bg-data') || url.includes('#hero-bg-css')) {
          chosen = 'banners';
          console.log(`Classified as banner from hero section: ${basename}`);
        }
        // Check for floor plans
        else if (/\b(floor|plan)s?\b/.test(lower)) {
          chosen = 'floor_plans';
        }
        // Check for layouts
        else if (/\b(layout|site_layout|site-layout|master_plan|master-plan)\b/.test(lower)) {
          chosen = 'layouts';
        }
        // Check for brochures (PDF files)
        else if (/\.pdf$/.test(lower) || /brochure/i.test(lower)) {
          chosen = 'brochures';
        }
        // Check for banners
        else if (/\b(banner|hero|header|jumbotron|main|top|featured|cover|masthead)\b/i.test(lower)) {
          chosen = 'banners';
          console.log(`Classified as banner: ${basename} (from: ${lower})`);
        }
        // Everything else goes to photos

        // Generate safe filename
        let safeName = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeName || safeName === '_') {
          const nameFromUrl = url.split('/').pop().split('?')[0];
          safeName = nameFromUrl || `file_${hash}${ext}`;
        }

        // Remove hash prefix if it exists
        safeName = safeName.replace(/^[a-fA-F0-9]{12}-/, '');

        // Skip files based on filename patterns (social media, logos, etc.)
        const lowerSafeName = safeName.toLowerCase();
        const skipPatterns = [
          // Social media
          /social[-_]?(fb|facebook|insta|instagram|twitter|youtube|linkedin|whatsapp|telegram)/,
          // Standalone social media platform names
          /^(facebook|instagram|twitter|youtube|linkedin|linkdin|whatsapp|telegram|fb|insta)\./, 
          // Social media icons/buttons
          /\b(facebook|instagram|twitter|youtube|linkedin|linkdin|whatsapp|telegram|fb|insta)\b/,
          // Builder project names (that aren't the current project) and other builders
          ...(excludePattern ? [excludePattern] : []),  // Dynamically generated from builders.json
          /sayuk\d*/i, // Skip sayuk files
          // Generic terms to exclude
          /\b(partner|client|awards?|testimonial|about[-_]?us)\b/
        ];

        // Exclude additional builder/project names (all except current)
        const exclusionNames = getExclusionNames(builderId, projectId);
        if (exclusionNames.length > 0) {
          const excludePattern = new RegExp(`\\b(${exclusionNames.join('|')})\\b`, 'i');
          skipPatterns.push(excludePattern);
        }

        const shouldSkip = skipPatterns.some(pattern => pattern.test(lowerSafeName));
        
        if (shouldSkip) {
          console.log(`Skipping file: ${safeName} (matches exclusion pattern)`);
          filesSkipped++;
          continue;
        }

        const destPath = path.join(mediaDir, chosen, safeName);
        
        // Write file
        await fs.writeFile(destPath, buffer);
        console.log(`Downloaded: ${chosen}/${safeName}`);
        
        // Add to collection
        const relativePath = `${chosen}/${safeName}`;
        if (!mediaCollections[chosen].includes(relativePath)) {
          mediaCollections[chosen].push(relativePath);
        }
        
        filesDownloaded++;

      } catch (error) {
        console.error(`Error processing ${url}:`, error.message);
        filesSkipped++;
      }
    }
  } else if (noDownload) {
    // Build collections from existing files
    console.log('Building collections from existing files (no-download mode)...');
    for (const subfolder of SUBFOLDERS) {
      const dir = path.join(mediaDir, subfolder);
      if (fs.existsSync(dir)) {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (!file.startsWith('.')) {
            // Apply same filtering logic as download mode
            const lowerFileName = file.toLowerCase();
            const skipPatterns = [
              // Social media
              /social[-_]?(fb|facebook|insta|instagram|twitter|youtube|linkedin|whatsapp|telegram)/,
              // Standalone social media platform names
              /^(facebook|instagram|twitter|youtube|linkedin|linkdin|whatsapp|telegram|fb|insta)\./, 
              // Social media icons/buttons
              /\b(facebook|instagram|twitter|youtube|linkedin|linkdin|whatsapp|telegram|fb|insta)\b/,
              // Builder project names (that aren't the current project) and other builders
              ...(excludePattern ? [excludePattern] : []),  // Dynamically generated from builders.json
              /sayuk\d*/i, // Skip sayuk files
              // Generic terms to exclude
              /\b(partner|client|awards?|testimonial|about[-_]?us)\b/
            ];

            const shouldSkip = skipPatterns.some(pattern => pattern.test(lowerFileName));
            
            if (shouldSkip) {
              console.log(`Skipping existing file: ${file} (matches exclusion pattern)`);
            } else {
              mediaCollections[subfolder].push(`${subfolder}/${file}`);
            }
          }
        }
      }
    }
  }

  // Get builder and project details from builders.json
  const builderProjectDetails = getBuilderProjectDetails(builderId, projectId);

  // Get location details from locations.json
  const locationDetails = getLocationDetails(builderId, projectId);

  // Load existing project details to preserve key_project_details fields
  let existingDetails = {};
  const detailsPath = path.join(basePath, `${projectId}-details.json`);
  try {
    if (fs.existsSync(detailsPath)) {
      existingDetails = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
      console.log('Loaded existing project details for preservation');
    }
  } catch (e) {
    console.warn('Failed to load existing details:', e.message);
  }

  // Create project details JSON with key project details and media arrays
  const projectDetails = {
    scrapedAt: new Date().toISOString(),
    key_project_details: {
      builder_id: existingDetails.key_project_details?.builder_id || builderId,
      builder_name: existingDetails.key_project_details?.builder_name || (builderProjectDetails?.builder_name || builderId),
      project_id: existingDetails.key_project_details?.project_id || projectId,
      project_name: existingDetails.key_project_details?.project_name || (builderProjectDetails?.project_name || projectId),
      project_location: existingDetails.key_project_details?.project_location || (locationDetails?.location || extractedLocation || ""),
      project_city: existingDetails.key_project_details?.project_city || (locationDetails?.city || extractedCity || ""),
      gps: existingDetails.key_project_details?.gps || {
        lat: extractedGPS.lat,
        lng: extractedGPS.lng
      },
      url: existingDetails.key_project_details?.url || websiteUrl,
      videos: existingDetails.key_project_details?.videos || extractedVideos,
      rera_number: existingDetails.key_project_details?.rera_number || "",
      total_acres: existingDetails.key_project_details?.total_acres || "",
      total_towers: existingDetails.key_project_details?.total_towers || null,
      total_floors: existingDetails.key_project_details?.total_floors || "",
      open_space_percent: existingDetails.key_project_details?.open_space_percent || "",
      flats_per_acre: existingDetails.key_project_details?.flats_per_acre || "",
      flats_per_floor: existingDetails.key_project_details?.flats_per_floor || "",
      config: existingDetails.key_project_details?.config || "",
      flat_sizes: existingDetails.key_project_details?.flat_sizes || "",
      total_flats: existingDetails.key_project_details?.total_flats || "",
      builder_logo: existingDetails.key_project_details?.builder_logo || (builderProjectDetails?.builder_logo || `${builderId}/${builderId}_logo.webp`),
      project_logo: existingDetails.key_project_details?.project_logo || (builderProjectDetails?.project_logo || `logos/${projectId}_logo.webp`),
      scrapedAt: new Date().toISOString()
    },
    floor_plans: mediaCollections.floor_plans,
    photos: mediaCollections.photos,
    layouts: mediaCollections.layouts,
    brochures: mediaCollections.brochures,
    banners: mediaCollections.banners
  };

  // Write project details
  try {
    await fs.writeJson(detailsPath, projectDetails, { spaces: 2 });
    console.log(`Project details saved to: ${detailsPath}`);
  } catch (error) {
    console.error(`Failed to save project details: ${error.message}`);
    process.exit(1);
  }
  
  console.log('\n=== SCRAPING SUMMARY ===');
  console.log(`Builder: ${projectDetails.key_project_details.builder_name} (${projectDetails.key_project_details.builder_id})`);
  console.log(`Project: ${projectDetails.key_project_details.project_name} (${projectDetails.key_project_details.project_id})`);
  console.log(`Location: ${projectDetails.key_project_details.project_location}, ${projectDetails.key_project_details.project_city}`);
  console.log(`GPS: ${projectDetails.key_project_details.gps.lat}, ${projectDetails.key_project_details.gps.lng}`);
  console.log(`Files downloaded: ${filesDownloaded}`);
  console.log(`Files preserved: ${filesPreserved}`);
  console.log(`Files skipped: ${filesSkipped}`);
  console.log(`Floor plans: ${mediaCollections.floor_plans.length}`);
  console.log(`Photos: ${mediaCollections.photos.length}`);
  console.log(`Layouts: ${mediaCollections.layouts.length}`);
  console.log(`Brochures: ${mediaCollections.brochures.length}`);
  console.log(`Banners: ${mediaCollections.banners.length}`);
  console.log(`Videos: ${projectDetails.key_project_details.videos.length}`);
  console.log(`Project details saved to: ${detailsPath}`);
  console.log('=== SCRAPING COMPLETE ===');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
