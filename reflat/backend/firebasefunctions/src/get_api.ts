import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import cors from "cors";
import { postApiHandler } from "./post_api";


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

      const parts = urlPath.replace(/^\/api\/?/, "").split("/");

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
        const modeQ = (req.query?.mode as string | undefined)?.toLowerCase();
        const filterMode = modeQ === "rent" || modeQ === "resale" ? modeQ : undefined;

        const docRef = db.collection("config").doc("serviceable");
        const snap = await docRef.get();
        if (!snap.exists) {
          res.status(404).json({ error: "No serviceable config found" });
          return;
        }
        const data = snap.data() as any;

        const citiesSet = new Set<string>();
        const localitiesByCity: Record<string, Set<string>> = {};
        const buildersByCityLocality: Record<string, Record<string, Set<string>>> = {};
        const projectsByBuilder: Record<string, { name: string; projects: Array<{ id: string; name: string; city: string; locality: string; modes: string[] }> }> = {};

        const cities = Array.isArray(data?.cities) ? data.cities : [];
        for (const c of cities) {
          const city = c?.name;
          if (!city) continue;
          citiesSet.add(city);
          localitiesByCity[city] = localitiesByCity[city] || new Set<string>();
          buildersByCityLocality[city] = buildersByCityLocality[city] || {};

          const locs = Array.isArray(c?.localities) ? c.localities : [];
          for (const l of locs) {
            const locality = l?.name;
            if (!locality) continue;
            localitiesByCity[city].add(locality);
            buildersByCityLocality[city][locality] = buildersByCityLocality[city][locality] || new Set<string>();

            const props = Array.isArray(l?.properties) ? l.properties : [];
            for (const p of props) {
              // Support both flattened entries and nested builder.projectDetails[] format
              const builderId = String(p?.builderId || "");
              const builderName = String(p?.builderName || builderId || "");

              const details = Array.isArray((p as any)?.projectDetails) ? (p as any).projectDetails : null;
              if (details) {
                for (const d of details) {
                  const active = d?.active !== false;
                  if (!active) continue;
                  const modes: string[] = Array.isArray(d?.modes) ? d.modes : ["rent", "resale"];
                  if (filterMode && !modes.includes(filterMode)) continue;
                  const projectId = String(d?.id || "");
                  const projectName = String(d?.name || projectId || "");
                  if (!builderId || !projectId) continue;

                  buildersByCityLocality[city][locality].add(builderName || builderId);
                  if (!projectsByBuilder[builderId]) {
                    projectsByBuilder[builderId] = { name: builderName || builderId, projects: [] };
                  }
                  projectsByBuilder[builderId].projects.push({ id: projectId, name: projectName, city, locality, modes });
                }
              } else {
                // Backward compatibility: flattened property entry
                if (p?.active === false) continue;
                const modes: string[] = Array.isArray(p?.modes) ? p.modes : ["rent", "resale"];
                if (filterMode && !modes.includes(filterMode)) continue;
                const projectId = String((p as any)?.projectId || "");
                const projectName = String((p as any)?.projectName || projectId || "");
                if (!builderId || !projectId) continue;

                buildersByCityLocality[city][locality].add(builderName || builderId);
                if (!projectsByBuilder[builderId]) {
                  projectsByBuilder[builderId] = { name: builderName || builderId, projects: [] };
                }
                projectsByBuilder[builderId].projects.push({ id: projectId, name: projectName, city, locality, modes });
              }
            }
          }
        }

        // Convert sets to arrays for JSON response
        const result = {
          mode: filterMode || "all",
          cities: Array.from(citiesSet),
          localitiesByCity: Object.fromEntries(
            Object.entries(localitiesByCity).map(([city, set]) => [city, Array.from(set)])
          ),
          buildersByCityLocality: Object.fromEntries(
            Object.entries(buildersByCityLocality).map(([city, locMap]) => [
              city,
              Object.fromEntries(
                Object.entries(locMap).map(([loc, set]) => [loc, Array.from(set)])
              ),
            ])
          ),
          projectsByBuilder,
        } as const;

        logger.info("serviceable response", { cities: result.cities.length });
        res.json(result);
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

        // --- Step 2: Attempt to fetch file manifest from GCS ---
        let manifest: any = null;
        try {
          const bucket = admin.storage().bucket(); // Default bucket
          const manifestPath = `${builderId}/${projectId}/uploaded_manifest.json`;
          const file = bucket.file(manifestPath);
          const [exists] = await file.exists();
          if (exists) {
            logger.info(`Found manifest for ${builderId}/${projectId}, downloading...`);
            const [contents] = await file.download();
            manifest = JSON.parse(contents.toString("utf8"));
          } else {
            logger.warn(`Manifest not found at ${manifestPath}. Falling back to Firestore subcollections.`);
          }
        } catch (e: any) {
          logger.error(`Error fetching manifest for ${builderId}/${projectId}: ${e.message}`, e);
          // Fallback to old method if manifest is corrupt or inaccessible
        }

        let photos: any[] = [];
        let layouts: any[] = [];
        let videos: any[] = [];
        let floor_plans: any[] = [];
        let files: Record<string, string | null> = {};

        if (manifest && manifest.files) {
          // --- Step 3a: Populate from GCS Manifest ---
          logger.info(`Populating project details from manifest for ${builderId}/${projectId}`);
          const manifestFiles = manifest.files || {};
          photos = manifestFiles.photos || [];
          layouts = manifestFiles.layouts || [];
          floor_plans = manifestFiles.floor_plans || [];
          videos = manifestFiles.videos || []; // Assuming videos might be in manifest

          const logos = manifestFiles.logos || [];
          const builderLogo = logos.find((l: any) => l.path.includes("builder"));
          const projectLogo = logos.find((l: any) => !l.path.includes("builder"));

          files = {
            banner: manifestFiles.banners?.[0]?.path || null,
            brochure: manifestFiles.brochures?.[0]?.path || null,
            builder_logo: builderLogo?.path || null,
            project_logo: projectLogo?.path || logos[0]?.path || null, // Fallback to first logo
            youtube_id: projectData?.youtube_id || projectData?.youtube || null,
            website: projectData?.project_website || projectData?.website || null,
          };
        } else {
          // --- Step 3b: Fallback to Firestore Subcollections ---
          logger.warn(`Falling back to Firestore subcollections for ${builderId}/${projectId}`);
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

          files = {
            banner: projectData?.banner_file || null,
            brochure: projectData?.brochure_file || null,
            builder_logo: projectData?.builder_logo_file || projectData?.logo_file || null,
            project_logo: projectData?.project_logo_file || projectData?.project_logo || null,
            youtube_id: projectData?.youtube_id || projectData?.youtube || null,
            website: projectData?.project_website || projectData?.website || null,
          };
        }

        const result = {
          project: projectData,
          files,
          photos,
          layouts,
          videos,
          floor_plans,
        };

        logger.info("project_details response", { builderId, projectId, source: manifest ? 'manifest' : 'firestore', photos: photos.length, layouts: layouts.length });
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
      // GET /api/location_project_datadata/:city/:location
      // -----------------------------
      if (parts[0] === "location_project_data" && parts.length >= 3) {
        const city = parts[1];
        const location = parts[2];

        const docRef = db.collection("locations").doc("projects");
        const snap = await docRef.get();

        if (!snap.exists) {
          res.status(404).json({ error: "No project locations found" });
          return;
        }
        const data = snap.data();
        const projects = (data?.prj_locations || []) as ProjectLocation[];

        const project = projects.find((p) => {
          const cityMatch =
            !city || p.city?.toLowerCase() === city.toLowerCase();
          const locationMatch =
            !location || p.location?.toLowerCase() === location.toLowerCase();
          return cityMatch && locationMatch;
        });

        if (!project) {
          res.status(404).json({ error: "No matching project" });
          return;
        }

        logger.info("location_project_data response", { city, location, hasProjects: !!project });
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
    const docRef = db.collection("locations").doc("projects");
    const snap = await docRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: "No locations found" });
      return;
    }

    const data = snap.data();
    const locations = (data?.prj_locations || []) as {
      city: string;
      location: string;
      projects: { builder_id: string }[];
    }[];

    const citySet = new Set<string>();
    const locationSet = new Set<string>();
    const builderSet = new Set<string>();

    for (const entry of locations) {
      if (entry.city) {
        citySet.add(entry.city);
      }
      if (entry.location) {
        locationSet.add(entry.location);
      }
      for (const proj of entry.projects) {
        if (proj.builder_id) {
          builderSet.add(proj.builder_id);
        }
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
      // GET /api/serviceable_projects
      // Returns full nested structure with cities -> localities -> properties -> projectDetails
      // Source of truth: serviceable_projects/index (collection/doc)
      // -----------------------------
      if (parts[0] === "serviceable_projects") {
        // Return the index doc as-is (exact shape)
        const indexRef = db.collection("serviceable_projects").doc("index");
        const indexSnap = await indexRef.get();
        if (!indexSnap.exists) {
          res.status(404).json({ error: "serviceable_projects/index not found" });
          return;
        }
        const doc = indexSnap.data() as any;
        logger.info("serviceable_projects response (source=index)", {
          cities: Array.isArray(doc?.cities) ? doc.cities.length : 0,
        });
        res.json(doc);
        return;
      }

      // -----------------------------
      // GET /api/health
      // Simple health check endpoint for monitoring
      // -----------------------------
      if (parts[0] === "health") {
        res.json({ ok: true, now: Date.now() });
        return;
      }
      // -----------------------------
      // GET /api/signed_url?folder=&builderId=&projectId=&file=
      // Returns a signed read URL for a storage file (expires in 1 hour)
      // Example: /api/signed_url?folder=photos&builderId=sampleBuilder&projectId=sampleProject&file=exterior1.jpg
      // -----------------------------
      if (parts[0] === "signed_url") {
        const folderQ = (req.query?.folder as string | undefined) || undefined;
        const builderIdQ = (req.query?.builderId as string | undefined) || undefined;
        const projectIdQ = (req.query?.projectId as string | undefined) || undefined;
        const fileQ = (req.query?.file as string | undefined) || undefined;

        if (!folderQ || !builderIdQ || !projectIdQ || !fileQ) {
          res.status(400).json({ error: "Missing required query parameters: folder,builderId,projectId,file" });
          return;
        }

        try {
          // Corrected path structure to match upload script: <builderId>/<projectId>/<folder>/<file>
          const filePath = `${builderIdQ}/${projectIdQ}/${folderQ}/${fileQ}`;
          const bucket = admin.storage().bucket();
          const fileRef = bucket.file(filePath);

          // Check if the file exists before trying to sign a URL for it
          const [exists] = await fileRef.exists();
          if (!exists) {
            logger.error("signed_url error: file not found", { path: filePath });
            res.status(404).json({ error: "File not found in storage", path: filePath });
            return;
          }

          // Signed URL valid for 1 hour
          const [url] = await fileRef.getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
          });

          logger.info("signed_url generated", { file: filePath });
          res.json({ url });
          return;
        } catch (err: any) {
          logger.error("signed_url error", { err });
          res.status(500).json({ error: String(err?.message || err) });
          return;
        }
      }

      // -----------------------------
      // Fallback for unknown endpoints
      // -----------------------------
      res.status(404).json({ error: "Endpoint not found", path: urlPath });
    } catch (err: unknown) {
      logger.error("API error", { err });
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Internal error" });
      }
    }
  });
});

