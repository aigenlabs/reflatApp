import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const argPath = process.argv[2];
  if (!argPath) {
    console.error('Error: Path to an uploaded_manifest.json file is required.');
    process.exit(1);
  }
  const manifestPath = path.resolve(argPath);
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifestData = JSON.parse(raw);

  const builderId = process.argv[3];
  const projectId = process.argv[4];

  if (!builderId || !projectId) {
    console.error('Error: builderId and projectId are required after the manifest path.');
    process.exit(1);
  }

  const projectRef = db.collection('builders').doc(builderId).collection('projects').doc(projectId);
  console.log('Seeding file subcollections for project:', builderId, projectId);

  // This seeder no longer writes the main project document, only the file subcollections
  // which serve as a fallback for the frontend.

  // Upload the project details from the JSON file in the tools/data folder
  const detailsJsonPath = path.resolve(__dirname, `../../../../tools/data/${builderId}/${projectId}/${projectId}-details.json`);
  if (fs.existsSync(detailsJsonPath)) {
    try {
      const detailsRaw = fs.readFileSync(detailsJsonPath, 'utf8');
      const detailsData = JSON.parse(detailsRaw);
      await projectRef.set(detailsData, { merge: true });
      console.log(`Successfully seeded project details for ${projectId} from ${detailsJsonPath}`);
    } catch (e) {
      console.error(`Failed to read or parse ${detailsJsonPath}`, e);
    }
  } else {
    console.warn(`Warning: Project details JSON not found at ${detailsJsonPath}. Skipping main document seed.`);
  }


  async function writeSubcollection(name: string, items: any[]) {
    if (!Array.isArray(items) || items.length === 0) {
      console.log(`No items to write for subcollection: ${name}`);
      return;
    }
    const batch = db.batch();
    for (const item of items) {
      // Create a stable ID from the file path to avoid creating new docs on every run
      const id = (item.path || item.file || item.id || db.collection('_tmp').doc().id).replace(/[^a-zA-Z0-9.-_]/g, '_');
      const docRef = projectRef.collection(name).doc(id);
      batch.set(docRef, item);
    }
    await batch.commit();
    console.log(`Wrote ${items.length} documents to subcollection: ${name}`);
  }

  const files = manifestData.files || {};
  await writeSubcollection('photos', files.photos || []);
  await writeSubcollection('layouts', files.layouts || []);
  await writeSubcollection('floor_plans', files.floor_plans || []);
  await writeSubcollection('videos', files.videos || []);
  await writeSubcollection('documents', files.documents || []);
  await writeSubcollection('banners', files.banners || []);
  await writeSubcollection('brochures', files.brochures || []);
  await writeSubcollection('logos', files.logos || []);
  await writeSubcollection('project_highlights', files.project_highlights || []);

  console.log('Seeding complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
