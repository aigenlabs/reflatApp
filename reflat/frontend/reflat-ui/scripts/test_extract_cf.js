#!/usr/bin/env node
/*
 Simple Node CLI to call the deployed extractPropertyDetails function.
 - Defaults to Cloud Functions URL if EXTRACT_URL is not set
 - Supports Cloud Run service root or Cloud Functions URL
 - Can run a preflight OPTIONS and a POST with debug
 Usage examples:
   node scripts/test_extract_cf.js --message "2 BHK ... 35k rent" --mode rent --url https://asia-south1-reflat.cloudfunctions.net/extractPropertyDetails --debug
   EXTRACT_URL=https://extractpropertydetails-XXXXX-uc.a.run.app node scripts/test_extract_cf.js -m "3 BHK ... 1.1 Cr" -M resale
*/

function parseArgs(argv) {
  const args = { mode: 'rent', message: '', url: process.env.EXTRACT_URL || 'https://asia-south1-reflat.cloudfunctions.net/api/extract', debug: false, preflight: false, origin: 'http://localhost:3000' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--mode':
      case '-M':
        args.mode = (argv[++i] || 'rent').toLowerCase();
        break;
      case '--message':
      case '-m':
        args.message = argv[++i] || '';
        break;
      case '--url':
      case '-u':
        args.url = argv[++i] || args.url;
        break;
      case '--debug':
      case '-d':
        args.debug = true; break;
      case '--preflight':
      case '-p':
        args.preflight = true; break;
      case '--origin':
      case '-o':
        args.origin = argv[++i] || args.origin; break;
      case '--help':
      case '-h':
        console.log('Usage: node scripts/test_extract_cf.js [--mode rent|resale] [--message "text"] [--url URL] [--debug] [--preflight] [--origin http://localhost:3000]');
        process.exit(0);
      default:
        break;
    }
  }
  if (!args.message) {
    args.message = '2 BHK, semi-furnished, 1125 sqft in Kondapur, Hyderabad. Rent 35k, deposit 70k, maintenance 2k. East facing, 5th floor out of 12. Amenities gym, pool, lift.';
  }
  return args;
}

async function doPreflight(url, origin, requestedHeaders = 'content-type,x-debug') {
  const resp = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      'Origin': origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': requestedHeaders,
    }
  });
  const headers = Object.fromEntries([...resp.headers.entries()]);
  console.log('--- Preflight ---');
  console.log('STATUS:', resp.status);
  console.log('HEADERS:', JSON.stringify(headers, null, 2));
}

async function doPost(url, origin, mode, message, debug) {
  const full = debug ? (url.includes('?') ? url + '&debug=true' : url + '?debug=true') : url;
  const resp = await fetch(full, {
    method: 'POST',
    headers: {
      'Origin': origin,
      'Content-Type': 'application/json',
      ...(debug ? { 'x-debug': 'true' } : {}),
    },
    body: JSON.stringify({ mode, message })
  });
  const text = await resp.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const headers = Object.fromEntries([...resp.headers.entries()]);
  console.log('--- POST ---');
  console.log('STATUS:', resp.status);
  console.log('HEADERS:', JSON.stringify(headers, null, 2));
  console.log('BODY:', json ? JSON.stringify(json, null, 2) : (text || ''));
}

async function main() {
  const { mode, message, url, debug, preflight, origin } = parseArgs(process.argv.slice(2));
  // If URL looks like a Cloud Run service root, fine. If it is Cloud Functions URL, also fine.
  if (preflight) {
    await doPreflight(url, origin);
  }
  await doPost(url, origin, mode, message, debug);
}

main().catch((e) => { console.error('Test failed:', e); process.exitCode = 1; });
