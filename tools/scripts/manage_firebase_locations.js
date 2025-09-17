#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs-extra');
const path = require('path');

/**
 * Comprehensive Firebase locations management script
 * Usage: node manage_firebase_locations.js <command> [--prod|--staging] [options]
 * 
 * Commands:
 *   upload    - Upload locations.json to Firestore
 *   view      - View current Firestore locations data
 *   compare   - Compare local locations.json with Firestore
 *   backup    - Download Firestore data to local backup file
 */

const COMMANDS = {
  upload: 'Upload locations.json to Firestore',
  view: 'View current Firestore locations data',
  compare: 'Compare local and Firestore data',
  backup: 'Backup Firestore data to local file'
};

function showHelp() {
  console.log('Firebase Locations Management Tool');
  console.log('');
  console.log('Usage: node manage_firebase_locations.js <command> [--prod|--staging] [options]');
  console.log('');
  console.log('Commands:');
  Object.entries(COMMANDS).forEach(([cmd, desc]) => {
    console.log(`  ${cmd.padEnd(10)} ${desc}`);
  });
  console.log('');
  console.log('Environment (required):');
  console.log('  --prod      Use production Firebase');
  console.log('  --staging   Use staging Firebase');
  console.log('');
  console.log('Options:');
  console.log('  --detailed  Show detailed project breakdown (for view command)');
  console.log('  --force     Force upload even if data seems unchanged');
  console.log('');
  console.log('Examples:');
  console.log('  node manage_firebase_locations.js upload --staging');
  console.log('  node manage_firebase_locations.js view --prod --detailed');
  console.log('  node manage_firebase_locations.js compare --staging');
  console.log('  node manage_firebase_locations.js backup --prod');
}

async function initializeFirebase(environment) {
  const serviceAccountPath = path.join(__dirname, '..', 'data', `reflat-${environment}-firebase-adminsdk.json`);
  
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  const serviceAccount = require(serviceAccountPath);
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  return admin.firestore();
}

async function loadLocalLocations() {
  const locationsPath = path.join(__dirname, '..', 'data', 'locations.json');
  
  if (!fs.existsSync(locationsPath)) {
    throw new Error(`Locations file not found: ${locationsPath}`);
  }

  return await fs.readJson(locationsPath);
}

async function uploadCommand(environment, options) {
  console.log(`🔥 Uploading to Firebase ${environment.toUpperCase()}`);
  
  const db = await initializeFirebase(environment);
  const locationsData = await loadLocalLocations();
  
  console.log(`📊 Loaded ${locationsData.length} location entries`);

  // Check if we should compare first
  if (!options.force) {
    try {
      const docRef = db.collection('builders').doc('locations');
      const doc = await docRef.get();
      
      if (doc.exists) {
        const currentData = doc.data();
        if (currentData.totalLocations === locationsData.length) {
          console.log('⚠️  Data appears unchanged (same number of locations)');
          console.log('💡 Use --force flag to upload anyway, or run compare command first');
          return;
        }
      }
    } catch (error) {
      console.log('ℹ️  Could not check existing data, proceeding with upload');
    }
  }

  const uploadData = {
    locations: locationsData,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    source: 'locations.json',
    uploadedAt: new Date().toISOString(),
    totalLocations: locationsData.length,
    totalProjects: locationsData.reduce((total, loc) => total + loc.projects.length, 0)
  };

  console.log(`📈 Total projects: ${uploadData.totalProjects}`);
  console.log('🚀 Uploading to Firestore...');
  
  const docRef = db.collection('builders').doc('locations');
  await docRef.set(uploadData, { merge: true });
  
  console.log('✅ Upload successful!');
  console.log(`📍 Document path: builders/locations`);
}

async function viewCommand(environment, options) {
  console.log(`🔥 Viewing Firebase ${environment.toUpperCase()} data`);
  
  const db = await initializeFirebase(environment);
  const docRef = db.collection('builders').doc('locations');
  const doc = await docRef.get();
  
  if (!doc.exists) {
    console.log('📭 No builders/locations document found');
    return;
  }

  const data = doc.data();
  
  console.log('\n📊 Document Metadata:');
  console.log(`   Total Locations: ${data.totalLocations || 0}`);
  console.log(`   Total Projects: ${data.totalProjects || 0}`);
  console.log(`   Last Updated: ${data.lastUpdated ? data.lastUpdated.toDate() : 'Unknown'}`);
  
  if (data.locations && options.detailed) {
    console.log('\n📋 Detailed Breakdown:');
    data.locations.forEach(location => {
      console.log(`\n  📍 ${location.city} - ${location.location}:`);
      if (location.projects && location.projects.length > 0) {
        location.projects.forEach(project => {
          console.log(`     • ${project.builder_id}/${project.project_id}`);
        });
      }
    });
  }
}

async function compareCommand(environment, options) {
  console.log(`🔍 Comparing local data with Firebase ${environment.toUpperCase()}`);
  
  const db = await initializeFirebase(environment);
  const localData = await loadLocalLocations();
  
  const docRef = db.collection('builders').doc('locations');
  const doc = await docRef.get();
  
  console.log(`\n📊 Local Data: ${localData.length} locations`);
  
  if (!doc.exists) {
    console.log('📭 Firebase: No document found');
    console.log('💡 Run upload command to create it');
    return;
  }

  const firebaseData = doc.data();
  console.log(`📱 Firebase: ${firebaseData.totalLocations || 0} locations`);
  
  if (localData.length === firebaseData.totalLocations) {
    console.log('✅ Location counts match');
  } else {
    console.log('⚠️  Location counts differ');
  }
  
  const localProjects = localData.reduce((total, loc) => total + loc.projects.length, 0);
  console.log(`📊 Local Projects: ${localProjects}`);
  console.log(`📱 Firebase Projects: ${firebaseData.totalProjects || 0}`);
  
  if (localProjects === firebaseData.totalProjects) {
    console.log('✅ Project counts match');
  } else {
    console.log('⚠️  Project counts differ - upload recommended');
  }
}

async function backupCommand(environment, options) {
  console.log(`💾 Backing up Firebase ${environment.toUpperCase()} data`);
  
  const db = await initializeFirebase(environment);
  const docRef = db.collection('builders').doc('locations');
  const doc = await docRef.get();
  
  if (!doc.exists) {
    console.log('📭 No data to backup');
    return;
  }

  const data = doc.data();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, '..', 'data', `firebase-backup-${environment}-${timestamp}.json`);
  
  await fs.writeJson(backupPath, data, { spaces: 2 });
  console.log(`✅ Backup saved: ${backupPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const command = args[0];
  const isProd = args.includes('--prod');
  const isStaging = args.includes('--staging');
  
  if (!Object.keys(COMMANDS).includes(command)) {
    console.error(`❌ Unknown command: ${command}`);
    showHelp();
    process.exit(1);
  }

  if (!isProd && !isStaging) {
    console.error('❌ Environment flag required: --prod or --staging');
    process.exit(1);
  }

  const environment = isProd ? 'prod' : 'staging';
  const options = {
    detailed: args.includes('--detailed'),
    force: args.includes('--force')
  };

  try {
    switch (command) {
      case 'upload':
        await uploadCommand(environment, options);
        break;
      case 'view':
        await viewCommand(environment, options);
        break;
      case 'compare':
        await compareCommand(environment, options);
        break;
      case 'backup':
        await backupCommand(environment, options);
        break;
    }
  } catch (error) {
    console.error(`❌ ${command} failed:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
}

module.exports = { uploadCommand, viewCommand, compareCommand, backupCommand };
