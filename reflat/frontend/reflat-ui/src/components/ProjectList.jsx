import { useState, useEffect, useRef } from "react";
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import SearchBar from "./SearchBar";
import ProjectCard from "./ProjectCard";
import ProjectSkeleton from "./ProjectSkeleton";
import { clearAppCache } from "./clearAppCache";
import { FIREBASE_FUNCTIONS_URL } from "./constants";

// simple in-memory cache to avoid re-fetching the same data repeatedly
const projectsCache = new Map(); // key -> projects array
const pendingRequests = new Map(); // key -> Promise

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
        // Normalize keys for ProjectCard (include all expected fields)
        const normalized = projectsList.map((p) => ({
          ...p,
          builderId: p.builderId || p.builder_id || '',
          builderName: p.builderName || p.builder_name || '',
          projectId: p.projectId || p.project_id || p.id || '',
          name: p.name || p.project_name || '',
          city: p.city || '',
          location: p.location || '',
          unitSizes: p.unitSizes || p.unit_sizes || '',
          configuration: p.configuration || '',
          totalAcres: p.totalAcres || p.total_acres || '',
          totalTowers: p.totalTowers || p.total_towers || '',
          totalUnits: p.totalUnits || p.total_units || '',
          unitsPerFloor: p.unitsPerFloor || p.units_per_floor || '',
          totalFloors: p.totalFloors || p.total_floors || '',
          densityPerAcre: p.densityPerAcre || p.density_per_acre || '',
          brochure: p.brochure || '',
          website: p.website || '',
          logo: p.logo || p.project_logo || '',
        }));
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
                   .filter((p) =>
                     (!selectedBuilder ||
                       ((p.builderId || p.builder_id || '').toLowerCase() === selectedBuilder.toLowerCase())
                     ) &&
                     (p && (p.builderId || p.builder_id) && (p.projectId || p.project_id))
                   )
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
