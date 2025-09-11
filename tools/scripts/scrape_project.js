#!/usr/bin/env node
/*
Usage:
  node scrape_project.js <builderId> <projectId> <websiteUrl>

- Scrapes the given project website for details and media.
- Saves details as project-details.json.
- Downloads media into standard subfolders (logos, floor_plans, brochures, banners, photos, layouts, news, documents) under tools/data/<builderId>/<projectId>/media/<subfolder>/
- If no files for a subfolder, it remains empty.

Requires: npm install axios cheerio node-fetch@2 fs-extra
*/

const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');

const SUBFOLDERS = [
  'logos',
  'floor_plans',
  'brochures',
  'banners',
  'photos', // merged gallery and photos
  'layouts', // merged layouts and site_layout
  'news',
  'documents'
];

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

async function main() {
  console.log('Starting scrape_project.js...');
  const [builderId, projectId, websiteUrl] = process.argv.slice(2);
  if (!builderId || !projectId || !websiteUrl) {
    console.error('Usage: node scrape_project.js <builderId> <projectId> <websiteUrl>');
    process.exit(1);
  }
  const baseDir = path.join('../', 'data', builderId, projectId);
  const mediaDir = path.join(baseDir, 'media');
  await fs.ensureDir(mediaDir);
  for (const sub of SUBFOLDERS) {
    await fs.ensureDir(path.join(mediaDir, sub));
  }

  // Fetch and parse the website
  const { data: html } = await axios.get(websiteUrl);
  const $ = cheerio.load(html);

  // --- Scrape project details (customize selectors as needed) ---
  let location = '';
  let city = '';
  let suburb = '';
  // Try to extract GPS from Google Maps embed or links
  let gps = null;
  const mapEmbed = $('iframe[src*="google.com/maps"], a[href*="google.com/maps"], a[href*="goo.gl/maps"]').attr('src') || '';
  let lat = null, lng = null;
  const mapUrl = mapEmbed || '';
  // Look for pattern !3dLAT!4dLNG or !2dLNG!3dLAT
  let match = mapUrl.match(/!3d([\d.\-]+)!4d([\d.\-]+)/);
  if (match) {
    lat = parseFloat(match[1]);
    lng = parseFloat(match[2]);
  } else {
    match = mapUrl.match(/!2d([\d.\-]+)!3d([\d.\-]+)/);
    if (match) {
      lng = parseFloat(match[1]);
      lat = parseFloat(match[2]);
    }
  }
  if (lat && lng) gps = { lat, lng };

  let extraAddress = {};
  if ((!location || !city) && gps) {
    const geo = await reverseGeocode(gps.lat, gps.lng);
    if (geo) {
      if (geo.address) {
        suburb = geo.address.suburb || '';
        // Prefer suburb for location
        location = suburb || geo.display_name || location;
        // City extraction priority
        city = geo.address.city || geo.address.town || geo.address.village || geo.address.hamlet || geo.address.state_district || geo.address.county || geo.address.state || city;
      }
      // Collect all address fields
      var extraAddressFields = [
        'city', 'town', 'village', 'hamlet', 'suburb', 'state_district', 'county', 'state', 'postcode', 'country', 'country_code', 'road', 'neighbourhood', 'municipality', 'region', 'ISO3166-2-lvl4', 'ISO3166-2-lvl6'
      ];
      for (const field of extraAddressFields) {
        if (geo.address && geo.address[field]) {
          extraAddress[field] = geo.address[field];
        }
      }
    }
  }

  const details = {
    builder_id: builderId,
    builder_name: builderId, // You can customize this if you want a display name
    project_id: projectId,
    project_name: projectId, // You can customize this if you want a display name
    name: $('h1, .project-title, .title').first().text().trim() || projectId,
    description: $('meta[name="description"]').attr('content') || $('p, .description').first().text().trim(),
    location,
    city,
    suburb,
    gps,
    url: websiteUrl,
    scrapedAt: new Date().toISOString(),
    videos: [] // will be filled below
  };
  // Merge extra address fields
  Object.assign(details, extraAddress);

  // Try to extract 'Key Highlights' text (or OCR an image) and parse common numeric fields
  async function extractKeyHighlights() {
    function parseHighlightsText(text) {
      const out = {};
      if (!text || !text.trim()) return out;
      const t = text.replace(/\s+/g, ' ').trim();
      const T = t.toUpperCase();

      // RERA number (loose match)
      const reraMatch = T.match(/RERA[^0-9A-Z]*(?:NO\.?|NUMBER\:?|REGN\s*NO\.?|REGN\s*NUMBER\:)?\s*([A-Z0-9\-\/]+)/i);
      if (reraMatch) out.rera_number = reraMatch[1].trim();

      // Acres / land area
      const acresMatch = T.match(/(\d{1,3}(?:[\.,]\d+)?)(?:\s*)(?:ACRES|ACRE|AC)/i) || T.match(/LAND\s*AREA[^0-9A-Z]*(\d{1,3}(?:[\.,]\d+)?)/i);
      if (acresMatch) out.total_acres = parseFloat((acresMatch[1] || '').toString().replace(/,/g, ''));

      // Towers
      const towersMatch = T.match(/(\d{1,4})\s*(?:HIGH\s*RISE\s*)?(?:TOWERS|TOWER|BLOCKS|BUILDINGS)/i);
      if (towersMatch) out.total_towers = parseInt(towersMatch[1], 10);

      // Floors: match G+39 or G+39 FLOORS or 39 FLOORS
      const gPlusMatch = T.match(/G\+\s*(\d{1,3})/i);
      if (gPlusMatch) out.total_floors = parseInt(gPlusMatch[1], 10);
      else {
        const floorsMatch = T.match(/(\d{1,3})\s*(?:FLOORS|STOREYS|STOREY|STOREYS|FLOOR)/i);
        if (floorsMatch) out.total_floors = parseInt(floorsMatch[1], 10);
      }

      // Total units
      const unitsMatch = T.match(/(\d{1,5})\s*(?:UNITS|FLATS|APARTMENTS|HOUSES|RESIDENCES)/i);
      if (unitsMatch) {
        out.total_units = parseInt(unitsMatch[1], 10);
        out.total_flats = out.total_units; // map flats to units
      } else {
        // Sometimes total units may appear without label near other numbers: try to find standalone counts after keywords
        const standalone = T.match(/TOTAL[^0-9A-Z]*(\d{1,5})/i);
        if (standalone) {
          out.total_units = parseInt(standalone[1], 10);
          out.total_flats = out.total_units;
        }
      }

      // Config (BHK types) - find all occurrences like '2 BHK', '3BHK'
      // Match integers or decimals (e.g. '2 BHK', '2.5 BHK') and preserve the full number
      const bhkMatches = Array.from(t.matchAll(/(\d+(?:[\.,]\d+)?)\s*-?\s*BHK/gi))
        .map(m => (m[1].replace(',', '.').trim() + ' BHK'));
      if (bhkMatches.length) out.config = Array.from(new Set(bhkMatches)).join(', ');

      // Unit sizes (e.g., '1200 SQFT', '85 SQM', '1200-1500 SQFT')
      const sizeMatches = Array.from(t.matchAll(/(\d{2,5}(?:[.,]\d+)?(?:\s*[-–]\s*\d{2,5}(?:[.,]\d+)?)?\s*(?:SQ\.?FT|SQFT|SQM|M2|M²))/gi)).map(m => m[0].trim());
      if (sizeMatches.length) out.unit_sizes = Array.from(new Set(sizeMatches)).join('; ');

      return out;
    }

    // 1) Look for an element containing heading 'KEY HIGHLIGHT(S)'
    let highlightsText = '';
    try {
      const heading = $('*:contains("KEY HIGHLIGHT")').filter(function () {
        return /KEY\s*HIGHLIGHT/i.test($(this).text());
      }).first();
      if (heading && heading.length) {
        // prefer sibling or parent block text
        const parent = heading.parent();
        if (parent && parent.length) highlightsText = parent.text();
        if (!highlightsText) highlightsText = heading.text();
      }
    } catch (e) {
      // ignore
    }

    // 2) Fallback: find containers or elements with class/id containing 'highlight'
    if (!highlightsText) {
      const el = $('[class*="highlight" i], [id*="highlight" i]').filter(function () { return $(this).text().trim().length > 0; }).first();
      if (el && el.length) highlightsText = el.text();
    }

    // 3) Fallback: look for images whose src or alt contains 'highlight' or 'key' and attempt OCR
    if (!highlightsText) {
      const img = $('img').filter((i, el) => {
        const src = ($(el).attr('src') || '').toLowerCase();
        const alt = ($(el).attr('alt') || '').toLowerCase();
        return src.includes('highlight') || src.includes('key') || alt.includes('highlight') || alt.includes('key');
      }).first();
      if (img && img.attr('src')) {
        const imgUrl = img.attr('src').startsWith('http') ? img.attr('src') : new URL(img.attr('src'), websiteUrl).href;
        // Try OCR with tesseract.js if installed
        try {
          const Tesseract = require('tesseract.js');
          const { data: { text } } = await Tesseract.recognize(imgUrl, 'eng');
          highlightsText = text;
        } catch (e) {
          console.warn('Tesseract OCR not available or failed, skipping image OCR:', e.message);
        }
      }
    }

    // 4) If we found some text, parse it
    if (highlightsText && highlightsText.trim()) {
      const parsed = parseHighlightsText(highlightsText);
      if (Object.keys(parsed).length) {
        // normalize numeric fields
        if (parsed.total_acres) parsed.total_acres = Number(parsed.total_acres);
        if (parsed.total_towers) parsed.total_towers = Number(parsed.total_towers);
        if (parsed.total_floors) parsed.total_floors = Number(parsed.total_floors);
        if (parsed.total_units) parsed.total_units = Number(parsed.total_units);
        Object.assign(details, parsed);
      }
    }
  }

  // Attempt to extract key highlights (textual or from an image)
  await extractKeyHighlights();

  // Fallback: if page contains phrases like 'Total No. of Flats' or 'Total units', try to extract from body
  if ((!details.total_units || details.total_units === '') && ($ && typeof $ === 'function')) {
    try {
      const bodyUnits = extractNumber($, html, /(?:total\s*(?:no\.?\s*of\s*)?)?(?:units|flats|apartments)/i, '');
      if (Number.isFinite(bodyUnits) && bodyUnits > 0) {
        details.total_units = bodyUnits;
        details.total_flats = bodyUnits;
      }
    } catch (e) {
      // ignore
    }
  }

  // Best-effort extraction of common project fields so `details` contains
  // values like total_acres, total_units, total_towers, total_floors, etc.
  // These use the helper functions defined at the bottom of the file and
  // act as fallbacks when the fields aren't already present in `details`.
  try {
    details.total_acres = extractNumber($, html, /acres?|site\s*area|total\s*area/i, details.total_acres);
    details.total_units = extractNumber($, html, /(?:total\s*)?(?:units|flats|apartments|homes|residences)/i, details.total_units);
    details.total_towers = extractNumber($, html, /(?:total\s*)?(?:towers?|blocks|buildings)/i, details.total_towers);
    details.total_floors = extractNumber($, html, /(?:total\s*)?(?:floors|storeys|levels)/i, details.total_floors);
    details.config = extractString($, html, /config|bhk|configuration/i, details.config || '');
    details.unit_sizes = extractString($, html, /unit.?sizes?|area|sq\.?ft|sqm|m2/i, details.unit_sizes || '');
    details.open_space_percent = extractNumber($, html, /open.?space|open.?area|open.*percent|open.*%/i, details.open_space_percent);
    details.rera_number = extractString($, html, /rera\s*(?:no|number)?/i, details.rera_number || '');
  } catch (e) {
    // Non-fatal: extraction failed for some reason, continue with what we have
    console.warn('Field extraction fallback failed:', e.message);
  }

  // Add a field for each subfolder, as an array of file objects (path, filename)
  for (const sub of SUBFOLDERS) {
    const subdir = path.join(mediaDir, sub);
    let files = [];
    if (fs.existsSync(subdir)) {
      files = (await fs.readdir(subdir)).filter(f => fs.statSync(path.join(subdir, f)).isFile())
        .map(f => ({ path: `${sub}/${f}`, filename: f }));
    }
    details[sub] = files;
  }

  // Save details as <projectId>-details.json
  const detailsJsonName = `${projectId}-details.json`;
  const detailsJsonPath = path.join(baseDir, detailsJsonName);
  // await fs.writeJson(detailsJsonPath, details, { spaces: 2 }); // REMOVED: only write new format
  console.log('Scraped details, proceeding to media and output formatting...');

  // Save output as <projectId>-details.json

  await fs.writeJson(detailsJsonPath, output, { spaces: 2 });
  console.log('Saved project details JSON.');

  // Auto-invoke add_project_to_locations.js (only update local locations.json)
  try {
    const { execSync } = require('child_process');
    execSync(`node ${path.resolve(__dirname, 'add_project_to_locations.js')} "${builderId}" "${projectId}" "${(output.Key_Project_details && (output.Key_Project_details.project_name || output.Key_Project_details.project_name)) || output.project_name || output.Key_Project_details && output.Key_Project_details.project_name || output.project_name || projectId}" "${output.Key_Project_details ? output.Key_Project_details.project_city : (details.city || '')}" "${output.Key_Project_details ? output.Key_Project_details.project_location : (details.location || '')}"`, { stdio: 'inherit' });
    console.log('Added project to local locations.json via add_project_to_locations.js');
  } catch (e) {
    console.warn('Failed to auto-add project to locations.json:', e.message);
  }

  // Heuristic: assign to subfolders by filename or URL
  for (const url of mediaLinks) {
    const lower = url.toLowerCase();
    let sub = 'documents';
    if (lower.includes('logo')) sub = 'logos';
    else if (lower.includes('floor')) sub = 'floor_plans';
    else if (lower.includes('brochure')) sub = 'brochures';
    else if (lower.includes('banner')) sub = 'banners';
    else if (lower.includes('gallery') || lower.includes('photo')) sub = 'photos';
    else if (lower.includes('layout') || lower.includes('site')) sub = 'layouts'; // merge layouts and site_layout
    else if (lower.includes('news')) sub = 'news';
    else if (lower.match(/\.(jpg|jpeg|png|webp|gif)$/)) sub = 'photos';
    // Only download to allowed subfolders
    if (!SUBFOLDERS.includes(sub)) continue;
    // Only download logos that match the project name
    if (sub === 'logos') {
      const projectName = projectId.toLowerCase();
      const fname = path.basename(new URL(url).pathname).split('?')[0].toLowerCase();
      if (!fname.includes(projectName)) continue;
    }
    const fname = path.basename(new URL(url).pathname).split('?')[0];
    const dest = path.join(mediaDir, sub, fname);
    if (fs.existsSync(dest)) {
      console.log(`[SKIP] Already exists: ${dest}`);
      continue;
    }
    try {
      await downloadFile(url, dest);
      console.log(`Downloaded to ${dest}`);
    } catch (e) {
      console.warn(`Failed to download ${url}: ${e.message}`);
    }
  }
  console.log('Scraping and download complete.');

}

main().catch(e => { console.error(e); process.exit(1); });

// --- helpers for extraction ---
function extractNumber($, html, regex, fallback) {
  // Try to find a number near a label matching regex
  const text = $("body").text() || html;
  const match = text.match(new RegExp(regex.source + '[^\d]{0,10}(\d+[.,]?\d*)', 'i'));
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  if (typeof fallback === 'string' && fallback) return parseFloat(fallback.replace(/,/g, ''));
  if (typeof fallback === 'number') return fallback;
  return '';
}
function extractString($, html, regex, fallback) {
  const text = $("body").text() || html;
  const match = text.match(new RegExp(regex.source + '[^\\w]{0,10}([\\w\\s\-+&,.]+)', 'i'));
  if (match && match[1]) return match[1].trim();
  if (typeof fallback === 'string') return fallback;
  if (typeof fallback === 'number') return fallback.toString();
  return '';
}
