import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import cors from "cors";
import { postApiHandler } from "./post_api";
import * as path from 'path';


if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ADMIN_API_KEY = defineSecret("ADMIN_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

interface ProjectLocation {
  city?: string;
  location?: string;
  [key: string]: unknown;
}

const corsHandler = cors({
  origin: [
    "https://reflat.web.app",
    "https://reflat-staging.web.app",
    "https://reflat-ui-staging.web.app",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "OPTIONS"],
  // Let cors middleware reflect whatever headers were requested, or allow a broader set
  allowedHeaders: ["Content-Type", "Authorization", "x-debug"],
});

// Include OPENAI_API_KEY here because POST /api/extract runs under this function
export const api = onRequest({ secrets: [ADMIN_API_KEY, OPENAI_API_KEY] }, (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      const urlPath = req.path;
      const method = req.method.toUpperCase();
      logger.info("api request", { method, path: urlPath, query: req.query ? Object.keys(req.query) : [] });
      if (method === "HEAD") { res.status(204).send(""); return; }
      if (method === "POST") {
        await postApiHandler(req, res);
        return;
      }

      if (method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Use only the path part for routing (strip query string if present)
      const cleanPath = urlPath.replace(/^\/api\/?/, "").split("?")[0];
      const parts = cleanPath.split("/");

      // TODO(AppCheck): After development, require Firebase App Check token on sensitive reads.
      // Enable by implementing verification in this helper and invoking it before protected routes.
      const requireAppCheck = async (): Promise<boolean> => {
        // Example (when enabling):
        // const token = (req.headers['x-firebase-appcheck'] as string) || '';
        // try { await admin.appCheck().verifyToken(token); return true; }
        // catch { res.status(401).json({ error: 'AppCheck required' }); return false; }
        return true; // no-op during development
      };
      // Mark placeholder as used to satisfy TS noUnusedLocals during development
      void requireAppCheck;

      // All POST paths handled by postApiHandler above

      // -----------------------------
      // GET /api/serviceable?mode=rent|resale
      // Reads Firestore doc config/serviceable and returns structured filters.
      // Expected doc shape:
      // {
      //   cities: [
      //     { name: "Hyderabad", localities: [
      //       { name: "Kondapur", properties: [
      //         { builderId: "aparna", builderName: "Aparna", projectId: "sarit", projectName: "Aparna Sarit", modes: ["rent","resale"], active: true }
      //       ]}
      //     ]}
      //   ]
      // }
      // -----------------------------
      if (parts[0] === "serviceable") {
        // Removed unused modeQ and filterMode variables

        // const docRef = db.collection("config").doc("serviceable");
        const docRef = db.collection("serviceable_projects").doc("index");

        const snap = await docRef.get();
        if (!snap.exists) {
          res.status(404).json({ error: "No serviceable config found" });
          return;
        }
        const doc = snap.data() as any;
         logger.info("serviceable_projects response (source=index)", {
          cities: Array.isArray(doc?.cities) ? doc.cities.length : 0,
        });
        res.json(doc);
        return;
      }
      // -----------------------------
      // GET /api/listings?mode=&city=&locality=&projectId=&limit=
      // Returns listings filtered by provided fields, newest first
      // -----------------------------
      if (parts[0] === "listings") {
        const modeQ = (req.query?.mode as string | undefined)?.toLowerCase();
        const cityQ = (req.query?.city as string | undefined) || undefined;
        const localityQ = (req.query?.locality as string | undefined) || undefined;
        const projectIdQ = (req.query?.projectId as string | undefined) || undefined;
        const limitQ = Math.max(1, Math.min(200, Number(req.query?.limit ?? 50) || 50));

        let base: FirebaseFirestore.Query = db.collection("listings");
        if (modeQ === "rent" || modeQ === "resale") base = base.where("mode", "==", modeQ);
        if (cityQ) base = base.where("city", "==", cityQ);
        if (localityQ) base = base.where("locality", "==", localityQ);
        if (projectIdQ) base = base.where("projectId", "==", projectIdQ);

        try {
          const snap = await base.orderBy("createdAt", "desc").limit(limitQ).get();
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          logger.info("listings response", { count: items.length, ordered: true });
          res.json({ items, ordered: true });
          return;
        } catch (e: any) {
          const msg = String(e?.message || e || "");
          const code = String((e && (e.code || e.status)) || "");
          const needsIndex = /FAILED_PRECONDITION/i.test(code) || /requires an index/i.test(msg);
          if (!needsIndex) throw e;
          const snap2 = await base.limit(limitQ).get();
          const items2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
          logger.warn("listings response without order", { count: items2.length });
          res.json({ items: items2, ordered: false, note: "Returned without createdAt ordering due to missing index." });
          return;
        }
      }

      // -----------------------------
      // GET /api/project_data/:builderId/:projectId
      // -----------------------------
      if (parts[0] === "project_data" && parts.length >= 3) {
        // TODO(AppCheck): uncomment to enforce later
        // if (!(await requireAppCheck())) return;
        const builderId = parts[1];
        const projectId = parts[2];

        const projRef = db
          .collection("builders")
          .doc(builderId)
          .collection("projects")
          .doc(projectId);

        const snap = await projRef.get();
        if (!snap.exists) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        logger.info("project_data response", { builderId, projectId });
        res.json(snap.data());
        return;
      }

      // -----------------------------
      // GET /api/project_details/:builderId/:projectId
      // Returns a normalized payload containing project doc and related assets
      // - project: original project document
      // - files: common file names (banner, brochure, logos)
      // - photos, layouts, videos, floor_plans: arrays from subcollections (if present)
      // The frontend will use FIREBASE_STORAGE_URL to construct full URLs for files.
      // -----------------------------
      if (parts[0] === "project_details" && parts.length >= 3) {
        const builderId = parts[1];
        const projectId = parts[2];

        // --- Step 1: Fetch main project document from Firestore ---
        const projRef = db
          .collection("builders")
          .doc(builderId)
          .collection("projects")
          .doc(projectId);

        const snap = await projRef.get();
        if (!snap.exists) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        const projectData = snap.data() as any || {};

        // --- Step 2: Build files & asset lists from Firestore project document and its subcollections ---
        // We intentionally do NOT rely on any GCS manifest here — prefer the canonical Firestore data.
        let photos: any[] = [];
        let layouts: any[] = [];
        let videos: any[] = [];
        let floor_plans: any[] = [];
        let files: Record<string, string | null> = {};

        logger.info(`Populating project details from Firestore for ${builderId}/${projectId}`);

        // Helper to read a subcollection (if present)
        async function readSubcollection(name: string) {
          try {
            const s = await projRef.collection(name).orderBy("createdAt", "desc").get();
            return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          } catch (e) {
            try {
              const s = await projRef.collection(name).get();
              return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            } catch (err) {
              return [];
            }
          }
        }

        [photos, layouts, videos, floor_plans] = await Promise.all([
          readSubcollection("photos"),
          readSubcollection("layouts"),
          readSubcollection("videos"),
          readSubcollection("floor_plans"),
        ]);

        // Helper to normalize filenames similar to the frontend/upload logic
        const normalizeName = (name: string) => {
          if (!name) return name;
          return name.replace(/\\+/g, '/').split('/').map(s => String(s || '').trim().replace(/\s+/g, '_')).join('/');
        };
        
        const ensureObjectPath = (folder: string, raw: any) => {
          if (!raw) return null;
          // Only accept explicit string values or explicit file/path-like fields on objects.
          // Do NOT treat an object's `name` or the whole object as a filename — that converts human-readable
          // names into pseudo-paths and breaks upstream consumers. If no explicit file/path is present, return null.
          let candidate: string | null = null;
          if (typeof raw === 'string') candidate = raw;
          else if (raw && typeof raw === 'object') candidate = (raw.path || raw.file || raw.file_name || raw.filename) || null;
          if (!candidate) return null;

          // Try to decode percent-encoded values (repeat a couple times for double-encoding)
          try {
            for (let i = 0; i < 3; i++) {
              const dec = decodeURIComponent(String(candidate));
              if (dec === candidate) break;
              candidate = dec;
            }
          } catch (e) { /* ignore */ }

          candidate = String(candidate).trim();

          // If candidate is an HTTP(S) URL, only return it unchanged when it's an external URL
          // (e.g. YouTube, Google Maps). If it is a Google Cloud Storage / Firebase Storage
          // URL (storage.googleapis.com or firebasestorage.googleapis.com or containing '/o/'),
          // fall through and extract the object path below so we can normalize and re-sign it.
          if (/^https?:\/\//i.test(candidate)) {
            const isStorageUrl = candidate.includes('storage.googleapis.com') || candidate.includes('firebasestorage.googleapis.com') || /\/o\//.test(candidate);
            if (!isStorageUrl) {
              return candidate; // external URL we should not touch
            }
            // Otherwise fall through to extraction logic below to parse the object path
          }

          // If candidate is a GS or Firebase/Storage URL, try to extract the object path
          // gs://bucket/path
          const gsMatch = candidate.match(/^gs:\/\/[^\/]+\/(.+)$/i);
          if (gsMatch) {
            candidate = gsMatch[1];
          }

          // firebase storage v0 URLs often contain '/o/<encoded-path>' portion
          const oMatch = candidate.match(/\/o\/([^?]+)/);
          if (oMatch) {
            try { candidate = decodeURIComponent(oMatch[1]); } catch (e) { candidate = oMatch[1]; }
          } else if ((candidate.includes('storage.googleapis.com') || candidate.includes('firebasestorage.googleapis.com'))) {
            // Try to extract path after hostname
            const m = candidate.match(/^https?:\/\/[^\/]+\/(.+?)(?:[?#].*)?$/i);
            if (m) {
              try { candidate = decodeURIComponent(m[1]); } catch (e) { candidate = m[1]; }
            }
          }

          const normalized = normalizeName(candidate);
          const parts = normalized.split('/').filter(Boolean);

          // If the stored value already includes a builder/project prefix (e.g. 'myhome/akrida/photos/1.jpg'), keep it
          if (parts.length >= 4 && (parts[0] === builderId || parts[1] === projectId)) {
            return normalized;
          }
          // If the stored value already starts with the folder (e.g. 'banners/mob_banner.png'), strip the leading folder
          if (parts.length >= 2 && parts[0] === folder) {
            const filename = parts.slice(1).join('/');
            return `${builderId}/${projectId}/${folder}/${filename}`;
          }
          // Otherwise construct the canonical object path: <builderId>/<projectId>/<folder>/<filename>
          return `${builderId}/${projectId}/${folder}/${normalized}`;
        };

        // Normalize subcollection entries to include a `path` field that is the object path within the bucket.
        // Only derive `path` from explicit file/path fields; do not fallback to `name` or the whole object.
        photos = (photos || []).map((p: any) => ({ id: p.id, ...p, path: ensureObjectPath('photos', p.path || p.file || p.file_name || p.filename) }));
        layouts = (layouts || []).map((p: any) => ({ id: p.id, ...p, path: ensureObjectPath('layouts', p.path || p.file || p.file_name || p.filename) }));
        floor_plans = (floor_plans || []).map((p: any) => ({ id: p.id, ...p, path: ensureObjectPath('floor_plans', p.path || p.file || p.file_name || p.filename) }));
        videos = (videos || []).map((p: any) => ({ id: p.id, ...p, path: ensureObjectPath('videos', p.path || p.file || p.file_name || p.filename) }));

        // If project document itself contains these arrays (some scrapers store inline), merge them in when subcollections are empty
        const ingestArray = (arrKey: string, folder: string) => {
          const arr = (projectData && Array.isArray(projectData[arrKey])) ? projectData[arrKey] : null;
          if (!arr || !arr.length) return [];
          return arr.map((it: any, idx: number) => {
            // When ingesting inline arrays, accept string entries or explicit file/path fields on objects.
            const raw = (typeof it === 'string') ? it : (it && typeof it === 'object' ? (it.path || it.file || it.file_name || it.filename) : null);
            return { id: it && it.id ? it.id : `inline-${arrKey}-${idx}`, ...(typeof it === 'object' ? it : {}), path: ensureObjectPath(folder, raw) };
          });
        };

        if ((!photos || photos.length === 0) && Array.isArray(projectData?.photos)) {
          photos = ingestArray('photos', 'photos');
        }
        if ((!layouts || layouts.length === 0) && Array.isArray(projectData?.layouts)) {
          layouts = ingestArray('layouts', 'layouts');
        }
        if ((!floor_plans || floor_plans.length === 0) && Array.isArray(projectData?.floor_plans)) {
          floor_plans = ingestArray('floor_plans', 'floor_plans');
        }
        if ((!videos || videos.length === 0) && Array.isArray(projectData?.videos)) {
          videos = ingestArray('videos', 'videos');
        }

        // Amenities may be an array on the project document; normalize similarly and expose top-level `amenities`
        let amenities: any[] = [];
        if (Array.isArray(projectData?.amenities)) {
          amenities = projectData.amenities.map((a: any, idx: number) => ({ id: a && a.id ? a.id : `inline-amenity-${idx}`, ...a, path: ensureObjectPath('amenities', a && typeof a === 'object' ? (a.path || a.file || a.file_name || a.filename) : (typeof a === 'string' ? a : null)) }));
        }

        // Logos array present on some projects
        let logos: any[] = [];
        if (Array.isArray(projectData?.logos) && projectData.logos.length) {
          logos = projectData.logos.map((l: any, idx: number) => ({ id: l && l.id ? l.id : `inline-logo-${idx}`, ...l, path: ensureObjectPath('logos', l && typeof l === 'object' ? (l.path || l.file || l.file_name || l.filename) : (typeof l === 'string' ? l : null)) }));
        }

         // Build the common files mapping from fields on the project document. Keep multiple possible field names for compatibility.
        // Extract banners from projectData (some scrapers provide an array of banner objects)
        const banners: any[] = Array.isArray(projectData?.banners) ? projectData.banners.map((b: any, idx: number) => {
          const raw = (typeof b === 'string') ? b : (b && typeof b === 'object' ? (b.path || b.file || b.file_name || b.filename) : null);
          return { id: b && b.id ? b.id : `inline-banner-${idx}`, ...(typeof b === 'object' ? b : {}), path: ensureObjectPath('banners', raw), filename: (b && (b.filename || b.file_name)) || (typeof raw === 'string' ? raw.split('/').pop() : null) };
        }) : [];

        // Set files.banner to the first banner path (if any) for backward compatibility, and include brochure/logos as before
        files = {
          banner: (banners.length > 0) ? banners[0].path : ensureObjectPath('banners', projectData?.banner_file || projectData?.banner),
          brochure: ensureObjectPath('brochures', projectData?.brochure_file || projectData?.brochure),
          builder_logo: ensureObjectPath('logos', projectData?.builder_logo_file || projectData?.logo_file || projectData?.builder_logo || projectData?.logo),
          project_logo: ensureObjectPath('logos', projectData?.project_logo_file || projectData?.project_logo),
          youtube_id: projectData?.youtube_id || projectData?.youtube || null,
          website: projectData?.project_website || projectData?.website || null,
        };

         const result = {
           project: projectData,
           files,
           banners,
           photos,
           layouts,
           videos,
           floor_plans,
           amenities,
           logos,
         };

        // --- normalize response shape to match scraper output ---
        (function normalizeApiResult() {
          try {
            const mediaFolders = ['logos','floor_plans','brochures','banners','photos','layouts','news','amenities','documents'];
            for (const f of mediaFolders) {
              if (!Object.prototype.hasOwnProperty.call(result, f) || !Array.isArray((result as any)[f])) {
                // try to fall back to projectData variants (some older records stored media under different keys)
                const candidate = projectData && (projectData[f] || projectData[`${f}`] || projectData[`${f}_files`] || projectData[`${f}_file`]);
                if (Array.isArray(candidate)) {
                  (result as any)[f] = candidate.slice();
                } else {
                  (result as any)[f] = [];
                }
              }
            }

            // Ensure files object exists and contains canonical keys (banner, brochure, builder_logo, project_logo)
            (result as any).files = (result as any).files || {};
            (result as any).files.banner = (result as any).files.banner || ensureObjectPath('banners', projectData?.banner_file || projectData?.banner);
            (result as any).files.brochure = (result as any).files.brochure || ensureObjectPath('brochures', projectData?.brochure_file || projectData?.brochure);
            (result as any).files.builder_logo = (result as any).files.builder_logo || ensureObjectPath('logos', projectData?.builder_logo_file || projectData?.logo_file || projectData?.builder_logo || projectData?.logo);
            (result as any).files.project_logo = (result as any).files.project_logo || ensureObjectPath('logos', projectData?.project_logo_file || projectData?.project_logo);

            // Simplify amenities into stable { name, icon } entries. Accept strings, objects, or file-path strings.
            if (Array.isArray((result as any).amenities)) {
              (result as any).amenities = (result as any).amenities.map((a: any) => {
                if (!a) return null;
                if (typeof a === 'string') {
                  // if string looks like a path, use as icon; otherwise as name
                  const looksLikePath = a.includes('/') || /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(a);
                  const name = looksLikePath ? path.basename(a).replace(/[-_]+/g, ' ').replace(/\.[^.]+$/, '') : a;
                  // compute canonical storage path for icon when possible
                  const rawIcon = looksLikePath ? a.replace(/^\/*/, '') : null;
                  const iconPath = rawIcon ? ensureObjectPath('amenities', rawIcon) : null;
                  return { name, icon: iconPath };
                }
                if (typeof a === 'object') {
                  const name = a.name || a.key || a.title || a.label || '';
                  const rawIcon = a.icon || a.file || a.path || a.filename || null;
                  const iconPath = (rawIcon && typeof rawIcon === 'string') ? ensureObjectPath('amenities', String(rawIcon).replace(/^\/*/, '')) : null;
                  return { name: String(name).trim(), icon: iconPath };
                }
                return null;
              }).filter(Boolean);
            }

          } catch (e) {
            // non-fatal: keep original result shape if normalization fails
            logger && logger.warn && logger.warn('normalizeApiResult failed', e && (e as Error).message);
          }
        })();

         logger.info("project_details response", { builderId, projectId, source: 'firestore', photos: photos.length, layouts: layouts.length });
         res.json(result);
         return;
       }

      // -----------------------------
      // GET /api/listing/:id
      // Fetch a single listing by id
      // -----------------------------
      if (parts[0] === "listing" && parts.length >= 2) {
        const id = parts[1];
        const docRef = db.collection("listings").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) { res.status(404).json({ error: "Listing not found" }); return; }
        res.json({ id: snap.id, ...snap.data() });
        return;
      }

      // -----------------------------
      // GET /api/builders
      // -----------------------------
      if (parts[0] === "builders") {
        const snapshot = await db.collection("builders").get();

        const builders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        logger.info("builders response", { count: builders.length });
        res.json(builders);
        return;
      }

      // -----------------------------
      // GET /api/location_project_data?city=...&location=...&builder=...
      // Returns project location data filtered by query params (city, location, builder)
      // -----------------------------
      if (parts[0] === "location_project_data" && parts.length === 1) {
        const city = (req.query?.city as string | undefined) || undefined;
        const location = (req.query?.location as string | undefined) || undefined;
        const builder = (req.query?.builder as string | undefined) || undefined;

        const docRef = db.collection("builders").doc("locations");
        const snap = await docRef.get();

        if (!snap.exists) {
          res.status(404).json({ error: "No project locations found" });
          return;
        }
        const data = snap.data();
        let projects = (data?.locations || []) as ProjectLocation[];

        // Filter by city/location if provided
        if (city) {
          projects = projects.filter((p) => p.city?.toLowerCase() === city.toLowerCase());
        }
        if (location) {
          projects = projects.filter((p) => p.location?.toLowerCase() === location.toLowerCase());
        }
        if (builder) {
          projects = projects.filter((p) => {
            if (!Array.isArray(p.projects)) return false;
            return p.projects.some((proj: any) => String(proj.builder_id || "").toLowerCase() === builder.toLowerCase());
          });
        }

        // Flatten all matching project references
        const allRefs = projects.flatMap((p) => Array.isArray(p.projects) ? p.projects.map(proj => ({
          ...proj,
          city: p.city,
          location: p.location
        })) : []);

        if (!allRefs.length) {
          res.status(404).json({ error: "No matching project(s)" });
          return;
        }

        // Fetch full details for each project
        const details = await Promise.all(
          allRefs.map((ref) =>
            db.collection("builders")
              .doc(ref.builder_id)
              .collection("projects")
              .doc(ref.project_id)
              .get()
              .then((snap) => snap.exists ? { id: snap.id, ...snap.data() } : null)
              .catch(() => null)
          )
        );
        const valid = details.filter(Boolean);
        res.json(valid);
        return;
      }

      // -----------------------------
      // GET /api/location_project_data/:city/:location
      // Returns project location data for a specific city/location (path params)
      // -----------------------------
      if (parts[0] === "location_project_data" && parts.length >= 3) {
        const city = parts[1];
        const location = parts[2];

        const docRef = db.collection("builders").doc("locations");
        const snap = await docRef.get();

        if (!snap.exists) {
          res.status(404).json({ error: "No project locations found" });
          return;
        }
        const data = snap.data();
        const projects = (data?.locations || []) as ProjectLocation[];

        const project = projects.find((p) => {
          const cityMatch = !city || p.city?.toLowerCase() === city.toLowerCase();
          const locationMatch = !location || p.location?.toLowerCase() === location.toLowerCase();
          return cityMatch && locationMatch;
        });

        if (!project) {
          res.status(404).json({ error: "No matching project" });
          return;
        }

        logger.info("location_project_data (path) response", { city, location, hasProjects: !!project });
        res.json(project);
        return;
      }

      // -----------------------------
      // GET /api/builder_projects_list/:builderId
      // -----------------------------
      if (parts[0] === "builder_projects_list" && parts.length >= 2) {
        // TODO(AppCheck): uncomment to enforce later
        // if (!(await requireAppCheck())) return;
        const builderId = parts[1];
        const prjCollectionRef = db
          .collection("builders")
          .doc(builderId)
          .collection("projects");

        const snapshot = await prjCollectionRef.get();

        if (snapshot.empty) {
          res.status(404).json({ error: "No projects found for builder" });
          return;
        }

        const builderProjects = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        res.json(builderProjects);
        return;
      }

        // -----------------------------
  // GET /api/locations (unique cities, locations, builder_ids)
  // -----------------------------
  if (parts[0] === "locations") {
    // Public (non-sensitive) read; keep open. Add caching later if needed.
    const docRef = db.collection("builders").doc("locations");
    const snap = await docRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: "No locations found" });
      return;
    }

    const data = snap.data();
    const locations = (data?.locations || []) as {
      city: string;
      location: string;
      projects: { builder_id: string }[];
    }[];

    const citySet = new Set<string>();
    const locationSet = new Set<string>();
    const builderSet = new Set<string>();

    for (const entry of locations) {
      if (entry.city) citySet.add(entry.city);
      if (entry.location) locationSet.add(entry.location);
      for (const p of entry.projects || []) {
        if (p.builder_id) builderSet.add(p.builder_id);
      }
    }

    const result = {
      cities: Array.from(citySet),
      locations: Array.from(locationSet),
      builder_ids: Array.from(builderSet),
    };

    logger.info("locations response", { cities: result.cities.length, locations: result.locations.length });
    res.json(result);
    return;
  }

      // -----------------------------
      // GET /api/extract
      // -----------------------------
      if (parts[0] === "extract") {
        // TODO: implement extract API
        res.status(501).json({ error: "Not implemented" });
        return;
      }

      // -----------------------------
      // GET /api/signed_url?folder=photos&builderId=myhome&projectId=akrida&file=4.jpg
      // -----------------------------
      if (parts[0] === "signed_url") {
        if (allowCors(req, res)) return;
        if (req.method !== "GET") {
          res.status(405).json({ error: "Method not allowed" });
          return;
        }
        try {
          const folder = String(req.query.folder || "").trim();
          const builderId = String(req.query.builderId || "").trim();
          const projectId = String(req.query.projectId || "").trim();
          let file = String(req.query.file || "").trim();
          if (!folder || !builderId || !projectId || !file) {
            res.status(400).json({ error: "Missing required query params: folder, builderId, projectId, file" });
            return;
          }

          // Robust decode for percent-encoded values (handle double-encoding)
          try {
            for (let i = 0; i < 3; i++) {
              const dec = decodeURIComponent(file);
              if (dec === file) break;
              file = dec;
            }
          } catch (e) { /* ignore */ }

          // If caller passed an absolute HTTP(S) URL as `file`, attempt to extract a GCS object path
          // for storage URLs so we can generate a canonical signed URL. For other external URLs
          // (YouTube, maps, etc.) return them unchanged.
          if (/^https?:\/\//i.test(file)) {
            let extracted: string | null = null;
            // Try to extract '/o/<encoded-path>' style (firebase storage object URL)
            const oMatch = String(file).match(/\/o\/([^?]+)/);
            if (oMatch) {
              try { extracted = decodeURIComponent(oMatch[1]); } catch (e) { extracted = oMatch[1]; }
            } else if ((file.includes('storage.googleapis.com') || file.includes('firebasestorage.googleapis.com'))) {
              // storage.googleapis.com/<bucket>/<object...>
              const m = String(file).match(/^https?:\/\/[^\/]+\/(.+?)(?:[?#].*)?$/i);
              if (m) {
                try { extracted = decodeURIComponent(m[1]); } catch (e) { extracted = m[1]; }
              }
            }

            if (extracted) {
              // If the extracted path includes a leading bucket segment (e.g. '<bucket>/...'),
              // strip the bucket so downstream normalization produces a builder/project path.
              const parts = extracted.split('/').filter(Boolean);
              if (parts.length >= 4 && parts[0] && parts[0].includes('.app')) {
                // crude bucket-looking segment (e.g. 'reflat-staging.firebasestorage.app'), strip it
                extracted = parts.slice(1).join('/');
              }
              // Use the extracted object path as the file value and continue to probing logic below
              file = extracted;
            } else {
              // Not a storage URL we can parse — return external URL unchanged
              res.json({ url: file });
              return;
            }
          }

          // Normalize path
          const normalize = (name: string) => name.replace(/\\+/g, '/').split('/').map(s => s.trim().replace(/\s+/g, '_')).join('/');
          const filename = normalize(file);

          const partsFile = filename.split('/').filter(Boolean);

          const knownFolders = new Set([
            'photos','layouts','videos','floor_plans','floorplans','floor-plans','banners','brochures','logos','amenities'
          ]);

          const bucket = admin.storage().bucket();

          // Build candidate object paths to try (be permissive to handle various input formats)
          const candidates: string[] = [];

          // If file already looks like a full object path, try it first
          if (partsFile.length >= 4 && (partsFile[0] === builderId || partsFile[1] === projectId)) {
            candidates.push(filename);
          }
          // If file starts with a folder (e.g. 'banners/...') or the caller passed same folder, try builder/project + file
          if (partsFile.length >= 2 && (partsFile[0] === folder || knownFolders.has(partsFile[0]))) {
            candidates.push(`${builderId}/${projectId}/${filename}`);
          }

          // Common constructions to try
          candidates.push(`${builderId}/${projectId}/${folder}/${filename}`); // expected
          candidates.push(`${projectId}/${builderId}/${folder}/${filename}`); // swapped including builder domain
          // Try common case where frontend may have passed builder/project swapped: projectId as builder and folder as project
          candidates.push(`${projectId}/${folder}/${filename}`);
          // Also try folder as top-level (when folder actually contains the project folder)
          candidates.push(`${folder}/${filename}`);
          candidates.push(`${builderId}/${projectId}/${filename}`); // if filename already contains folder segment
          candidates.push(filename); // raw filename as last resort

          // Deduplicate
          const uniqueCandidates = Array.from(new Set(candidates));

          let foundPath: string | null = null;
          const tried: string[] = [];
          for (const p of uniqueCandidates) {
            if (!p) continue;
            tried.push(p);
            try {
              const [exists] = await bucket.file(p).exists();
              if (exists) { foundPath = p; break; }
            } catch (e) {
              // ignore and continue trying other candidates
            }
          }

          // If not found by probing common candidate paths, try a GCS prefix-list fallback.
          if (!foundPath) {
            try {
              // Try listing the expected folder prefix and match by filename token (case-insensitive)
              const prefix = `${builderId}/${projectId}/${folder}/`;
              const [filesList] = await bucket.getFiles({ prefix, maxResults: 200 });
              const filenameLower = (filename || '').toLowerCase();

              if (filenameLower) {
                // Prefer exact basename matches, then startsWith, then includes
                let match = filesList.find(f => {
                  const base = (f.name.split('/').pop() || '').toLowerCase();
                  return base === filenameLower;
                });
                if (!match) {
                  match = filesList.find(f => {
                    const base = (f.name.split('/').pop() || '').toLowerCase();
                    return base.startsWith(filenameLower) || base.includes(filenameLower);
                  });
                }
                if (match) foundPath = match.name;
              }

              // If still not found, attempt tokenized fuzzy matching to handle cases where
              // stored filenames include a hash prefix or safe-sanitized suffix (e.g. "3245abcd1234-ampthitheatre.png").
              if (!foundPath && filesList && filename) {
                try {
                  const normalizeTokens = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
                  const queryNorm = filenameLower.replace(/\.[^/.]+$/, '');
                  const queryTokens = new Set(normalizeTokens(queryNorm));
                  let best = null as any;
                  let bestScore = 0;
                  for (const f of filesList) {
                    const base = (f.name.split('/').pop() || '');
                    let baseNoExt = base.replace(/\.[^/.]+$/, '').toLowerCase();
                    // strip common hex-hash prefixes like '3245dcd5caf1-' or '3245dcd5caf1_'
                    baseNoExt = baseNoExt.replace(/^[0-9a-f]{8,}[-_]?/i, '');
                    const tokens = normalizeTokens(baseNoExt).filter(Boolean);
                    if (tokens.length === 0) continue;
                    // score by token intersection
                    let common = 0;
                    for (const t of tokens) if (queryTokens.has(t)) common++;
                    // boost score if the cleaned base includes the full query string
                    const cleaned = tokens.join(' ');
                    if (cleaned.includes(queryNorm)) common += 2;
                    if (common > bestScore) { bestScore = common; best = f; }
                  }
                  // Accept matches with at least one token in common, prefer higher scores
                  if (best && bestScore >= 1) foundPath = best.name;
                } catch (e) { /* ignore fuzzy matching errors */ }
              }

              // If caller requested the folder itself (file equals folder) or still nothing found,
              // pick the first image-like file under the folder as a best-effort fallback.
              if (!foundPath) {
                if ((filename || '').toLowerCase() === (folder || '').toLowerCase()) {
                  const img = filesList.find(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f.name));
                  if (img) foundPath = img.name;
                  else if (filesList.length) foundPath = filesList[0].name;
                }
              }

              // Additional fallback: if nothing found within the folder, try searching across the entire project
              if (!foundPath) {
                try {
                  const projectPrefix = `${builderId}/${projectId}/`;
                  const [projectFiles] = await bucket.getFiles({ prefix: projectPrefix, maxResults: 500 });
                  if (projectFiles && projectFiles.length && filename) {
                    const normalizeTokens = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
                    const queryNorm = filenameLower.replace(/\.[^/.]+$/, '');
                    const queryTokens = new Set(normalizeTokens(queryNorm));
                    let best = null as any;
                    let bestScore = 0;
                    for (const f of projectFiles) {
                      const base = (f.name.split('/').pop() || '');
                      let baseNoExt = base.replace(/\.[^/.]+$/, '').toLowerCase();
                      baseNoExt = baseNoExt.replace(/^[0-9a-f]{8,}[-_]?/i, '');
                      const tokens = normalizeTokens(baseNoExt).filter(Boolean);
                      if (tokens.length === 0) continue;
                      let common = 0;
                      for (const t of tokens) if (queryTokens.has(t)) common++;
                      const cleaned = tokens.join(' ');
                      if (cleaned.includes(queryNorm)) common += 2;
                      if (common > bestScore) { bestScore = common; best = f; }
                    }
                    if (best && bestScore >= 1) foundPath = best.name;
                  }
                } catch (e) {
                  // ignore project-wide listing errors
                }
              }
            } catch (e) {
              // ignore listing errors and fall through to returning 404
            }
          }

          if (!foundPath) {
            res.status(404).json({ error: `File not found`, tried: tried.slice(0, 10) });
            return;
          }

          // Generate signed URL (read, 10 min expiry)
          const [url] = await bucket.file(foundPath).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 10 * 60 * 1000,
          });
          res.json({ url, path: foundPath });
          return;
        } catch (err: any) {
          console.error('getSignedUrl error', err);
          res.status(500).json({ error: String(err?.message || err) });
          return;
        }
      }

      // New route: proxy an image from GCS through this function to avoid client CORS issues.
      // GET /api/image?path=<objectPath>
      if (parts[0] === "image") {
        if (allowCors(req, res)) return;
        if (req.method !== "GET") {
          res.status(405).json({ error: "Method not allowed" });
          return;
        }
        try {
          let objectPath = String(req.query.path || "").trim();
          if (!objectPath) {
            res.status(400).json({ error: "Missing required query param: path" });
            return;
          }

          // Robustly decode (handle double-encoding)
          try {
            for (let i = 0; i < 3; i++) {
              const dec = decodeURIComponent(objectPath);
              if (dec === objectPath) break;
              objectPath = dec;
            }
          } catch (e) { /* ignore */ }

          // If a full URL was provided, strip the scheme/host portion
          if (/^https?:\/\//i.test(objectPath)) {
            const m = String(objectPath).match(/^https?:\/\/[^\/]+\/(.+)$/i);
            if (m) objectPath = m[1];
            else objectPath = objectPath.replace(/^https?:\/\//i, '');
          }

          // Normalize slashes and trim
          objectPath = objectPath.replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');

          // If the path starts with a bucket/domain-like segment (contains a dot or 'firebasestorage' or 'storage.googleapis'), strip it
          const partsForGuess = objectPath.split('/').filter(Boolean);
          if (partsForGuess.length > 0) {
            const first = partsForGuess[0] || '';
            const looksLikeBucket = first.includes('.') || first.includes('firebasestorage') || first.includes('storage.googleapis');
            if (looksLikeBucket && partsForGuess.length > 1) {
              objectPath = partsForGuess.slice(1).join('/');
            }
          }

          // Try to find the file as provided; accept exact object path only (no fuzzy matching here)
          const bucket = admin.storage().bucket();
          const fileRef = bucket.file(objectPath);
          const [exists] = await fileRef.exists();
          if (!exists) {
            res.status(404).json({ error: "File not found", path: objectPath });
            return;
          }

          // Read metadata and set headers
          try {
            const [meta] = await fileRef.getMetadata();
            if (meta && meta.contentType) res.set("Content-Type", meta.contentType);
            const cacheCtr = meta && meta.cacheControl ? meta.cacheControl : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
            res.set("Cache-Control", cacheCtr);
          } catch (e) {
            res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
          }

          // Set CORS headers explicitly
          const origin = req.headers.origin || '*';
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Vary', 'Origin');

          // Stream the file
          const readStream = fileRef.createReadStream();
          readStream.on('error', (streamErr: any) => {
            console.error('error streaming file', streamErr);
            if (!res.headersSent) res.status(500).json({ error: 'Error reading file' });
            else res.end();
          });
          readStream.pipe(res);
          return;
        } catch (err: any) {
          console.error('image proxy error', err);
          res.status(500).json({ error: String(err?.message || err) });
          return;
        }
      }

      res.status(404).json({ error: "Not found" });
    } catch (err: any) {
      logger.error("API error", { error: err?.message || err });
      res.status(500).json({ error: "Internal server error", details: err?.message || String(err) });
    }
  }); // close corsHandler
}); // close onRequest

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

