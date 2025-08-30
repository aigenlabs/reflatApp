
// Base API for unified router (GET + POST)
// Use relative /api path; Hosting rewrite routes to Cloud Function per environment
export const FIREBASE_FUNCTIONS_URL = process.env.REACT_APP_API_BASE || "/api";
export const FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat.firebasestorage.app";
// Unified API routes
export const EXTRACT_URL = `${FIREBASE_FUNCTIONS_URL}/extract`;
