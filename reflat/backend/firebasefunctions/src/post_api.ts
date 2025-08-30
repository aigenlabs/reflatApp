import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import cors from "cors";
import OpenAI from "openai";


const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const ADMIN_API_KEY = defineSecret("ADMIN_API_KEY");

if (!admin.apps.length){
    admin.initializeApp();
}

const db = admin.firestore();

function allowCors(req: any, res: any): boolean {
  const origin = req.headers.origin || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;              // caller will just `return;`
  }
  return false;
}

function normalizeNumber(value: unknown) {
  if (value == null || value === "") return "";
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : "";
}

function normalizeListing(src: any = {}, mode: "rent" | "resale" = "rent") {
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
    // pricing
    rent: isRent ? normalizeNumber(src.rent || src.monthlyRent) : "",
    deposit: isRent ? normalizeNumber(src.deposit || src.securityDeposit) : "",
    maintenance: normalizeNumber(src.maintenance),
    price: !isRent ? normalizeNumber(src.price) : "",
    // location
    city: src.city || "",
    locality: src.locality || "",
    address: src.address || "",
    floor: src.floor || "",
    totalFloors: src.totalFloors || "",
    facing: src.facing || "",
    amenities: Array.isArray(src.amenities) ? src.amenities.join(", ") : (src.amenities || ""),
    parking: src.parking || "",
    availabilityDate: src.availabilityDate || "",
    // contact
    contactName: src.contactName || "",
    contactPhone: src.contactPhone || "",
    contactEmail: src.contactEmail || "",
    // misc
    notes: src.notes || "",
  };
}

// function extractJsonFromText(text: string) {
//   try { return JSON.parse(text); } catch {}
//   const match = text.match(/\{[\s\S]*\}/);
//   if (match) {
//     try { return JSON.parse(match[0]); } catch {}
//   }
//   return null;
// }

const corsHandler = cors({
  origin: [
    "https://reflat.web.app",
    "https://reflat-staging.web.app",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "OPTIONS"],
  // Let cors middleware reflect whatever headers were requested, or allow a broader set
  allowedHeaders: ["Content-Type", "Authorization", "x-debug"],
});

type ExtractInput = { mode: "rent"|"resale"; message: string; debug?: boolean };

async function runExtract({ mode, message, debug }: ExtractInput) {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
  const isRent = mode === "rent";
  const system = [
    "You are a real estate listing parser. Extract key fields as a strict JSON object.",
    'NO prose. Only JSON. If a field is unknown, use "" (or [] for arrays).',
    'Use numbers for numeric fields. "amenities" may be array or comma-separated string.',
    "Fields:",
    "{",
    '  "title": string,',
    '  "propertyType": string,',
    '  "bedrooms": number|string,',
    '  "bathrooms": number|string,',
    '  "superBuiltupAreaSqft": number|string,',
    '  "carpetAreaSqft": number|string,',
    '  "furnishing": string,',
    isRent ? '  "rent": number|string,\n  "deposit": number|string,' : '  "price": number|string,',
    '  "maintenance": number|string,',
    '  "city": string,',
    '  "locality": string,',
    '  "address": string,',
    '  "floor": string|number,',
    '  "totalFloors": string|number,',
    '  "facing": string,',
    '  "amenities": string[] | string,',
    '  "parking": string,',
    '  "availabilityDate": string,',
    '  "contactName": string,',
    '  "contactPhone": string,',
    '  "contactEmail": string,',
    '  "notes": string',
    "}"
  ].join("\n");

  const user = [
    "SOURCE MESSAGE:",
    '"""',
    message,
    '"""',
    "",
    "Rules:",
    "- Output ONLY a JSON object (no markdown).",
    "- If you see currency like ₹ 35,000 or 35k, convert to a number (35000) where appropriate.",
    "- Amenities may be CSV or array; both acceptable.",
    `- If the listing is for ${mode} and price/rent is not found, leave as "".`,
  ].join("\n");

  logger.info("extractPropertyDetails calling OpenAI", { model: "gpt-4o-mini", mode });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
  if (debug) {
    try {
      logger.info("extractPropertyDetails OpenAI raw", {
        mode,
        rawPreview: raw.length > 4000 ? raw.slice(0, 4000) + "…" : raw,
        length: raw.length,
      });
    } catch {}
  }

  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch {}
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  };
  const parsed = tryParse(raw);
  if (!parsed) throw new Error("Extractor returned invalid JSON.");

  const num = (v: any) => {
    if (v == null || v === "") return "";
    const n = Number(String(v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : "";
  };
  const listing = {
    title: parsed.title || "",
    listingType: isRent ? "rent" : "resale",
    propertyType: parsed.propertyType || parsed.type || "Apartment",
    bedrooms: num(parsed.bedrooms),
    bathrooms: num(parsed.bathrooms),
    superBuiltupAreaSqft: num(parsed.superBuiltupAreaSqft || parsed.area || parsed.superBuiltupArea),
    carpetAreaSqft: num(parsed.carpetAreaSqft || parsed.carpetArea),
    furnishing: parsed.furnishing || "",
    rent: isRent ? num(parsed.rent || parsed.monthlyRent) : "",
    deposit: isRent ? num(parsed.deposit || parsed.securityDeposit) : "",
    maintenance: num(parsed.maintenance),
    price: !isRent ? num(parsed.price) : "",
    city: parsed.city || "",
    locality: parsed.locality || "",
    address: parsed.address || "",
    floor: parsed.floor || "",
    totalFloors: parsed.totalFloors || "",
    facing: parsed.facing || "",
    amenities: Array.isArray(parsed.amenities) ? parsed.amenities.join(", ") : (parsed.amenities || ""),
    parking: parsed.parking || "",
    availabilityDate: parsed.availabilityDate || "",
    contactName: parsed.contactName || "",
    contactPhone: parsed.contactPhone || "",
    contactEmail: parsed.contactEmail || "",
    notes: parsed.notes || "",
  };
  return { listing };
}

export const extractPropertyDetails = onRequest(
    {region: "asia-south1", secrets: [OPENAI_API_KEY]}, async (req, res): Promise<void> => {
  // CORS
  
//   const origin = req.headers.origin || "*";
//   res.set("Access-Control-Allow-Origin", origin);
//   res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
//   // Reflect requested headers if provided, else allow common ones
//   const reqHeaders = (req.headers as any)["access-control-request-headers"];
//   if (reqHeaders) {
//     res.set("Access-Control-Allow-Headers", String(reqHeaders));
//   } else {
//     res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-debug");
//   }
//   res.set("Access-Control-Max-Age", "3600");
//   res.set("Vary", "Origin");
//   if (req.method === "OPTIONS") { res.status(204).send(""); return; }
//   if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
corsHandler(req, res, async () => {
  try {
    const query = (req as any).query || {};
    const debug = String(query.debug || req.headers["x-debug"]) === "true";
    const { mode = "rent", message = "" } = req.body || {};
    if (!message || (mode !== "rent" && mode !== "resale")) {
      res.status(400).json({ error: "Invalid payload: { mode: 'rent'|'resale', message: string }" });
      return;
    }
    const result = await runExtract({ mode, message, debug });
    res.json(result);
    return;
  } catch (err: any) {
    console.error("extractPropertyDetails error:", err);
    if (String((req as any)?.query?.debug || req.headers["x-debug"]) === "true") {
      const safe = {
        name: err?.name,
        message: err?.message,
        status: err?.status,
        code: err?.code,
        data: err?.response?.data || err?.error || undefined,
      };
      res.status(500).json({ error: "Internal error while extracting listing.", debug: safe });
    } else {
      res.status(500).json({ error: "Internal error while extracting listing." });
    }
    return;
  }
})
});


export const createListing = onRequest(
  { region: "asia-south1" },
  async (req, res): Promise<void> => {
    if (allowCors(req, res)) { return; }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { mode = "rent", listing = {} } = req.body || {};
      if (mode !== "rent" && mode !== "resale") {
        res.status(400).json({ error: "mode must be 'rent' or 'resale'" });
        return;
      }

      const doc:any = normalizeListing(listing, mode);
      doc.mode = mode;
      doc.createdAt = admin.firestore.FieldValue.serverTimestamp();
      doc.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      doc.status = "draft";

      const ref = await db.collection("listings").add(doc);
      res.json({ ok: true, id: ref.id });
      return;
    } catch (err) {
      logger.error("createListing error", err as any);
      res.status(500).json({ error: "Failed to create listing." });
      return;
    }
  }
);

// Simple health endpoint to verify secret availability in deployed environments
export const health = onRequest(
  { region: "asia-south1", secrets: [OPENAI_API_KEY] },
  async (req, res): Promise<void> => {
    // Minimal CORS to enable quick curl/browser checks
    const origin = (req.headers && (req.headers as any).origin) || "*";
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Vary", "Origin");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

    let secretDefined = false;
    try {
      const v = OPENAI_API_KEY.value();
      secretDefined = !!(v && String(v).trim().length > 0);
    } catch {
      secretDefined = false;
    }

    const envPresent = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);

  res.json({
      ok: true,
      region: "asia-south1",
      openaiKey: {
        present: secretDefined || envPresent,
        sources: {
          defineSecret: secretDefined,
          env: envPresent,
        },
      },
    });
  }
);

// Delegated POST endpoints for the unified /api router
// Call this from the GET router when method === "POST"
export async function postApiHandler(req: any, res: any): Promise<void> {
  const urlPath: string = req.path || "/api";
  const pathNoBase = urlPath.replace(/^\/api\/?/, "");
  const parts = pathNoBase.split("/");
  const method = String(req.method || "").toUpperCase();
  if (method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const isAdminAuthorized = (): boolean => {
    try {
      const headerKey = (req.headers?.["x-admin-key"] || req.headers?.["x-admin-token"]) as string | undefined;
      const auth = (req.headers?.["authorization"] as string | undefined) || "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
      const provided = headerKey || bearer || "";
      const expected = ADMIN_API_KEY.value();
      return !!expected && provided === expected;
    } catch { return false; }
  };
  const isTrustedOrigin = (): boolean => {
    const origin = String(req.headers?.origin || "");
    return (
      origin === "http://localhost:3000" ||
      origin === "https://reflat.web.app" ||
      origin === "https://reflat-staging.web.app"
    );
  };

  // POST /api/admin/serviceable
  if (parts[0] === "admin" && parts[1] === "serviceable") {
    // Allow either admin key OR trusted origin (frontend admin page) to proceed
    if (!isAdminAuthorized() && !isTrustedOrigin()) { res.status(401).json({ error: "Unauthorized" }); return; }
    // Replace or merge full document
    if (parts.length === 2) {
      const merge = String((req as any).query?.merge || "false") === "true";
      const body = (req.body || {}) as any;
      if (typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.cities)) {
        res.status(400).json({ error: "Body must be an object with a 'cities' array" });
        return;
      }
      const docRef = db.collection("config").doc("serviceable");
      if (merge) {
        const snap = await docRef.get();
        const current = snap.exists ? (snap.data() as any) : {};
        const next = { ...current, ...body };
        await docRef.set(next, { merge: false });
        res.json({ ok: true, mode: "merged" });
        return;
      } else {
        await docRef.set(body, { merge: false });
        res.json({ ok: true, mode: "replaced" });
        return;
      }
    }
    // Append / update single property
    if (parts[2] === "add") {
      const b = req.body || {};
      const required = ["city", "locality", "builderId", "projectId"] as const;
      for (const k of required) { if (!b?.[k]) { res.status(400).json({ error: `Missing '${k}'` }); return; } }
      const modes: string[] = Array.isArray(b.modes) && b.modes.length ? b.modes : ["rent", "resale"];
      const entry = {
        builderId: String(b.builderId),
        builderName: b.builderName ? String(b.builderName) : String(b.builderId),
        projectId: String(b.projectId),
        projectName: b.projectName ? String(b.projectName) : String(b.projectId),
        modes,
        active: b.active !== false,
      };
      const docRef = db.collection("config").doc("serviceable");
      const snap = await docRef.get();
      const doc = snap.exists ? (snap.data() as any) : { cities: [] };
      doc.cities = Array.isArray(doc.cities) ? doc.cities : [];
      let cityObj = doc.cities.find((c: any) => c?.name === b.city);
      if (!cityObj) { cityObj = { name: b.city, localities: [] }; doc.cities.push(cityObj); }
      cityObj.localities = Array.isArray(cityObj.localities) ? cityObj.localities : [];
      let locObj = cityObj.localities.find((l: any) => l?.name === b.locality);
      if (!locObj) { locObj = { name: b.locality, properties: [] }; cityObj.localities.push(locObj); }
      locObj.properties = Array.isArray(locObj.properties) ? locObj.properties : [];
      const idx = locObj.properties.findIndex((p: any) => p.builderId === entry.builderId && p.projectId === entry.projectId);
      if (idx >= 0) locObj.properties[idx] = entry; else locObj.properties.push(entry);
      await docRef.set(doc, { merge: false });
      res.json({ ok: true });
      return;
    }
  }

  // POST /api/admin/serviceable_projects
  // Storage path: collection 'serviceable_projects', doc 'index'.
  // Replace/Merge body (nested index shape):
  // {
  //   updatedAt: string,
  //   cities: [
  //     { name: string, localities: [
  //       { name: string, properties: [
  //         { builderId: string, builderName?: string,
  //           projectDetails: [ { id: string, name: string, modes?: string[], active?: boolean } ] }
  //       ]}
  //     ]}
  //   ]
  // }
  // Add body (upsert one project detail):
  // { city, locality, builderId, builderName?, id, name, modes?: string[], active?: boolean }
  if (parts[0] === "admin" && parts[1] === "serviceable_projects") {
    if (!isAdminAuthorized() && !isTrustedOrigin()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const newRef = db.collection("serviceable_projects").doc("index");

    if (parts.length === 2) {
      const merge = String((req as any).query?.merge || "false") === "true";
      const body = (req.body || {}) as any;
      // Validate minimal nested shape
      if (!body || typeof body !== 'object' || !Array.isArray(body.cities)) {
        res.status(400).json({ error: "Body must be an object with a 'cities' array (nested index shape)" });
        return;
      }
      const nowIso = new Date().toISOString();
      body.updatedAt = body.updatedAt && typeof body.updatedAt === 'string' ? body.updatedAt : nowIso;

      const normalizeDoc = (doc: any) => {
        const out = { updatedAt: String(doc?.updatedAt || nowIso), cities: [] as any[] };
        const cities = Array.isArray(doc?.cities) ? doc.cities : [];
        for (const c of cities) {
          const city = String(c?.name || '');
          if (!city) continue;
          const locs = Array.isArray(c?.localities) ? c.localities : [];
          const locArr: any[] = [];
          for (const l of locs) {
            const locality = String(l?.name || '');
            if (!locality) continue;
            const props = Array.isArray(l?.properties) ? l.properties : [];
            const propArr: any[] = [];
            for (const p of props) {
              const builderId = String(p?.builderId || '');
              if (!builderId) continue;
              const builderName = p?.builderName ? String(p.builderName) : builderId;
              const details = Array.isArray(p?.projectDetails) ? p.projectDetails : [];
              const detArr: any[] = [];
              for (const d of details) {
                const id = String(d?.id || '');
                if (!id) continue;
                detArr.push({
                  id,
                  name: String(d?.name || id),
                  modes: Array.isArray(d?.modes) ? d.modes : ["rent","resale"],
                  active: d?.active === false ? false : true,
                });
              }
              propArr.push({ builderId, builderName, projectDetails: detArr });
            }
            locArr.push({ name: locality, properties: propArr });
          }
          out.cities.push({ name: city, localities: locArr });
        }
        return out;
      };

      if (!merge) {
        const next = normalizeDoc(body);
        await newRef.set(next, { merge: false });
        res.json({ ok: true, mode: "replaced", path: "serviceable_projects/index" });
        return;
      }

      // Merge: upsert cities/localities/properties/projectDetails
      const snap = await newRef.get();
      const current = snap.exists ? normalizeDoc(snap.data()) : { updatedAt: nowIso, cities: [] as any[] };
      const incoming = normalizeDoc(body);

      const byCity = new Map<string, any>();
      for (const c of current.cities) byCity.set(c.name, c);
      for (const c of incoming.cities) {
        const existingCity = byCity.get(c.name);
        if (!existingCity) { byCity.set(c.name, c); continue; }
        const byLoc = new Map<string, any>();
        for (const l of existingCity.localities) byLoc.set(l.name, l);
        for (const l of c.localities) {
          const existingLoc = byLoc.get(l.name);
          if (!existingLoc) { byLoc.set(l.name, l); continue; }
          const byBuilder = new Map<string, any>();
          for (const p of existingLoc.properties) byBuilder.set(p.builderId, p);
          for (const p of l.properties) {
            const existingProp = byBuilder.get(p.builderId);
            if (!existingProp) { byBuilder.set(p.builderId, p); continue; }
            // Merge projectDetails by id (upsert/overwrite)
            const byId = new Map<string, any>();
            for (const d of existingProp.projectDetails) byId.set(d.id, d);
            for (const d of p.projectDetails) byId.set(d.id, d);
            existingProp.builderName = p.builderName || existingProp.builderName || existingProp.builderId;
            existingProp.projectDetails = Array.from(byId.values());
            byBuilder.set(p.builderId, existingProp);
          }
          existingLoc.properties = Array.from(byBuilder.values());
          byLoc.set(l.name, existingLoc);
        }
        existingCity.localities = Array.from(byLoc.values());
        byCity.set(c.name, existingCity);
      }
      const merged = { updatedAt: incoming.updatedAt || nowIso, cities: Array.from(byCity.values()) };
      await newRef.set(merged, { merge: false });
      res.json({ ok: true, mode: "merged", path: "serviceable_projects/index" });
      return;
    }

    if (parts[2] === "add") {
      const b = (req.body || {}) as any;
      const required = ["city", "locality", "builderId", "id", "name"] as const;
      for (const k of required) { if (!b?.[k]) { res.status(400).json({ error: `Missing '${k}'` }); return; } }
      const city = String(b.city);
      const locality = String(b.locality);
      const builderId = String(b.builderId);
      const builderName = b.builderName ? String(b.builderName) : builderId;
      const newDetail = {
        id: String(b.id),
        name: String(b.name),
        modes: Array.isArray(b.modes) && b.modes.length ? b.modes.map((x: any) => String(x)) : ["rent","resale"],
        active: b.active === false ? false : true,
      };

      const snap = await newRef.get();
      const doc = (snap.exists ? (snap.data() as any) : { updatedAt: new Date().toISOString(), cities: [] });
      doc.updatedAt = new Date().toISOString();
      doc.cities = Array.isArray(doc.cities) ? doc.cities : [];
      let cityObj = doc.cities.find((c: any) => c?.name === city);
      if (!cityObj) { cityObj = { name: city, localities: [] }; doc.cities.push(cityObj); }
      cityObj.localities = Array.isArray(cityObj.localities) ? cityObj.localities : [];
      let locObj = cityObj.localities.find((l: any) => l?.name === locality);
      if (!locObj) { locObj = { name: locality, properties: [] }; cityObj.localities.push(locObj); }
      locObj.properties = Array.isArray(locObj.properties) ? locObj.properties : [];
      let propObj = locObj.properties.find((p: any) => p?.builderId === builderId);
      if (!propObj) { propObj = { builderId, builderName, projectDetails: [] }; locObj.properties.push(propObj); }
      propObj.builderName = builderName || propObj.builderName || builderId;
      propObj.projectDetails = Array.isArray(propObj.projectDetails) ? propObj.projectDetails : [];
      const idx = propObj.projectDetails.findIndex((d: any) => String(d?.id) === newDetail.id);
      if (idx >= 0) propObj.projectDetails[idx] = newDetail; else propObj.projectDetails.push(newDetail);

      await newRef.set(doc, { merge: false });
      res.json({ ok: true, path: "serviceable_projects/index" });
      return;
    }

    if (parts[2] === "migrate") {
      // Build nested index from config/serviceable and write to index location
      const svcRef = db.collection("config").doc("serviceable");
      const svcSnap = await svcRef.get();
      if (!svcSnap.exists) { res.status(404).json({ error: "No serviceable config found" }); return; }
      const svc = svcSnap.data() as any;
      const out = { updatedAt: new Date().toISOString(), cities: [] as any[] };
      const cities = Array.isArray(svc?.cities) ? svc.cities : [];
      for (const c of cities) {
        const city = c?.name; if (!city) continue;
        const locs = Array.isArray(c?.localities) ? c.localities : [];
        const locArr: any[] = [];
        for (const l of locs) {
          const locality = l?.name; if (!locality) continue;
          const props = Array.isArray(l?.properties) ? l.properties : [];
          const propArr: any[] = [];
          for (const p of props) {
            const builderId = String(p?.builderId || ''); if (!builderId) continue;
            const builderName = p?.builderName ? String(p.builderName) : builderId;
            const details = Array.isArray(p?.projectDetails) ? p.projectDetails : [];
            const detArr: any[] = [];
            for (const d of details) {
              const id = String(d?.id || ''); if (!id) continue;
              detArr.push({ id, name: String(d?.name || id), modes: Array.isArray(d?.modes) ? d.modes : ["rent","resale"], active: d?.active === false ? false : true });
            }
            propArr.push({ builderId, builderName, projectDetails: detArr });
          }
          locArr.push({ name: locality, properties: propArr });
        }
        out.cities.push({ name: city, localities: locArr });
      }

      await newRef.set(out, { merge: false });
      res.json({ ok: true, migrated: true, cities: out.cities.length });
      return;
    }
  }

  // POST /api/listings
  if (parts[0] === "listings") {
    const body = (req.body || {}) as any;
    const mode = String(body.mode || "rent").toLowerCase();
    if (mode !== "rent" && mode !== "resale") { res.status(400).json({ error: "mode must be 'rent' or 'resale'" }); return; }
    const src = (body.listing || {}) as any;
    const num = (v: any) => {
      if (v == null || v === "") return "";
      const n = Number(String(v).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : "";
    };
    const isRent = mode === "rent";
    const doc: any = {
      title: src.title || "",
      listingType: isRent ? "rent" : "resale",
      propertyType: src.propertyType || src.type || "Apartment",
      bedrooms: num(src.bedrooms),
      bathrooms: num(src.bathrooms),
      superBuiltupAreaSqft: num(src.superBuiltupAreaSqft || src.area || src.superBuiltupArea),
      carpetAreaSqft: num(src.carpetAreaSqft || src.carpetArea),
      furnishing: src.furnishing || "",
      rent: isRent ? num(src.rent || src.monthlyRent) : "",
      deposit: isRent ? num(src.deposit || src.securityDeposit) : "",
      maintenance: num(src.maintenance),
      price: !isRent ? num(src.price) : "",
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
      builderId: src.builderId || "",
      projectId: src.projectId || "",
      mode,
      status: "draft",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection("listings").add(doc);
    logger.info("listing created", { id: ref.id, mode, city: doc.city, locality: doc.locality, projectId: doc.projectId });
    res.json({ ok: true, id: ref.id });
    return;
  }

  // POST /api/extract
  if (parts[0] === "extract") {
    const body = (req.body || {}) as any;
    const mode = (body.mode || "rent").toLowerCase();
    const message = String(body.message || "");
    if (!message || (mode !== "rent" && mode !== "resale")) {
      res.status(400).json({ error: "Invalid payload: { mode: 'rent'|'resale', message: string }" });
      return;
    }
    // No auth required for extract during development
    try {
      const result = await runExtract({ mode, message, debug: String((req as any).query?.debug || req.headers?.["x-debug"]) === "true" });
      res.json(result);
      return;
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Extraction failed" });
      return;
    }
  }

  res.status(404).json({ error: "Unknown POST endpoint", path: req.path });
}
