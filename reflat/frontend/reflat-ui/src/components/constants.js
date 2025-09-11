// // Base API for unified router (GET + POST)
// // Use relative /api path; Hosting rewrite routes to Cloud Function per environment
// export const FIREBASE_FUNCTIONS_URL = "https://asia-south1-reflat-staging.cloudfunctions.net";
// export const FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat-staging.appspot.com";

// export const API_BASE_URL = process.env.NODE_ENV === 'development'
//   ? `${FIREBASE_FUNCTIONS_URL}/api`
//   : '/api';

// // Unified API routes
// export const EXTRACT_URL = `${FIREBASE_FUNCTIONS_URL}/extract`;

// Base API for unified router (GET + POST)
// Use relative /api path; Hosting rewrite routes to Cloud Function per environment
// During local development we want to call the staging backend directly (no local API proxy).
// This prevents requests like http://localhost:3000/api/... and instead calls the remote functions.
let FIREBASE_FUNCTIONS_URL;
if (process.env.NODE_ENV === 'development') {
  // Staging API - use the provided Cloud Run service during local development
  // Ensure we include the /api router prefix used by the backend
  FIREBASE_FUNCTIONS_URL = 'https://api-tswrm7s7wq-el.a.run.app/api';
} else {
  // When hosted (staging/prod) use the relative /api path so Hosting rewrites to the Cloud Function
  FIREBASE_FUNCTIONS_URL = '/api';
}
export { FIREBASE_FUNCTIONS_URL };

// Set Firebase Storage URL based on environment
let FIREBASE_STORAGE_URL;
if (process.env.NODE_ENV === 'development') {
  // Local/dev: use staging bucket
  FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat-staging.firebasestorage.app";
} else if (window?.location?.hostname?.includes('staging')) {
  // Staging: use staging bucket
  FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat-staging.firebasestorage.app";
} else {
  // Production: use production bucket
  FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat.firebasestorage.app";
}

export { FIREBASE_STORAGE_URL };

// Unified API routes
export const EXTRACT_URL = `${FIREBASE_FUNCTIONS_URL}/extract`;