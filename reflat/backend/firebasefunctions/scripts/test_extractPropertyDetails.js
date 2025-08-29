/*
 Local test harness for extractPropertyDetails without network calls.
 It monkey-patches the `openai` module to return a canned JSON response
 and then invokes the compiled function with a mock req/res.
*/

const path = require('path');
const fs = require('fs');

// Ensure a dummy secret exists (the function calls OPENAI_API_KEY.value())
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

// Monkey-patch the 'openai' module before requiring our functions
const mockModulePath = require.resolve('openai');
const mocked = {
  __esModule: true,
  default: class MockOpenAI {
    constructor(_) {}
    chat = {
      completions: {
        create: async (_) => {
          const mockJson = {
            title: '2BHK in Kondapur',
            propertyType: 'Apartment',
            bedrooms: 2,
            bathrooms: 2,
            superBuiltupAreaSqft: 1125,
            carpetAreaSqft: 900,
            furnishing: 'Semi-furnished',
            rent: 35000,
            deposit: 70000,
            maintenance: 2000,
            city: 'Hyderabad',
            locality: 'Kondapur',
            address: '123, Main Road, Kondapur',
            floor: '5',
            totalFloors: '12',
            facing: 'East',
            amenities: ['Gym', 'Pool', 'Lift'],
            parking: '1 covered',
            availabilityDate: '2025-09-01',
            contactName: 'John Doe',
            contactPhone: '9876543210',
            contactEmail: 'john@example.com',
            notes: ''
          };
          return {
            choices: [
              { message: { content: JSON.stringify(mockJson) } }
            ]
          };
        }
      }
    }
  }
};

// Replace the module in the require cache
delete require.cache[mockModulePath];
require.cache[mockModulePath] = {
  id: mockModulePath,
  filename: mockModulePath,
  loaded: true,
  exports: mocked,
};

// Now require the compiled function
const { extractPropertyDetails } = require('../lib/post_api.js');

// Minimal mock of Express-like req/res objects
function createMockReq(body) {
  return {
    headers: { origin: 'http://localhost:3000' },
    method: 'POST',
    body,
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(field, value) { this.headers[field] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; finish(); },
    send(payload) { this.body = payload; finish(); },
  };
  function finish() {
    // Pretty print result
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
    console.log('BODY:', typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2));
  }
  return res;
}

function parseArgs(argv) {
  const args = { mode: 'rent', message: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode' || a === '-M') {
      args.mode = (argv[++i] || 'rent').toLowerCase();
    } else if (a === '--message' || a === '-m') {
      args.message = argv[++i] || '';
    } else if (a === '--file' || a === '-f') {
      const p = argv[++i];
      if (p && fs.existsSync(p)) {
        args.message = fs.readFileSync(p, 'utf8');
      } else {
        console.error('File not found:', p);
        process.exit(2);
      }
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node test_extractPropertyDetails.js [--mode rent|resale] [--message "text"] [--file path]');
      process.exit(0);
    }
  }
  if (!args.message) {
    args.message = '2 BHK, semi-furnished, 1125 sqft in Kondapur, Hyderabad. Rent 35k, deposit 70k, maintenance 2k. East facing, 5th floor out of 12. Amenities gym, pool, lift.';
  }
  if (args.mode !== 'rent' && args.mode !== 'resale') {
    console.error("Invalid --mode. Use 'rent' or 'resale'.");
    process.exit(2);
  }
  return args;
}

async function main() {
  const { mode, message } = parseArgs(process.argv.slice(2));
  const req = createMockReq({ mode, message });
  const res = createMockRes();

  // The onRequest handler is an async function(req, res)
  await extractPropertyDetails(req, res);
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exitCode = 1;
});
