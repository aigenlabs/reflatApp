import { useState, useEffect } from "react";
import SearchBar from "./SearchBar";
import ProjectCard from "./ProjectCard";
import ProjectSkeleton from "./ProjectSkeleton";
import { clearAppCache } from "./clearAppCache";

import { FIREBASE_FUNCTIONS_URL, FIREBASE_STORAGE_URL } from "./constants";

export default function PrjList() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // ⚙️ prefer env vars; fallback stays empty string if you want to inject at runtime
  // const FIREBASE_FUNCTIONS_URL =
  //   process.env.REACT_APP_FUNCTIONS_URL || "";
  // const FIREBASE_STORAGE_URL =
  //   process.env.REACT_APP_STORAGE_URL || "";

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
        // derive builderIds only from loaded projects later, not here
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

  useEffect(() => {
  async function loadProjects() {
    // Only load when city & location selected
    if (!selectedCity || !selectedLocation) {
      setProjects([]);
      // keep builderIds as-is; they come from locality results
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1) Fetch project refs for this locality (UNFILTERED)
      const res = await fetch(
        `${FIREBASE_FUNCTIONS_URL}/location_project_data/${selectedCity}/${selectedLocation}`
      );
      if (!res.ok) throw new Error("Failed to fetch project list");

      const { projects: locationProjects = [] } = await res.json();

      // 2) Derive builder options BEFORE filtering
      const builderOptions = Array.from(
        new Set(locationProjects.map((p) => p.builder_id))
      ).sort();
      setBuilderIds(builderOptions);

      // If current builder no longer valid for this locality, reset it
      if (selectedBuilder && !builderOptions.includes(selectedBuilder)) {
        setSelectedBuilder("");
      }

      // 3) Now apply builder filter (if any)
      const refsToLoad = selectedBuilder
        ? locationProjects.filter((p) => p.builder_id === selectedBuilder)
        : locationProjects;

      // If filtered list is empty, clear projects ONLY (keep builderIds visible)
      if (refsToLoad.length === 0) {
        setProjects([]);
        return;
      }

      // 4) Fetch details in parallel
      const details = await Promise.all(
        refsToLoad.map((p) =>
          fetch(
            `${FIREBASE_FUNCTIONS_URL}/project_data/${p.builder_id}/${p.project_id}`
          ).then((r) => r.json())
        )
      );

      const valid = details.filter(Boolean);

      // 5) Normalize + URLs
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

      setProjects(projectsList);
    } catch (err) {
      console.error(err);
      setError("Unable to fetch projects");
      setProjects([]);
      // DO NOT clear builderIds here
    } finally {
      setLoading(false);
    }
  }

  loadProjects();
}, [selectedCity, selectedLocation, selectedBuilder]);

  const isBuilderDisabled = !(selectedCity && selectedLocation && builderIds.length > 0);

  return (
    // <div className="container py-2">
    <div className="container px-2 pt-0 pb-0">
        {/* Toolbar: logo left, filters right (same row) */}
        <header className="topbar">
        <div className="topbar__wrap" >
          {/* Toolbar lives inline with the logo */}
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
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
                clearAppCache()
              }}
            />
          </div>
        </div>
      </header>
      {/* <hr /> */}
      {/* Loading */}
      {loading && (
        <div className="row g-4" role="status" aria-live="polite">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div className="col-12 col-sm-6 col-lg-4" key={idx}>
              <ProjectSkeleton />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="alert alert-danger mt-3 text-center" role="alert">
          {error}
        </div>
      )}

      {/* Results / Empty states */}
      {!loading && !error && (
        <div className="row g-4">
          {projects.length > 0 ? (
            projects.map((p, idx) => (
              <div
                className="col-12 col-sm-6 col-lg-4"
                key={`${p.builderId}-${p.projectId}-${idx}`}
              >
                <ProjectCard project={p} />
              </div>
            ))
          ) : selectedLocation === "" ? (
            <div className="col-12 d-flex align-items-center">
              {/* centered message */}
              <div className="flex-grow-1 d-flex justify-content-center">
                <p className="text-muted mb-0">
                  Please select a location to view projects in{" "}
                  <strong>{selectedCity}</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="col-12">
              <p className="text-muted text-center">
                No projects match your criteria.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
