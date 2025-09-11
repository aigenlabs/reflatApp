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

  // Additionally, write per-builder project documents into Firestore under
  // collection `builders` -> <builder_id> -> subcollection `projects` -> <project_id>
  // The script will look for tools/data/<builder_id>/<project_id>/<project_id>-details.json
  // and write that JSON as the document data (merged with existing). This keeps
  // Firestore in sync with the local project details files produced by the scraper.
  try {
    for (const loc of locations) {
      if (!loc.projects || !Array.isArray(loc.projects)) continue;
      for (const p of loc.projects) {
        try {
          const builderId = p.builder_id;
          const projectId = p.project_id;
          if (!builderId || !projectId) continue;
          const detailsPath = path.join(__dirname, '../data', builderId, projectId, `${projectId}-details.json`);
          if (!fs.existsSync(detailsPath)) {
            console.warn(`Details JSON not found for ${builderId}/${projectId}, skipping Firestore project write: ${detailsPath}`);
            continue;
          }
          const detailsJson = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
          // Document path: builders/<builderId>/projects/<projectId>
          const projDocRef = db.collection('builders').doc(builderId).collection('projects').doc(projectId);
          // Add a timestamp and small metadata
          const toWrite = Object.assign({}, detailsJson, { _updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          await projDocRef.set(toWrite, { merge: true });
          console.log(`Wrote project details to Firestore: builders/${builderId}/projects/${projectId}`);
        } catch (projErr) {
          console.warn('Failed to write project to Firestore for', p, projErr && projErr.message ? projErr.message : projErr);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to sync per-builder project documents to Firestore:', err && err.message ? err.message : err);
  }
  process.exit(0);
}

uploadLocations().catch(e => { console.error(e); process.exit(1); });
