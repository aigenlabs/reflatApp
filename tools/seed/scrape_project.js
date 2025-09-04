#!/usr/bin/env node
/*
Usage:
  node scrape_project.js <builderId> <projectId> <websiteUrl>

- Scrapes the given project website for details and media.
- Saves details as project-details.json.
- Downloads media into standard subfolders (logos, floor_plans, brochures, banners, photos, layouts, gallery, site_layout, project_status, videos, news, project_status_updates, documents) under tools/data/<builderId>/<projectId>/media/<subfolder>/
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
  'photos',
  'layouts',
  'gallery',
  'site_layout',
  'project_status',
  'videos',
  'news',
  'project_status_updates',
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

async function main() {
  const [builderId, projectId, websiteUrl] = process.argv.slice(2);
  if (!builderId || !projectId || !websiteUrl) {
    console.error('Usage: node scrape_project.js <builderId> <projectId> <websiteUrl>');
    process.exit(1);
  }
  const baseDir = path.join('tools', 'data', builderId, projectId);
  const mediaDir = path.join(baseDir, 'media');
  await fs.ensureDir(mediaDir);
  for (const sub of SUBFOLDERS) {
    await fs.ensureDir(path.join(mediaDir, sub));
  }

  // Fetch and parse the website
  const { data: html } = await axios.get(websiteUrl);
  const $ = cheerio.load(html);

  // --- Scrape project details (customize selectors as needed) ---
  const details = {
    name: $('h1, .project-title, .title').first().text().trim() || projectId,
    description: $('meta[name="description"]').attr('content') || $('p, .description').first().text().trim(),
    location: $('[class*=location], .address').first().text().trim(),
    url: websiteUrl,
    scrapedAt: new Date().toISOString(),
  };

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

  await fs.writeJson(path.join(baseDir, 'project-details.json'), details, { spaces: 2 });
  console.log('Saved project-details.json');

  // --- Scrape and download media files ---
  // Example: find all images and PDFs, categorize by subfolder heuristics
  const mediaLinks = [];
  $('img, a[href$=".pdf"], a[href$=".webp"], a[href$=".jpg"], a[href$=".png"], a[href$=".jpeg"], a[href$=".gif"]').each((i, el) => {
    let url = $(el).attr('src') || $(el).attr('href');
    if (!url) return;
    if (!/^https?:/.test(url)) url = new URL(url, websiteUrl).href;
    mediaLinks.push(url);
  });

  // Heuristic: assign to subfolders by filename or URL
  for (const url of mediaLinks) {
    const lower = url.toLowerCase();
    let sub = 'documents';
    if (lower.includes('logo')) sub = 'logos';
    else if (lower.includes('floor')) sub = 'floor_plans';
    else if (lower.includes('brochure')) sub = 'brochures';
    else if (lower.includes('banner')) sub = 'banners';
    else if (lower.includes('gallery')) sub = 'gallery';
    else if (lower.includes('layout')) sub = 'layouts';
    else if (lower.includes('site')) sub = 'site_layout';
    else if (lower.includes('status')) sub = 'project_status';
    else if (lower.includes('video')) sub = 'videos';
    else if (lower.includes('news')) sub = 'news';
    else if (lower.includes('update')) sub = 'project_status_updates';
    else if (lower.match(/\.(jpg|jpeg|png|webp|gif)$/)) sub = 'photos';
    const fname = path.basename(new URL(url).pathname).split('?')[0];
    const dest = path.join(mediaDir, sub, fname);
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
