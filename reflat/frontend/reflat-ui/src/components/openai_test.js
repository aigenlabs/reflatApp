// openai-client-demo.js
// Browser-side helper to call the backend extractor function securely.
import { EXTRACT_URL } from "./constants";

function normalizeNumber(v) {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : "";
}

function normalizeListing(src = {}, mode = "rent") {
  const isRent = mode === "rent";
  return {
    title: src.title || "",
    listingType: isRent ? "rent" : "resale",
    propertyType: src.propertyType || src.type || "Apartment",
    bedrooms: normalizeNumber(src.bedrooms),
    bathrooms: normalizeNumber(src.bathrooms),
    superBuiltupAreaSqft: normalizeNumber(src.superBuiltupAreaSqft || src.area || src.superBuiltupArea),
    carpetAreaSqft: normalizeNumber(src.carpetAreaSqft || src.carpetArea),
    furnishing: src.furnishing || "",
    rent: isRent ? normalizeNumber(src.rent || src.monthlyRent) : "",
    deposit: isRent ? normalizeNumber(src.deposit || src.securityDeposit) : "",
    maintenance: normalizeNumber(src.maintenance),
    price: !isRent ? normalizeNumber(src.price) : "",
    city: src.city || "",
    locality: src.locality || "",
    address: src.address || "",
    floor: src.floor || "",
    totalFloors: src.totalFloors || "",
    facing: src.facing || "",
    amenities: Array.isArray(src.amenities) ? src.amenities.join(", ") : (src.amenities || ""),
    parking: src.parking || "",
    availabilityDate: src.availabilityDate || "",
    contactName: src.contactName || "",
    contactPhone: src.contactPhone || "",
    contactEmail: src.contactEmail || "",
    notes: src.notes || "",
  };
}

/**
 * Extract listing details in the browser (demo only).
 * @param {string} message Full pasted listing text.
 * @param {"rent"|"resale"} mode
 * @returns {Promise<object>} normalized listing object
 */
export async function extractWithOpenAI(message, mode = "rent", { debug = false } = {}) {
  if (!message || typeof message !== "string") {
    throw new Error("message is required");
  }

  const url = debug ? `${EXTRACT_URL}?debug=true` : EXTRACT_URL;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(debug ? { "x-debug": "true" } : {}),
    },
    body: JSON.stringify({ mode, message }),
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Extractor HTTP ${resp.status} (invalid JSON): ${text?.slice(0, 200)}`);
  }

  if (!resp.ok) {
    const details = json?.debug ? ` | debug: ${JSON.stringify(json.debug)}` : "";
    throw new Error(`Extractor HTTP ${resp.status}: ${json?.error || "unknown error"}${details}`);
  }

  // Function returns { listing }
  if (json && json.listing) return json.listing;

  // Fallback: if backend ever returns raw fields, normalize them here
  return normalizeListing(json || {}, mode);
}
