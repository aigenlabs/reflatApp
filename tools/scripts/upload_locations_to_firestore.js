// Uploads locations.json to Firestore at locations/projects document
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Use SEED_ENV to select the right service account
const env = process.env.SEED_ENV || 'staging';

// Auto-detect environment if SEED_ENV not set
let detectedEnv = env;
const stagingKey = path.join(__dirname, '../data/reflat-staging-firebase-adminsdk.json');
const prodKey = path.join(__dirname, '../data/reflat-prod-firebase-adminsdk.json');
if (!process.env.SEED_ENV) {
  if (fs.existsSync(stagingKey) && !fs.existsSync(prodKey)) {
    detectedEnv = 'staging';
  } else if (fs.existsSync(prodKey) && !fs.existsSync(stagingKey)) {
    detectedEnv = 'prod';
  } else if (fs.existsSync(stagingKey) && fs.existsSync(prodKey)) {
    // Prefer staging if both exist
    detectedEnv = 'staging';
  }
}
const serviceAccountPath = detectedEnv === 'staging' ? stagingKey : prodKey;
const locationsPath = path.join(__dirname, '../data/locations.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account key not found:', serviceAccountPath);
  process.exit(1);
}
if (!fs.existsSync(locationsPath)) {
  console.error('locations.json not found:', locationsPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
console.log(`[Firestore upload] Using service account project_id: ${serviceAccount.project_id} [env: ${detectedEnv}]`);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadLocations() {
  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
  const docRef = db.collection('locations').doc('projects');
  const docSnap = await docRef.get();
  let firestoreData = docSnap.exists ? docSnap.data().prj_locations || [] : [];

  // Merge local locations into Firestore data incrementally
  for (const loc of locations) {
    let fsLoc = firestoreData.find(l => l.city === loc.city && l.location === loc.location);
    if (!fsLoc) {
      firestoreData.push(loc);
    } else {
      // Merge/replace projects array (union by builder_id+project_id)
      const existing = new Set(fsLoc.projects.map(p => p.builder_id + '|' + p.project_id));
      for (const p of loc.projects) {
        const key = p.builder_id + '|' + p.project_id;
        if (!existing.has(key)) {
          fsLoc.projects.push(p);
        }
      }
    }
  }
  await docRef.set({ prj_locations: firestoreData }, { merge: true });
  console.log(`locations.json incrementally merged to Firestore at locations/projects [env: ${detectedEnv}] (field: prj_locations)`);
  process.exit(0);
}

uploadLocations().catch(e => { console.error(e); process.exit(1); });
