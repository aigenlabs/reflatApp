const fs = require('fs');
const path = require('path');

// Standard subfolders based on akrida
const standardSubfolders = [
  'photos', 'gallery', 'floor_plans', 'layouts', 'logos', 'banners', 'banner', 'brochures', 'clubhouse', 'project_status', 'project_status_updates', 'videos', 'news', 'site_layout', 'amenities'
];

function ensureStandardSubfolders(mediaPath) {
  for (const sub of standardSubfolders) {
    const subPath = path.join(mediaPath, sub);
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath, { recursive: true });
    }
  }
}

function moveLooseFilesToSubfolders(mediaPath) {
  const files = fs.readdirSync(mediaPath);
  for (const file of files) {
    const filePath = path.join(mediaPath, file);
    if (fs.statSync(filePath).isFile()) {
      // Guess subfolder by extension or name
      let destSub = null;
      const ext = path.extname(file).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tiff"].includes(ext)) destSub = 'photos';
      if (file.toLowerCase().includes('floor')) destSub = 'floor_plans';
      if (file.toLowerCase().includes('logo')) destSub = 'logos';
      if (file.toLowerCase().includes('banner')) destSub = 'banners';
      if (file.toLowerCase().includes('brochure')) destSub = 'brochures';
      if (file.toLowerCase().includes('layout')) destSub = 'layouts';
      if (file.toLowerCase().includes('gallery')) destSub = 'gallery';
      if (file.toLowerCase().includes('club')) destSub = 'clubhouse';
      if (file.toLowerCase().includes('status')) destSub = 'project_status';
      if (file.toLowerCase().includes('video')) destSub = 'videos';
      if (file.toLowerCase().includes('news')) destSub = 'news';
      if (file.toLowerCase().includes('amenity')) destSub = 'amenities';
      if (file.toLowerCase().includes('site')) destSub = 'site_layout';
      if (!destSub) destSub = 'photos'; // fallback
      const destPath = path.join(mediaPath, destSub, file);
      fs.renameSync(filePath, destPath);
      console.log(`Moved ${file} -> ${destSub}/`);
    }
  }
}

const roots = [
  path.join(__dirname, '..', 'data'),
  path.join(__dirname, '..', 'seed')
];

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const builderId of fs.readdirSync(root)) {
    const builderPath = path.join(root, builderId);
    if (!fs.statSync(builderPath).isDirectory()) continue;
    for (const projectId of fs.readdirSync(builderPath)) {
      const projectPath = path.join(builderPath, projectId);
      if (!fs.statSync(projectPath).isDirectory()) continue;
      const mediaPath = path.join(projectPath, 'media');
      if (!fs.existsSync(mediaPath)) {
        console.warn(`[WARN] Missing media folder: ${mediaPath}`);
        // Optionally, create it:
        // fs.mkdirSync(mediaPath, { recursive: true });
      } else {
        ensureStandardSubfolders(mediaPath);
        moveLooseFilesToSubfolders(mediaPath);
      }
      // Optionally, add more checks for manifest.json, uploaded_manifest.json, etc.
    }
  }
}

console.log('Project folder structure check and standardization complete.');