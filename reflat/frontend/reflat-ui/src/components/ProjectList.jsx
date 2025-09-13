import { useState, useEffect, useRef } from "react";
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import SearchBar from "./SearchBar";
import ProjectCard from "./ProjectCard";
import ProjectSkeleton from "./ProjectSkeleton";
import { clearAppCache } from "./clearAppCache";
import { FIREBASE_FUNCTIONS_URL } from "./constants";
import { enableImageCache, isImageCachingEnabled } from './imageCache';

// simple in-memory cache to avoid re-fetching the same data repeatedly
const projectsCache = new Map(); // key -> projects array
const pendingRequests = new Map(); // key -> Promise

// helper: produce a safe slug from a project name (used when projectId is missing)
function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export default function PrjList() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [builderIds, setBuilderIds] = useState([]);
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  
  // persist selections
  const [selectedBuilder, setSelectedBuilder] = useState(
    localStorage.getItem("selectedBuilder") || ""
  );
  const [selectedCity, setSelectedCity] = useState(
    localStorage.getItem("selectedCity") || "Hyderabad"
  );
  const [selectedLocation, setSelectedLocation] = useState(
    localStorage.getItem("selectedLocation") || ""
  );

  // save to localStorage on change
  useEffect(() => {
    localStorage.setItem("selectedBuilder", selectedBuilder);
  }, [selectedBuilder]);
  useEffect(() => {
    localStorage.setItem("selectedCity", selectedCity);
  }, [selectedCity]);
  useEffect(() => {
    localStorage.setItem("selectedLocation", selectedLocation);
  }, [selectedLocation]);

  // when city or location changes, clear builder selection
  useEffect(() => {
    setSelectedBuilder("");
  }, [selectedCity, selectedLocation]);

  /** Fetch location metadata (cities, locations) */
  useEffect(() => {
    async function fetchLocations() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/locations`);
        if (!res.ok) throw new Error("Failed to fetch locations");
        const data = await res.json();
        setCities(data.cities || []);
        setLocations(data.locations || []);
      } catch (err) {
        console.error("Error fetching locations:", err);
        setError("Unable to fetch locations");
      } finally {
        setLoading(false);
      }
    }
    fetchLocations();
  }, []);

  // optimized projects loader: caches results and deduplicates concurrent requests
  useEffect(() => {
    // NOTE: removed AbortController to avoid aborting previously-started requests when
    // dependencies change. We rely on `pendingRequests` to deduplicate concurrent
    // requests and let in-flight requests complete. Aborting was causing expected
    // 'loadProjects aborted' messages in development (React Strict Mode / quick state updates).

    async function loadProjects() {
      if (!selectedCity || !selectedLocation) {
        setProjects([]);
        return;
      }

      setLoading(true);
      setError(null);

      const key = `${selectedCity}|${selectedLocation}|${selectedBuilder || ''}`;

      // serve from cache if available
      if (projectsCache.has(key)) {
        setProjects(projectsCache.get(key));
        setLoading(false);
        return;
      }

      // if a request for the same key is already in flight, await it instead of issuing another
      if (pendingRequests.has(key)) {
        try {
          const data = await pendingRequests.get(key);
          projectsCache.set(key, data);
          setProjects(data);
          setLoading(false);
          return;
        } catch (err) {
          // if the pending request fails, remove it from the map and fall through to retry
          pendingRequests.delete(key);
        }
      }

      // Build URL with query params (avoid new URL for relative paths)
      let url = `${FIREBASE_FUNCTIONS_URL}/location_project_data?city=${encodeURIComponent(selectedCity)}&location=${encodeURIComponent(selectedLocation)}`;
      if (selectedBuilder) {
        url += `&builder=${encodeURIComponent(selectedBuilder)}`;
      }
      const request = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch projects");
        // Now expecting a list of full project details
        const projectsList = await res.json();
        if (!Array.isArray(projectsList)) throw new Error("Invalid projects response");
        // Normalize keys for ProjectCard (prefer structured Key_Project_details when available)
        const normalized = projectsList.map((p) => {
          const kd = p.key_project_details || p.project || p || {};
          return ({
            ...p,
            // prefer explicit builderId, but fall back to builder_name from Key_Project_details
            builderId: p.builderId || p.builder_id || kd.builder_id || kd.builder || kd.builder_name || '',
            builderName: p.builderName || p.builder_name || kd.builder_name || kd.builder || '',
            // derive a stable projectId when not provided by using any available id or a slug of the project name
            projectId:
              p.projectId || p.project_id || p.id || kd.project_id || kd.projectId || slugify(p.name || p.project_name || kd.project_name || kd.name),
             name: p.name || p.project_name || kd.project_name || kd.name || '',
             city: p.city || kd.project_city || kd.city || '',
             location: p.location || kd.project_location || kd.location || '',
             unitSizes: p.unitSizes || p.unit_sizes || kd.unit_sizes || kd.unit_sizes || '',
             configuration: p.configuration || kd.config || kd.configuration || '',
             totalAcres: p.totalAcres || p.total_acres || kd.total_acres || kd.totalAcres || '',
             totalTowers: p.totalTowers || p.total_towers || kd.total_towers || kd.totalTowers || '',
             totalUnits: p.totalUnits || p.total_units || kd.total_units || kd.totalFlats || kd.total_flats || '',
             unitsPerFloor: p.unitsPerFloor || p.units_per_floor || kd.units_per_floor || kd.unitsPerFloor || '',
             totalFloors: p.totalFloors || p.total_floors || kd.total_floors || kd.totalFloors || '',
             densityPerAcre: p.densityPerAcre || p.flats_per_acre || kd.flats_per_acre || p.density_per_acre || kd.density_per_acre || p.flats_density || kd.flats_density || kd.density || '',
             brochure: p.brochure || (kd.brochures && Array.isArray(kd.brochures) ? kd.brochures[0] : kd.brochures) || '',
             website: p.website || kd.website || '',
             logo: p.logo || p.project_logo || kd.logo || kd.project_logo || '',
           });
         });
        // Debugging: log API and normalized samples to help trace missing-project rendering issues
        try {
          console.debug(`ProjectList: loaded ${projectsList.length} items for key=${key}`);
          console.debug('ProjectList: sample raw', projectsList.slice(0,3));
          console.debug('ProjectList: sample normalized', normalized.slice(0,3));
        } catch (e) {
          // ignore logging errors
        }
         // Optionally, extract builderIds for the filter dropdown
         const builderOptions = Array.from(
           new Set(normalized.map((p) => p.builderId))
         ).sort();
         setBuilderIds(builderOptions);
         if (selectedBuilder && !builderOptions.includes(selectedBuilder)) {
           setSelectedBuilder("");
         }
         projectsCache.set(key, normalized);
         return normalized;
       })();

       pendingRequests.set(key, request);

      try {
        const data = await request;
        projectsCache.set(key, data);
        setProjects(data);
        console.log(`Loaded ${data.length} projects for ${key}`);
      } catch (err) {
        console.error("Error fetching projects:", err);
        setError("Unable to fetch projects");
      } finally {
        pendingRequests.delete(key);
        setLoading(false);
      }
    }

    loadProjects();
  }, [selectedCity, selectedLocation, selectedBuilder]);

  // fetch builder IDs for the current city/location
  useEffect(() => {
    async function fetchBuilderIds() {
      if (!selectedCity || !selectedLocation) {
        setBuilderIds([]);
        return;
      }
      try {
        const url = `${FIREBASE_FUNCTIONS_URL}/builders?city=${encodeURIComponent(selectedCity)}&location=${encodeURIComponent(selectedLocation)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch builder IDs");
        const data = await res.json();
        setBuilderIds(data || []);
      } catch (err) {
        console.error("Error fetching builder IDs:", err);
        // non-critical, don't show an error to the user
      }
    }
    fetchBuilderIds();
  }, [selectedCity, selectedLocation]);

  const isBuilderDisabled = loading || builderIds.length === 0 || !selectedCity || !selectedLocation;

  // image cache toggle persisted in localStorage
  const [imageCacheEnabled, setImageCacheEnabled] = useState(() => {
    const v = localStorage.getItem('imageCacheEnabled');
    return v === null ? true : v === 'true';
  });

  useEffect(() => {
    localStorage.setItem('imageCacheEnabled', imageCacheEnabled ? 'true' : 'false');
    enableImageCache(imageCacheEnabled);
  }, [imageCacheEnabled]);

  return (
    <Box
      sx={{
        width: "100%",
        boxSizing: "border-box",
        overflowX: "clip",   // ✅ fix right-side whitespace
        p: 0,
        m: 0,
      }}
    >
      {/* Toolbar */}
      <Box component="header" className="topbar" sx={{ mb: 2 }}>
        {/* center the search bar and constrain its width to align with cards */}
        <Box
          className="topbar__wrap"
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <Box
            flex={1}
            minWidth={0}
            sx={{ width: '100%', maxWidth: 1100, px: 2 }}
          >
            <SearchBar
              variant="topbar"
              builders={builderIds}
              selectedBuilder={selectedBuilder}
              setSelectedBuilder={setSelectedBuilder}
              cities={cities}
              locations={locations}
              selectedCity={selectedCity}
              setSelectedCity={setSelectedCity}
              selectedLocation={selectedLocation}
              setSelectedLocation={setSelectedLocation}
              builderDisabled={isBuilderDisabled}
              imageCacheEnabled={imageCacheEnabled}
              setImageCacheEnabled={setImageCacheEnabled}
              onReset={() => {
                setSelectedBuilder("");
                setSelectedLocation("");
                setSelectedCity("Hyderabad");
                setProjects([]);
                clearAppCache();
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Centered content container so SearchBar aligns with cards */}
      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: '100%', maxWidth: 1100, px: 2 }}>

          {/* Loading */}
          {loading && (
            <Grid container spacing={2} role="status" aria-live="polite" justifyContent="center">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  lg={4}
                  key={idx}
                  sx={{ display: "flex", alignItems: "stretch", height: "100%", minWidth: 0, maxWidth: "100%" }}
                >
                  <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
                    <ProjectSkeleton />
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Error */}
          {!loading && error && (
            <Alert severity="error" sx={{ mt: 3, textAlign: "center" }}>
              {error}
            </Alert>
          )}

          {/* Results */}
          {!loading && !error && (
            <Grid container spacing={2} alignItems="stretch" ref={containerRef} justifyContent="center">
               {projects.length > 0 ? (
                 projects
                   .filter((p) => {
                     // builder filter must match or be empty
                     const builderOk = !selectedBuilder || ((p.builderId || p.builder_id || '').toLowerCase() === selectedBuilder.toLowerCase());
                     // show project when it has either project id or a name (newly-added projects may lack builderId)
                     const hasProjectId = !!(p.projectId || p.project_id || p.id);
                     const hasName = !!(p.name || p.project_name);
                     return builderOk && (hasProjectId || hasName);
                   })
                    .map((p, idx) => {
                     const builder = p.builderId || p.builder_id;
                     const project = p.projectId || p.project_id;
                     return (
                       <Grid
                         item
                         xs={12}
                         sm={6}
                         lg={4}
                         key={`${builder}-${project}`}
                         sx={{ display: "flex", alignItems: "stretch", height: "100%", minWidth: 0 }}
                       >
                         <Box 
                         sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}>
                           <ProjectCard project={p} />
                         </Box>
                       </Grid>
                     );
                   })
               ) : selectedLocation === "" ? (
                <Grid item xs={12} display="flex" alignItems="center">
                  <Box flexGrow={1} display="flex" justifyContent="center">
                    <Box component="p" sx={{ color: "text.secondary", mb: 0 }}>
                      Please select a location to view projects in <strong>{selectedCity}</strong>.
                    </Box>
                  </Box>
                </Grid>
              ) : (
                <Grid item xs={12}>
                  <Box component="p" sx={{ color: "text.secondary", textAlign: "center" }}>
                    No projects match your criteria.
                  </Box>
                </Grid>
              )}
            </Grid>
          )}

        </Box>
      </Box>

    </Box>
  );
}
