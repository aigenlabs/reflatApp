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
export const FIREBASE_FUNCTIONS_URL = "/api";

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