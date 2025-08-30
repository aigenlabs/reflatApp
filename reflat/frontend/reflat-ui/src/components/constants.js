
// Base API for unified router (GET + POST)
// Use relative /api path; Hosting rewrite routes to Cloud Function per environment
export const FIREBASE_FUNCTIONS_URL = process.env.REACT_APP_API_BASE || "/api";
export const FIREBASE_STORAGE_URL = "https://storage.googleapis.com/reflat.firebasestorage.app";
// Unified API routes
export const EXTRACT_URL = `${FIREBASE_FUNCTIONS_URL}/extract`;

// TEMP: Legacy Projects API (Cloud Run) used by ProjectList until migrated to /api
// Override via REACT_APP_LEGACY_API if needed
// (Legacy API base removed; all endpoints now served under /api via Hosting rewrites)
// export const OPENAI_API_KEY="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"
// client = OpenAI(
//   api_key="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"
// )
