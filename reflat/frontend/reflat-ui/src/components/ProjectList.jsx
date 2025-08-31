import { useState, useEffect, useRef } from "react";
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import SearchBar from "./SearchBar";
import ProjectCard from "./ProjectCard";
import ProjectSkeleton from "./ProjectSkeleton";
import { clearAppCache } from "./clearAppCache";
import { FIREBASE_FUNCTIONS_URL, FIREBASE_STORAGE_URL } from "./constants";

// simple in-memory cache to avoid re-fetching the same data repeatedly
const projectsCache = new Map(); // key -> projects array
const pendingRequests = new Map(); // key -> Promise

export default function PrjList() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const [maxCardWidth, setMaxCardWidth] = useState(null);

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
      console.log("QQQ:", selectedCity, selectedLocation, selectedBuilder);

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
          await pendingRequests.get(key);
          if (projectsCache.has(key)) setProjects(projectsCache.get(key));
        } catch (err) {
          console.error('Error awaiting pending request', err);
          setError('Unable to fetch projects');
          setProjects([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      const requestPromise = (async () => {
        try {
          const res = await fetch(
            `${FIREBASE_FUNCTIONS_URL}/location_project_data/${selectedCity}/${selectedLocation}`
          );
          if (!res.ok) throw new Error("Failed to fetch project list");
          const { projects: locationProjects = [] } = await res.json();

          const builderOptions = Array.from(
            new Set(locationProjects.map((p) => p.builder_id))
          ).sort();
          setBuilderIds(builderOptions);

          if (selectedBuilder && !builderOptions.includes(selectedBuilder)) {
            setSelectedBuilder("");
          }

          const refsToLoad = selectedBuilder
            ? locationProjects.filter((p) => p.builder_id === selectedBuilder)
            : locationProjects;

          if (refsToLoad.length === 0) {
            projectsCache.set(key, []);
            setProjects([]);
            return;
          }

          console.log("Loading details for", refsToLoad.length, "projects");

          const details = await Promise.all(
            refsToLoad.map((p) =>
              fetch(
                `${FIREBASE_FUNCTIONS_URL}/project_data/${p.builder_id}/${p.project_id}`
              )
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            )
          );

          const valid = details.filter(Boolean);

          const projectsList = valid.map((p) => ({
            builderId: p.builder_id,
            builderName: p.builder_id || "",
            projectId: p.project_id,
            name: p.project_name || "",
            city: p.project_city || "",
            location: p.project_location || "",
            website: p.project_website || "",
            unitSizes: p.unit_sizes || "",
            configuration: p.configuration || "",
            totalAcres: p.total_acres || "",
            totalTowers: p.total_towers || "",
            totalUnits: p.total_units || "",
            unitsPerFloor: p.units_perfloor || "",
            totalFloors: p.total_floors || "",
            densityPerAcre: p.desnsity_per_acre || "",
            brochure: `${FIREBASE_STORAGE_URL}/brochures/${p.builder_id}/${p.project_id}/${p.brochure_file}?alt=media`,
            logo: `${FIREBASE_STORAGE_URL}/logos/${p.builder_id}/${p.project_id}/${p.logo_file}`,
          }));

          // cache the final list so next time we can serve instantly
          projectsCache.set(key, projectsList);
          setProjects(projectsList);
        } catch (err) {
          console.error(err);
          setError('Unable to fetch projects');
          setProjects([]);
        } finally {
          setLoading(false);
          pendingRequests.delete(key);
        }
      })();

      pendingRequests.set(key, requestPromise);
    }

    loadProjects();

    // no cleanup abort - allow in-flight requests to finish and be cached
    return () => {};
  }, [selectedCity, selectedLocation, selectedBuilder]);

  const isBuilderDisabled =
    !(selectedCity && selectedLocation && builderIds.length > 0);

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
                 projects.map((p, idx) => (
                   <Grid
                     item
                     xs={12}
                     sm={6}
                     lg={4}
                     key={`${p.builderId}-${p.projectId}`}
                     sx={{ display: "flex", alignItems: "stretch", height: "100%", minWidth: 0 }}
                   >
                     <Box 
                     sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}>
                       <ProjectCard project={p} />
                     </Box>
                   </Grid>
                 ))
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
