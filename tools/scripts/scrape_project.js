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
const crypto = require('crypto');

const SUBFOLDERS = [
  'logos',
  'floor_plans',
  'brochures',
  'banners',
  'photos', // merged gallery and photos
  'layouts', // merged layouts and site_layout
  'news',
  'amenities',
  'documents'
];

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

// Helper: validate a local file by reading header bytes and extension
function isValidLocalFile(fp) {
  try {
    const ext = path.extname(fp) || '';
    if (!isLikelyMediaExt(ext)) return false;
    const stat = fs.statSync(fp);
    if (!stat || !stat.isFile() || stat.size < 64) return false;
    const buf = fs.readFileSync(fp, { encoding: null, flag: 'r' });
    return bufferLooksValid(buf, ext);
  } catch (e) {
    return false;
  }
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
        // remove zero-length or clearly invalid files
        try {
          if (!isValidLocalFile(full)) {
            try { await fs.remove(full); console.log('Removed invalid media file', full); } catch (e) { }
          }
        } catch (e) { /* ignore errors */ }
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
  // Ensure paths are computed relative to the script location so the script behaves
  // the same regardless of the current working directory when invoked.
  const baseDir = path.join(__dirname, '..', 'data', builderId, projectId);
  const mediaDir = path.join(baseDir, 'media');

  await fs.ensureDir(mediaDir);
  for (const sub of SUBFOLDERS) {
    await fs.ensureDir(path.join(mediaDir, sub));
  }

  // remove OS artifacts and invalid files before seeding
  await cleanMediaDir(mediaDir);

  // Install fallback writers so a partial <projectId>-details.json is produced
  // if the script crashes before the normal write occurs. This makes it easier
  // to re-run the scraper and diagnose why a full run failed.
  function writePartialDetailsSync() {
    try {
      const p = path.join(baseDir, `${projectId}-details.json`);
      // Prefer an existing `output` object (if created), otherwise fall back to `details`.
      const out = (typeof output !== 'undefined' && output) ? output : (typeof details !== 'undefined' ? Object.assign({}, details) : null);
      if (!out) return;
      fs.ensureDirSync(baseDir);
      fs.writeFileSync(p, JSON.stringify(out, null, 2));
      console.log(`WROTE partial details JSON to ${p}`);
    } catch (e) {
      console.warn('Failed to write partial details JSON:', e.message);
    }
  }

  process.on('uncaughtException', (err) => {
    console.error('Unhandled exception, attempting to write partial details JSON:', err && err.message);
    writePartialDetailsSync();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection, attempting to write partial details JSON:', reason);
    writePartialDetailsSync();
    process.exit(1);
  });

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
        'city', 'town', 'village', 'hamlet', 'suburb', 'state_district', 'county', 'state', 'postcode', 'country', 'country_code', 'road', 'neighbourhood', 'municipality', 'region', 'ISO3166-2-lvl6'
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
  // collect media links discovered on the page (icons, article images, gallery images etc.)
  let mediaLinks = [];
  // map of amenity icon URLs discovered while scraping to the normalized amenity name(s)
  const amenityIconUrls = {}; // url -> Set of amenity names (string)
  // map of media URL -> saved filename (filled after downloads)
  const urlToSavedFilename = {};
  // temporary collection of discovered news article links and associated image URLs
  const newsArticlesTemp = []; // { url, id, imageUrls: [] }
  function pushMediaLink(url) {
    if (!url) return;
    try { url = (new URL(url, websiteUrl)).href; } catch (e) { return; }
    if (!mediaLinks.includes(url)) mediaLinks.push(url);
  }

  // Merge extra address fields
  // Remove GPS-derived fields we do not want to keep in the final details
  const IGNORE_GEO_FIELDS = new Set(['country','country_code','county','suburb','postcode','scrapedAt','state','state_district']);
  for (const k of Object.keys(extraAddress)) {
    if (IGNORE_GEO_FIELDS.has(k)) delete extraAddress[k];
  }
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
        .map(m => (m[1] ? (m[1].replace(',', '.').trim() + ' BHK') : null))
        .filter(Boolean);
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

  // Extract amenities: list items, icons, and nearby text
  async function extractAmenities() {
    const amenityObjsByName = {}; // normalizedName -> { name: originalName, iconUrls: Set }
    try {
      // Find sections likely to contain amenities
      const selectors = ['[class*="amenit" i]', '[id*="amenit" i]', '[class*="facility" i]', '[id*="facility" i]', 'h2', 'h3', 'h4'];
      const candidates = $(selectors.join(',')).filter(function () {
        const t = $(this).text() || '';
        return /amenit|facility|amenity|what's included|what s included|features|facilities/i.test(t) || /amenit|facility|amenity|features|facilities/i.test($(this).attr('class') || '') || /amenit|facility|amenity|features|facilities/i.test($(this).attr('id') || '');
      });
      candidates.each((i, el) => {
        const $el = $(el);
        // First prefer list items
        $el.find('li').each((ii, li) => {
          const t = $(li).text().trim();
          const resolvedText = t || '';
          // collect any images inside li and map them to this amenity text
          $(li).find('img').each((iii, img) => {
            const src = $(img).attr('src');
            if (!src) return;
            const resolvedUrl = (new URL(src, websiteUrl)).href;
            pushMediaLink(resolvedUrl);
            // temporarily associate this icon URL with the parsed text;
            // we will normalize the text below and merge duplicates
            if (!amenityIconUrls[resolvedUrl]) amenityIconUrls[resolvedUrl] = new Set();
            amenityIconUrls[resolvedUrl].add(resolvedText);
          });
          if (resolvedText) {
            const n = resolvedText.replace(/\s+/g, ' ').replace(/[^\w\s&-]/g, '').toLowerCase().trim();
            if (n) {
              if (!amenityObjsByName[n]) amenityObjsByName[n] = { name: resolvedText.trim(), iconUrls: new Set() };
            }
          }
        });

        // if none, check immediate sibling paragraphs or comma lists
        if (Object.keys(amenityObjsByName).length === 0) {
          const text = ($el.text() || '').trim();
          text.split(/[,•·\n\/]/).map(s => s.trim()).forEach(s => {
            if (!s) return;
            const n = s.replace(/\s+/g, ' ').replace(/[^\w\s&-]/g, '').toLowerCase().trim();
            if (!n) return;
            if (!amenityObjsByName[n]) amenityObjsByName[n] = { name: s.trim(), iconUrls: new Set() };
          });
          // collect any images inside the section and add to media links (no direct mapping to a name)
          $el.find('img').each((ii, img) => {
            const src = $(img).attr('src');
            if (!src) return;
            const resolvedUrl = (new URL(src, websiteUrl)).href;
            pushMediaLink(resolvedUrl);
          });
        }
      });

      // Also consider icon grids: images with alt/title containing amenity keywords
      $('img, svg').each((i, img) => {
        const $img = $(img);
        const alt = ($img.attr('alt') || $img.attr('title') || '').trim();
        const src = $img.attr('src');
        if (!alt || !src) return;
        if (/pool|gym|club|parking|security|lift|playground|garden|school|hospital|spa|squash|tennis|jogging|meditation|pet/i.test(alt)) {
          const resolvedUrl = (new URL(src, websiteUrl)).href;
          pushMediaLink(resolvedUrl);
          const normalized = alt.replace(/\s+/g, ' ').replace(/[^\w\s&-]/g, '').toLowerCase().trim();
          if (normalized) {
            if (!amenityObjsByName[normalized]) amenityObjsByName[normalized] = { name: alt.trim(), iconUrls: new Set() };
            amenityObjsByName[normalized].iconUrls.add(resolvedUrl);
            if (!amenityIconUrls[resolvedUrl]) amenityIconUrls[resolvedUrl] = new Set();
            amenityIconUrls[resolvedUrl].add(normalized);
          }
        }
      });
    } catch (e) {
      // ignore
    }

    // normalize and dedupe using a canonical map where possible
    const STANDARD_AMENITY_MAP = {
      'outdoor gym': 'Outdoor GYM',
      'kids play area': 'KIDS PLAY AREA',
      'kids play': 'KIDS PLAY AREA',
      'tennis courts': 'TENNIS COURTS',
      'seating zone': 'SEATING ZONE',
      'swimming pool': 'SWIMMING POOL',
      'pool': 'SWIMMING POOL',
      'basketball court': 'Basketball Court',
      'box cricket': 'Box Cricket',
      'ampthitheatre': 'AMPTHITHEATRE',
      'amphitheatre': 'AMPTHITHEATRE',
      'pet zone': 'pet Zone',
      'cricket practice nets': 'Cricket Practice Nets',
      'lawns': 'Lawns',
      'sky walk': 'Sky Walk',
      'jogging': 'Jogging',
      'walking track': 'Walking Track',
      'walking': 'Walking Track',
      'cycling track': 'Cycling TracK',
      'cycling trac k': 'Cycling TracK',
      'skating rink': 'Skating RinK',
      'grand lobby': 'Grand Lobby',
      'gym': 'gym',
      'multi purpose halls': 'MultiPurpose Halls',
      'multipurpose halls': 'MultiPurpose Halls',
      'yoga': 'Yoga',
      'meditation & aerobic halls': 'Meditation & Aerobic HallS',
      'meditation': 'Meditation & Aerobic HallS',
      'reading area': 'Reading Area',
      'guest rooms': 'Guest Rooms',
      'indoor badminton courts': 'Indoor Badminton Courts',
      'indoor games': 'Indoor Games',
      'squash court': 'Squash Court',
      'convenience store': 'Convenience Store',
      'pharmacy': 'Pharmacy',
      'atm': 'ATM',
      'bank': 'BANK',
      'f&b': 'F&B',
      'f and b': 'F&B',
      'spa and salon': 'Spa and Salon',
      'spa': 'Spa and Salon',
      'salon': 'Spa and Salon',
      // add more mappings as needed
    };

    function normKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    function mappedAmenity(norm) {
      if (!norm) return null;
      const n = normKey(norm);
      if (STANDARD_AMENITY_MAP[n]) return { key: STANDARD_AMENITY_MAP[n].toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: STANDARD_AMENITY_MAP[n] };
      // try partial match: if any standard key is substring of n or vice-versa
      for (const k of Object.keys(STANDARD_AMENITY_MAP)) {
        if (n.includes(k) || k.includes(n)) {
          const v = STANDARD_AMENITY_MAP[k];
          return { key: v.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: v };
        }
      }
      return null;
    }

    const amenityObjs = [];
    for (const [norm, obj] of Object.entries(amenityObjsByName)) {
      const manual = mappedAmenity(norm) || mappedAmenity(obj.name) || null;
      const key = manual ? manual.key : (norm || obj.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const displayName = manual ? manual.name : (obj.name || norm);
      // merge duplicates by key
      let existing = amenityObjs.find(a => (a.key === key));
      if (!existing) {
        existing = { key, name: displayName, iconUrls: new Set() };
        amenityObjs.push(existing);
      }
      // merge iconUrls
      for (const u of obj.iconUrls) existing.iconUrls.add(u);
    }

    if (amenityObjs.length) {
      // Convert sets to arrays
      details.amenities = amenityObjs.map(a => ({ name: a.name, key: a.key, iconUrls: Array.from(a.iconUrls) }));
      console.log('Extracted amenities (with possible icons):', details.amenities.map(a => a.name));
    }
  }

  await extractAmenities();

  // Extract news/article links and images so we can reference saved filenames later
  async function extractNews() {
    try {
      // Find anchor links that look like news/articles or blog posts
      $('a[href]').each((i, el) => {
        try {
          const href = $(el).attr('href');
          if (!href) return;
          const resolved = (new URL(href, websiteUrl)).href;
          if (!/news|blog|article/i.test(resolved)) return;
          // derive a sensible id from the pathname
          const p = new URL(resolved).pathname;
          let id = path.basename(p).split('?')[0] || p.replace(/[\/]/g, '_');
          id = id.replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || resolved;

          // try to find an image inside the anchor or nearby
          const img = $(el).find('img').first();
          const imageUrls = [];
          if (img && img.attr('src')) {
            const imgUrl = (new URL(img.attr('src'), websiteUrl)).href;
            imageUrls.push(imgUrl);
            pushMediaLink(imgUrl);
          } else {
            // look for an image in parent article/news-item
            const parentImg = $(el).closest('article, .news-item, .post, .blog-post').find('img').first();
            if (parentImg && parentImg.attr('src')) {
              const imgUrl = (new URL(parentImg.attr('src'), websiteUrl)).href;
              imageUrls.push(imgUrl);
              pushMediaLink(imgUrl);
            }
          }

          // record the article entry if not already present
          const exists = newsArticlesTemp.find(n => n.id === id || n.url === resolved);
          if (!exists) newsArticlesTemp.push({ url: resolved, id, imageUrls });
        } catch (e) {
          // ignore malformed urls
        }
      });

      // Also consider any obvious news images (class/id containing news/article) and map them to a generated id
      $('img').each((i, img) => {
        try {
          const cls = ($(img).attr('class') || '') + ' ' + ($(img).attr('id') || '');
          if (!/news|article|blog/i.test(cls)) return;
          const src = $(img).attr('src');
          if (!src) return;
          const resolvedUrl = (new URL(src, websiteUrl)).href;
          // generate an id from the filename
          const base = path.basename(new URL(resolvedUrl).pathname).split('?')[0] || resolvedUrl;
          const id = base.replace(/[^a-zA-Z0-9_\-]+/g, '_').toLowerCase();
          // avoid duplicates
          if (!newsArticlesTemp.find(n => n.id === id)) {
            newsArticlesTemp.push({ url: resolvedUrl, id, imageUrls: [resolvedUrl] });
            pushMediaLink(resolvedUrl);
          }
        } catch (e) { }
      });

      if (newsArticlesTemp.length) console.log('Found news articles:', newsArticlesTemp.map(n => n.id));
    } catch (e) {
      // ignore
    }
  }
  await extractNews();

  // Broad DOM scan to discover media links that earlier targeted extractors may miss
  async function extractGenericMedia() {
    try {
      // images (src, data-src, data-lazy)
      $('img').each((i, el) => {
        try {
          const $el = $(el);
          const src = ($el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy') || '').trim();
          if (!src) return;
          const resolved = (new URL(src, websiteUrl)).href;
          pushMediaLink(resolved);
        } catch (e) { /* ignore */ }
      });

      // anchors that point to images, PDFs or named assets (floor, brochure, banner etc.)
      $('a[href]').each((i, el) => {
        try {
          const href = $(el).attr('href');
          if (!href) return;
          const resolved = (new URL(href, websiteUrl)).href;
          const p = resolved.split('?')[0].split('#')[0];
          if (/\.(png|jpe?g|webp|svg|gif|pdf|docx?|pptx?)$/i.test(p)) {
            pushMediaLink(resolved);
            return;
          }
          // heuristics: filenames containing these tokens are likely to be floorplans, brochures or banners
          if (/floor|plan|brochure|banner|hero|slide|flyer|catalog/i.test(p)) pushMediaLink(resolved);
        } catch (e) { /* ignore */ }
      });

      // OpenGraph and Twitter images
      const og = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
      if (og) try { pushMediaLink((new URL(og, websiteUrl)).href); } catch (e) { }

      // link rel icons (favicons / logos)
      $('link[rel]').each((i, el) => {
        try {
          const rel = ($(el).attr('rel') || '').toLowerCase();
          if (!/icon|apple-touch-icon|image_src/.test(rel)) return;
          const href = $(el).attr('href');
          if (!href) return;
          pushMediaLink((new URL(href, websiteUrl)).href);
        } catch (e) { }
      });
    } catch (e) {
      // ignore
    }
  }

  await extractGenericMedia();

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

  // Ensure `output` exists and include key_project_details with builder_id
  if (typeof output === 'undefined' || !output) {
    // default output to a shallow copy of details
    var output = Object.assign({}, details);
  }

  // Ensure key_project_details object exists and populate authoritative fields
  output.key_project_details = output.key_project_details || {};
  const kpd = output.key_project_details;

  // Populate canonical identifying fields from details (falling back to CLI args)
  kpd.builder_id = kpd.builder_id || details.builder_id || builderId;
  kpd.builder_name = kpd.builder_name || details.builder_name || details.builder_id || builderId;
  kpd.project_id = kpd.project_id || details.project_id || projectId;
  kpd.project_name = kpd.project_name || (details.project_name || details.name) || projectId;

  // Location-related canonical fields
  kpd.project_location = kpd.project_location || details.suburb || details.location || '';
  kpd.project_city = kpd.project_city || details.city || '';
  kpd.gps = kpd.gps || details.gps || null;

  // Other descriptive/metadata fields
  kpd.url = kpd.url || details.url || websiteUrl;
  kpd.scrapedAt = kpd.scrapedAt || details.scrapedAt || new Date().toISOString();
  kpd.videos = kpd.videos || (details.videos || []);
  // NOTE: deliberately DO NOT assign any ISO3166 fields into key_project_details
  // kpd['ISO3166-2-lvl4'] = kpd['ISO3166-2-lvl4'] || details['ISO3166-2-lvl4'] || null;
  // Normalize RERA / registration numbers to a concise value
  function normalizeRera(val) {
    if (!val) return null;
    let s = String(val || '').replace(/\r/g, '\n');
    // remove everything after any KEY HIGHLIGHT header accidentally captured
    s = s.split(/KEY\s*HIGHLIGHT/i)[0];
    // collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    // common patterns: RERA xxxx, Regn No xxxx, Regn xxxx
    const pat1 = s.match(/RERA[^0-9A-Z]*([A-Z0-9\-/]+)/i);
    if (pat1 && pat1[1]) return pat1[1].trim();
    const pat2 = s.match(/Regn(?:\.?|istration)?(?:\s*No\.?|\s*)[^A-Z0-9]*([A-Z0-9\-/]+)/i);
    if (pat2 && pat2[1]) return pat2[1].trim();
    const pat3 = s.match(/Regn[^A-Z0-9]*([A-Z0-9\-/]+)/i);
    if (pat3 && pat3[1]) return pat3[1].trim();
    // fallback: take first segment up to punctuation within reasonable length
    const fallback = s.split(/[;\n\|\-]/)[0].trim();
    if (!fallback) return null;
    return fallback.length > 60 ? fallback.slice(0, 60).trim() : fallback;
  }

  kpd.rera_number = normalizeRera(kpd.rera_number || details.rera_number || null);

  // Numeric/summary fields
  ['total_acres','total_towers','total_floors','units_per_floor','config','unit_sizes','total_units','flats_per_acre','open_space_percent'].forEach(fn => {
    if (typeof details[fn] !== 'undefined' && typeof kpd[fn] === 'undefined') kpd[fn] = details[fn];
  });

  // Explicitly remove the canonical fields from top-level `details` so they only live under key_project_details
  try {
    const canonicalOnly = [
      'builder_id','builder_name','project_id','project_name',
      'name','description','location','city','suburb','gps','url','scrapedAt','videos','ISO3166-2-lvl4',
      'rera_number','total_acres','total_towers','total_floors','units_per_floor','config','unit_sizes','total_units','flats_per_acre','open_space_percent'
    ];
    for (const f of canonicalOnly) {
      if (Object.prototype.hasOwnProperty.call(details, f)) delete details[f];
      if (Object.prototype.hasOwnProperty.call(output, f)) delete output[f];
    }
  } catch (e) { /* ignore */ }

  // (no backward-compat assignment of amenities or news into key_project_details)

  // Build amenity icon references and normalize amenities to use local amenity files
  if (details.amenities && Array.isArray(details.amenities)) {
    const amenitiesDir = path.join(mediaDir, 'amenities');
    let amenFiles = [];
    try {
      if (fs.existsSync(amenitiesDir)) {
        amenFiles = (await fs.readdir(amenitiesDir)).filter(f => fs.statSync(path.join(amenitiesDir, f)).isFile());
      }
    } catch (e) { amenFiles = []; }

    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

    const normalized = [];
    for (const a of details.amenities) {
      let assigned = null;
      // 1) direct mapping from collected iconUrls -> saved filename
      if (a.iconUrls && Array.isArray(a.iconUrls) && a.iconUrls.length) {
        for (const u of a.iconUrls) {
          if (urlToSavedFilename[u]) { assigned = urlToSavedFilename[u]; break; }
        }
      }

      // 2) filename contains key/name
      if (!assigned && amenFiles.length) {
        const keyNorm = norm(a.key || '');
        const nameNorm = norm(a.name || '');
        for (const f of amenFiles) {
          const fbase = norm(path.parse(f).name);
          if (keyNorm && fbase.includes(keyNorm)) { assigned = f; break; }
          if (nameNorm && fbase.includes(nameNorm)) { assigned = f; break; }
        }
      }

      // 3) token intersection fallback
      if (!assigned && amenFiles.length) {
        const tokensA = new Set((norm(a.name || a.key || '')).split(' ').filter(Boolean));
        for (const f of amenFiles) {
          const fTokens = new Set((norm(path.parse(f).name)).split(' ').filter(Boolean));
          let common = 0;
          for (const t of tokensA) if (fTokens.has(t)) common++;
          if (common >= 1) { assigned = f; break; }
        }
      }

      if (assigned) {
        normalized.push({ path: `amenities/${assigned}`, filename: assigned, name: a.name || null, key: a.key || null, icon: `amenities/${assigned}` });
      } else {
        // keep a minimal record when no local file found
        normalized.push({ path: null, filename: null, name: a.name || null, key: a.key || null, icon: null });
      }
    }

    // overwrite details.amenities with normalized records (no iconUrls)
    details.amenities = normalized;
  }

  // Build news_articles array: { id, image }
  details.news_articles = [];
  if (newsArticlesTemp && newsArticlesTemp.length) {
    for (const entry of newsArticlesTemp) {
      let assigned = null;
      if (entry.imageUrls && entry.imageUrls.length) {
        for (const u of entry.imageUrls) {
          if (urlToSavedFilename[u]) { assigned = urlToSavedFilename[u]; break; }
        }
      }
      details.news_articles.push({ id: entry.id, image: assigned ? `news/${assigned}` : null });
    }
  }

  // --- new: download & categorize discovered media into subfolders and populate details arrays ---
  async function downloadAndAssignMedia() {
    // Prepare collections and seed from existing files on disk so repeated runs preserve earlier downloads
    const mediaCollections = {}; // subfolder -> [relpath]
    for (const s of SUBFOLDERS) {
      mediaCollections[s] = [];
      try {
        const dir = path.join(mediaDir, s);
        if (fs.existsSync(dir)) {
          const files = (await fs.readdir(dir)).filter(f => fs.statSync(path.join(dir, f)).isFile());
          for (const f of files) {
            const full = path.join(dir, f);
            // skip hidden or artifact files
            if (f.startsWith('.') || f.startsWith('._')) continue;
            // validate file header; remove if invalid
            if (!isValidLocalFile(full)) { try { await fs.remove(full); console.log('Removed invalid seed file', full); } catch (e) {} continue; }
            const rel = `${s}/${f}`;
            if (!mediaCollections[s].includes(rel)) mediaCollections[s].push(rel);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // If no discovered media links, we still want to ensure details arrays include existing files
    if (!mediaLinks || !mediaLinks.length) {
      // merge seeded collections into details below
    } else {
      for (const url of mediaLinks) {
        try {
          const res = await fetch(url);
          if (!res.ok) { console.warn('Skipping non-ok media URL', url, res.status); continue; }
          const buffer = await res.buffer();
          // derive extension early (from URL path or content-type) so validation can use it
          const pathname = (new URL(url)).pathname || '';
          let ext = path.extname(pathname).split('?')[0] || '';
          if (!ext) {
            const ct = (res.headers && (res.headers.get ? res.headers.get('content-type') : res.headers['content-type'])) || '';
            if (/png/i.test(ct)) ext = '.png';
            else if (/jpe?g/i.test(ct)) ext = '.jpg';
            else if (/webp/i.test(ct)) ext = '.webp';
            else if (/svg/i.test(ct)) ext = '.svg';
            else if (/pdf/i.test(ct)) ext = '.pdf';
            else ext = '.bin';
          }
          // Validate downloaded buffer before writing
          // if (!bufferLooksValid(buffer, ext)) {
          //   console.warn('Downloaded file appears invalid or corrupted, skipping:', url);
          //   continue;
          // }
          const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0,12);
          const basename = path.basename(pathname) || '';
          const nameOnly = basename ? path.parse(basename).name : '';
          // sanitize basename to create a safe, readable suffix
          const safeName = (String(nameOnly || '')).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0,40);
          // choose probable subfolder using folder hints or keyword heuristics
          let chosen = 'photos';
          const lower = (pathname + ' ' + basename + ' ' + url).toLowerCase();
          for (const s of SUBFOLDERS) {
            if (pathname.includes(`/${s}/`) || basename.toLowerCase().includes(s.replace('_', ''))) { chosen = s; break; }
          }
          // Keyword overrides to catch floor plans, brochures, banners, logos etc.
          if (/\b(floor|plan)s?\b/.test(lower)) chosen = 'floor_plans';
          else if (/\b(brochure|brochure_pdf|ebrochure|e-brochure)\b/.test(lower) || /\.pdf$/.test(lower)) chosen = 'brochures';
          else if (/\b(banner|hero|slide|carousel)\b/.test(lower)) chosen = 'banners';
          else if (/\b(logo|favicon|icon|brand)\b/.test(lower)) chosen = 'logos';
          else if (/\b(layout|site_layout|site-layout)\b/.test(lower)) chosen = 'layouts';
          else if (/amenit|amenit(y|ies)|icon\b/.test(lower)) chosen = 'amenities';

          // Prefer an existing file that starts with the same hash (preserve dedupe across runs)
          let filename = '';
          try {
            const dir = path.join(mediaDir, chosen);
            const files = (fs.existsSync(dir) ? await fs.readdir(dir) : []);
            const existing = files.find(f => f && f.startsWith(hash));
            if (existing) {
              filename = existing;
            } else {
              filename = safeName ? `${hash}-${safeName}${ext}` : `${hash}${ext}`;
            }
          } catch (e) {
            filename = safeName ? `${hash}-${safeName}${ext}` : `${hash}${ext}`;
          }

          const dest = path.join(mediaDir, chosen, filename);
          if (!fs.existsSync(dest)) {
            await fs.ensureDir(path.dirname(dest));
            await fs.writeFile(dest, buffer);
          }
          urlToSavedFilename[url] = filename;
          const rel = `${chosen}/${filename}`;
          if (!mediaCollections[chosen].includes(rel)) mediaCollections[chosen].push(rel);
        } catch (e) {
          console.warn('Failed to download media', url, e && e.message);
        }
      }
    }

    // Merge mediaCollections into details without corrupting object-arrays like details.amenities
    for (const s of SUBFOLDERS) {
      const collected = (mediaCollections[s] || []).filter(p => { const b = path.basename(p||''); return b && !b.startsWith('.') && b.toLowerCase() !== '.ds_store'; });
      // ensure details has an array for this subfolder or an object-array for things like amenities
      if (!Object.prototype.hasOwnProperty.call(details, s)) {
        details[s] = collected.slice();
        continue;
      }
      const existing = details[s];
      const isObjectArray = Array.isArray(existing) && existing.length > 0 && typeof existing[0] === 'object';
      if (isObjectArray) {
        // keep existing object-array (e.g., amenities) and expose files in a companion array
        const filesKey = `${s}_files`;
        const prevFiles = Array.isArray(details[filesKey]) ? details[filesKey] : [];
        details[filesKey] = Array.from(new Set([...(prevFiles || []), ...collected]));
      } else if (Array.isArray(existing)) {
        // merge existing strings with collected ones
        details[s] = Array.from(new Set([...(existing || []), ...collected]));
      } else {
        // unexpected type: overwrite with collected
        details[s] = collected.slice();
      }
    }
  }

  await downloadAndAssignMedia();

  // Merge amenities_files into amenities objects so we don't keep two separate fields
  async function mergeAmenitiesFilesIntoAmenities() {
    if (!details.amenities || !Array.isArray(details.amenities)) return;
    const files = Array.isArray(details.amenities_files) ? details.amenities_files.slice() : [];
    if (!files.length) return;

    function normText(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    // build file bases
    const fileMeta = files.map(f => ({ file: f, base: normText(path.parse(f).name) }));

    for (const amen of details.amenities) {
      // preserve any existing explicit icon/path/filename
      if (amen && (amen.icon || amen.filename || amen.path)) continue;
      const nameNorm = normText(amen.name || '');
      const keyNorm = normText(amen.key || '');
      let best = null;
      let bestScore = 0;

      for (const fm of fileMeta) {
        if (!fm.base) continue;
        // direct contains match scores highly
        if (keyNorm && fm.base.includes(keyNorm)) { best = fm; bestScore = 100; break; }
        if (nameNorm && fm.base.includes(nameNorm)) { best = fm; bestScore = 90; break; }

        // token intersection fallback
        const aTokens = new Set((nameNorm + ' ' + keyNorm).split(' ').filter(Boolean));
        const fTokens = new Set(fm.base.split(' ').filter(Boolean));
        let common = 0;
        for (const t of aTokens) if (fTokens.has(t)) common++;
        if (common > bestScore) { bestScore = common; best = fm; }
      }

      if (best && best.file) {
        amen.filename = path.basename(best.file);
        amen.path = best.file;
        amen.icon = best.file;
      }
    }

    // remove the separate amenities_files field to avoid duplication
    try { if (Object.prototype.hasOwnProperty.call(details, 'amenities_files')) delete details.amenities_files; } catch (e) { /* ignore */ }
  }

  await mergeAmenitiesFilesIntoAmenities();

  // simplify amenities to only { name, icon }
  (function simplifyAmenities() {
    try {
      if (!details.amenities || !Array.isArray(details.amenities)) return;

      function escRx(s){ return String(s||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      const bn = String(builderId || '').toLowerCase();
      const pn = String(projectId || '').toLowerCase();
      const bname = String((details.builder_name || details.builder_id || '')).toLowerCase();
      const pname = String((details.project_name || details.project_id || '')).toLowerCase();
      const patterns = [bn, pn, bname, pname].filter(Boolean).map(escRx);
      const stripRe = patterns.length ? new RegExp('\\b(' + patterns.join('|') + ')\\b', 'ig') : null;

      details.amenities = details.amenities.map(a => {
        let name = a && (a.name || a.key) ? String(a.name || a.key).trim() : null;
        if (name && stripRe) {
          name = name.replace(stripRe, '');
        }
        // remove builder/project specific tokens only via stripRe — avoid hard-coded brand filters
        // (previously had explicit "my home" replacements; removed to keep logic generic)
        // cleanup separators and extra punctuation
        if (name) {
          name = name.replace(/[-_\/:]+/g, ' ').replace(/[()\[\]\{\}\.|,]/g, ' ').replace(/\s+/g, ' ').trim();
          // remove common noise tokens like 'area', 'img', 'image', 'cotta', 'terra', 'lobby', 'hall', 'saloon', 'clubhouse'
          name = name.replace(/\b(area|areas|img|image|images|cotta|terra|lobby|hall|saloon|salon|clubhouse|club)\b/ig, '').replace(/\s+/g, ' ').trim();
          // remove trailing connectors like '-' or ':' remnants
          name = name.replace(/[\-:\/]$/g, '').trim();
          // Title-case the name to keep it presentable
          name = name.split(' ').filter(Boolean).map(w => w.length > 1 ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w.toUpperCase()).join(' ');
        }
        const icon = a && (a.icon || a.path || a.filename) ? (a.icon || a.path || a.filename) : null;
        return { name: name || null, icon: icon || null };
      }).filter(x => x && (x.name || x.icon));
    } catch (e) { /* ignore */ }
  })();

  // Ensure key_project_details doesn't get bulky arrays; keep amenities/news only at top-level
  if (output && output.key_project_details) {
    if (output.key_project_details.news_articles) delete output.key_project_details.news_articles;
    if (output.key_project_details.amenities) delete output.key_project_details.amenities;
  }

  // Remove identifying/descriptive fields from top-level `details` so they only exist under key_project_details
  try {
    const toRemove = ['builder_id','builder_name','project_id','project_name','name','description','location','city','suburb','gps','url','scrapedAt','videos','ISO3166-2-lvl4','rera_number','total_acres','total_towers','total_floors','config','unit_sizes','total_units','flats_per_acre','open_space_percent'];
    for (const f of toRemove) {
      if (Object.prototype.hasOwnProperty.call(details, f)) delete details[f];
    }
  } catch (e) { /* ignore */ }

  // Save details as <projectId>-details.json now that media filenames are known
  // Merge latest details into output so the JSON reflects downloaded filenames and new arrays
  Object.assign(output, details);
  const detailsJsonName = `${projectId}-details.json`;
  const detailsJsonPath = path.join(baseDir, detailsJsonName);

  // Remove ISO3166 field from both canonical kpd and any top-level copies
  try {
    if (output.key_project_details) delete output.key_project_details['ISO3166-2-lvl4'];
    if (details && Object.prototype.hasOwnProperty.call(details, 'ISO3166-2-lvl4')) delete details['ISO3166-2-lvl4'];
    if (Object.prototype.hasOwnProperty.call(output, 'ISO3166-2-lvl4')) delete output['ISO3166-2-lvl4'];
  } catch (e) { /* ignore */ }

  // Build final output with strict top-level keys to ensure only canonical metadata
  const finalOutput = {};
  // Determine scrapedAt to use (prefer details, then kpd, else now)
  const topScrapedAt = (details && details.scrapedAt) || (output && output.key_project_details && output.key_project_details.scrapedAt) || new Date().toISOString();
  finalOutput.scrapedAt = topScrapedAt;

  // create a deep copy of the canonical block and remove forbidden keys to be absolutely sure
  const safeKpd = output.key_project_details ? JSON.parse(JSON.stringify(output.key_project_details)) : {};
  if (Object.prototype.hasOwnProperty.call(safeKpd, 'ISO3166-2-lvl4')) delete safeKpd['ISO3166-2-lvl4'];
  if (Object.prototype.hasOwnProperty.call(safeKpd, 'scrapedAt')) delete safeKpd['scrapedAt'];
  // ensure project_suburb is not present in canonical block
  if (Object.prototype.hasOwnProperty.call(safeKpd, 'project_suburb')) delete safeKpd['project_suburb'];
  // Ensure flats_per_acre is present in canonical block. Migrate old flats_density if present.
  try {
    if (Object.prototype.hasOwnProperty.call(safeKpd, 'flats_density')) {
      // migrate existing value to new key if flats_per_acre missing
      safeKpd['flats_per_acre'] = safeKpd['flats_per_acre'] || safeKpd['flats_density'] || '';
      delete safeKpd['flats_density'];
    } else if (!Object.prototype.hasOwnProperty.call(safeKpd, 'flats_per_acre')) {
      safeKpd['flats_per_acre'] = '';
    }
  } catch (e) { /* ignore */ }
  finalOutput.key_project_details = safeKpd;

  // Ensure we do not include the news_articles helper; keep the 'news' subfolder as a media array
  // Remove any temporary/news_articles fields from details/output to satisfy the requested shape
  try { if (Object.prototype.hasOwnProperty.call(details, 'news_articles')) delete details.news_articles; } catch (e) { }
  try { if (Object.prototype.hasOwnProperty.call(output, 'news_articles')) delete output.news_articles; } catch (e) { }

  // Allowed top-level keys: standardized media subfolders (include 'news'), plus amenities
  const allowedKeys = new Set([ 'amenities', ...SUBFOLDERS ]);

  for (const key of allowedKeys) {
    // prefer values from output, then details, else provide empty array/object
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      finalOutput[key] = output[key];
    } else if (Object.prototype.hasOwnProperty.call(details, key)) {
      finalOutput[key] = details[key];
    } else {
      finalOutput[key] = [];
    }
  }

  // Remove any accidental 'news' key to comply with standardized shape
  if (Object.prototype.hasOwnProperty.call(finalOutput, 'news')) delete finalOutput['news'];

  // If any media subfolder key is missing or empty in finalOutput, seed it from mediaDir
  try {
    for (const s of SUBFOLDERS) {
      if (!Object.prototype.hasOwnProperty.call(finalOutput, s) || !Array.isArray(finalOutput[s]) || finalOutput[s].length === 0) {
        const dir = path.join(mediaDir, s);
        const collected = [];
        if (fs.existsSync(dir)) {
          const files = await fs.readdir(dir);
          for (const f of files) {
            if (!f || f.startsWith('.') || f.startsWith('._')) continue;
            const full = path.join(dir, f);
            try {
              if (!fs.statSync(full).isFile()) continue;
              if (!isValidLocalFile(full)) continue;
              collected.push(`${s}/${f}`);
            } catch (e) {
              continue;
            }
          }
        }
        finalOutput[s] = Array.from(new Set([...(finalOutput[s] || []), ...collected]));
      }
    }
  } catch (e) {
    console.warn('Failed to seed missing media keys from disk:', e && e.message);
  }

  // Ensure canonical block includes builder_logo and project_logo when available
  try {
    const logosArr = Array.isArray(finalOutput.logos) ? finalOutput.logos : [];
    if (logosArr.length) {
      // Prefer the first logo as builder_logo and second (if present) as project_logo
      finalOutput.key_project_details.builder_logo = finalOutput.key_project_details.builder_logo || logosArr[0];
      finalOutput.key_project_details.project_logo = finalOutput.key_project_details.project_logo || (logosArr[1] || logosArr[0]);
    } else {
      // Fallback to any file references present in the `output` object
      try {
        if (!finalOutput.key_project_details.builder_logo && output && output.files && output.files.builder_logo) finalOutput.key_project_details.builder_logo = output.files.builder_logo;
        if (!finalOutput.key_project_details.project_logo && output && output.files && output.files.project_logo) finalOutput.key_project_details.project_logo = output.files.project_logo;
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // tolerate any failure; not critical
  }

  await fs.writeJson(detailsJsonPath, finalOutput, { spaces: 2 });
  console.log('Saved project details JSON.');

  // Decoupled: do not automatically update locations.json.
  // To enable automatic updates set the environment variable UPDATE_LOCATIONS=1
  // or run the helper script manually:
  //   node tools/scripts/add_project_to_locations.js "<builderId>" "<projectId>" "<projectName>" "<city>" "<location>"
  if (process.env.UPDATE_LOCATIONS === '1') {
    try {
      const { execSync } = require('child_process');
      const projectName = (finalOutput.key_project_details && finalOutput.key_project_details.project_name) || finalOutput.project_name || projectId;
      const cityName = finalOutput.key_project_details ? finalOutput.key_project_details.project_city : (finalOutput.city || '');
      const locationName = finalOutput.key_project_details ? finalOutput.key_project_details.project_location : (finalOutput.location || '');
      execSync(`node ${path.resolve(__dirname, 'add_project_to_locations.js')} "${builderId}" "${projectId}" "${projectName}" "${cityName}" "${locationName}"`, { stdio: 'inherit' });
      console.log('Added project to local locations.json via add_project_to_locations.js');
    } catch (e) {
      console.warn('Failed to auto-add project to locations.json:', e.message);
    }
  } else {
    console.log('Skipping automatic update of locations.json (decoupled). To enable set UPDATE_LOCATIONS=1 or run add_project_to_locations.js manually.');
  }

  console.log('Scraping and download complete.');

}

main().catch(e => { console.error(e); process.exit(1); });

// --- helpers for extraction ---
function extractNumber($, html, regex, fallback) {
  // Try to find a number near a label matching regex
  const text = $("body").text() || html;
  const re = new RegExp(regex.source + '[^\\d]{0,10}(\\d+[.,]?\\d*)', 'i');
  const match = text.match(re);
  if (match && match[1]) return parseFloat(match[1].replace(/,/g, ''));
  if (typeof fallback === 'string' && fallback) {
    try {
      return parseFloat(fallback.replace(/,/g, ''));
    } catch (e) {
      return '';
    }
  }
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
