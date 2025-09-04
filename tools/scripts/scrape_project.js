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
  await fs.writeJson(detailsJsonPath, details, { spaces: 2 });
  console.log('Saved', detailsJsonName);

  // Auto-invoke add_project_to_locations.js
  try {
    const { execSync } = require('child_process');
    // Use project_name, city, location from details
    execSync(`node ${path.resolve(__dirname, 'add_project_to_locations.js')} "${builderId}" "${projectId}" "${details.project_name || details.name}" "${details.city}" "${details.location}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('Failed to auto-add project to locations.json:', e.message);
  }

  // --- Scrape and download media files ---
  // Find all images, PDFs, and videos, categorize by subfolder heuristics
  const mediaLinks = [];
  const videoLinks = [];
  $('img, a[href$=".pdf"], a[href$=".webp"], a[href$=".jpg"], a[href$=".png"], a[href$=".jpeg"], a[href$=".gif"]').each((i, el) => {
    let url = $(el).attr('src') || $(el).attr('href');
    if (!url) return;
    if (!/^https?:/.test(url)) url = new URL(url, websiteUrl).href;
    mediaLinks.push(url);
  });
  // Find video URLs (YouTube, Vimeo, mp4, etc.)
  $('iframe, video, a[href$=".mp4"], a[href*="youtube.com"], a[href*="youtu.be"], a[href*="vimeo.com"]').each((i, el) => {
    let url = $(el).attr('src') || $(el).attr('href');
    if (!url) return;
    if (!/^https?:/.test(url)) url = new URL(url, websiteUrl).href;
    videoLinks.push(url);
  });
  details.videos = videoLinks;
  await fs.writeJson(path.join(baseDir, detailsJsonName), details, { spaces: 2 });

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
