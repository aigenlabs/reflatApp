#!/usr/bin/env node
/*
 Node test for unified listings API (create + fetch)
 Usage:
   node scripts/test_listings.js --base https://api-xxx.a.run.app/api
   BASE=https://api-xxx.a.run.app/api node scripts/test_listings.js
*/

function parseArgs(argv) {
  const args = {
    base: process.env.BASE || 'https://api-j7h3kbr6rq-el.a.run.app/api',
    pretty: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--base':
      case '-b': args.base = argv[++i] || args.base; break;
      case '--no-pretty': args.pretty = false; break;
      case '--help':
      case '-h':
        console.log('Usage: node scripts/test_listings.js [--base https://.../api] [--no-pretty]');
        process.exit(0);
      default:
        break;
    }
  }
  return args;
}

async function doPost(base, path, label, body) {
  console.log(`\n=== POST ${path} (${label}) ===`);
  const resp = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch {}
  console.log('STATUS:', resp.status);
  console.log('BODY:', json ? JSON.stringify(json, null, 2) : text);
  return { status: resp.status, body: json ?? text };
}

async function doGet(base, path) {
  console.log(`\n=== GET ${path} ===`);
  const resp = await fetch(`${base}/${path}`);
  const text = await resp.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch {}
  console.log('STATUS:', resp.status);
  console.log('BODY:', json ? JSON.stringify(json, null, 2) : text);
  return { status: resp.status, body: json ?? text };
}

async function main() {
  const { base } = parseArgs(process.argv.slice(2));
  console.log('Using BASE =', base);

  await doPost(base, 'listings', 'rent sample', {
    mode: 'rent',
    listing: {
      title: '2BHK Apartment in Kondapur',
      propertyType: 'Apartment',
      bedrooms: 2,
      bathrooms: 2,
      rent: 32000,
      deposit: 64000,
      maintenance: 2000,
      city: 'Hyderabad',
      locality: 'Kondapur',
      projectId: 'aparna-sarit',
      projectName: 'Aparna Sarit',
      address: 'Plot 12, Kondapur',
      facing: 'East',
      contactName: 'Ravi',
      contactPhone: '9876543210',
      notes: 'Available from next month'
    }
  });

  await doPost(base, 'listings', 'resale sample', {
    mode: 'resale',
    listing: {
      title: '3BHK in Madhapur',
      propertyType: 'Apartment',
      bedrooms: 3,
      bathrooms: 3,
      price: 12000000,
      maintenance: 3500,
      city: 'Hyderabad',
      locality: 'Madhapur',
      projectId: 'ramky-towers',
      projectName: 'Ramky Towers',
      address: 'Hitech City Rd, Madhapur',
      facing: 'West',
      contactName: 'Priya',
      contactPhone: '9123456789',
      notes: 'Negotiable'
    }
  });

  // Fetch with filters (may require composite indexes in Firestore)
  await doGet(base, 'listings?mode=rent&city=Hyderabad&locality=Kondapur&limit=10');
  await doGet(base, 'listings?mode=resale&city=Hyderabad&locality=Madhapur&projectId=ramky-towers&limit=10');

  // Fetch without filters (should work even without composite indexes)
  await doGet(base, 'listings?limit=10');
}

main().catch((e) => { console.error('Test failed:', e); process.exitCode = 1; });

