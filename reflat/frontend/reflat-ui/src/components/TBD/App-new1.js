import React, { useEffect, useState } from 'react';
import SearchBar from './components/SearchBar';
import ProjectCard from './components/ProjectCard';

/**
 * Main application component.
 * Loads project data from the public folder and provides a UI for
 * filtering projects by city and location.
 */
function App() {
  const [projects, setProjects] = useState([]);
  const [builderIds, setBuilderIds] = useState([]);
  const [selectedBuilder, setSelectedBuilder] = useState('');
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  // Load project data from JSON on initial mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const basePath = process.env.PUBLIC_URL || '';
        // Load main.json which lists builders and their details file
        const mainResp = await fetch(`${basePath}/data/main.json`);
        const mainData = await mainResp.json();
        const builders = mainData.projects || [];
        // For each builder entry, attempt to load its project details
        const projectArrays = await Promise.all(
          builders.map(async (builder) => {
            const detailsPath = builder.details;
            if (!detailsPath) return [];
            try {
              const detailResp = await fetch(`${basePath}/data/${detailsPath}`);
              if (!detailResp.ok) {
                console.warn(`Could not load builder details for ${builder.builder_id}`);
                return [];
              }
              const detailJson = await detailResp.json();
              // If the details file contains a projects array, iterate; otherwise treat as single project
              const projectsList = [];
              if (Array.isArray(detailJson.projects)) {
                detailJson.projects.forEach((p) => {
                  projectsList.push({
                    builderId: p.builder_id || builder.builder_id,
                    builderName: builder.builder_name || '',
                    projectId: p.project_id,
                    name: p.project_name || '',
                    city: p.project_city || '',
                    location: p.project_location || '',
                    website: p.project_website || '',
                    unitSizes: p.unit_sizes || '',
                    configuration: p.configuration || '',
                    totalAcres: p.total_acres || '',
                    totalTowers: p.total_towers || '',
                    totalUnits: p.total_units || '',
                    unitsPerFloor: p.units_perfloor || '',
                    totalFloors: p.total_floors || '',
                    densityPerAcre: p.desnsity_per_acre || '',
                    brochure: p.brochure_file || '',
                    logo: p.logo_file || ''
                  });
                });
              } else {
                // Single project JSON file: treat the root object as the project
                const p = detailJson;
                projectsList.push({
                  builderId: p.builder_id || builder.builder_id,
                  builderName: builder.builder_name || '',
                  projectId: p.project_id || '',
                  name: p.project_name || '',
                  city: p.project_city || '',
                  location: p.project_location || '',
                  website: p.project_website || '',
                  unitSizes: p.unit_sizes || '',
                  configuration: p.configuration || '',
                  totalAcres: p.total_acres || '',
                  totalTowers: p.total_towers || '',
                  totalUnits: p.total_units || '',
                  unitsPerFloor: p.units_perfloor || '',
                  totalFloors: p.total_floors || '',
                  densityPerAcre: p.desnsity_per_acre || '',
                  brochure: p.brochure_file || '',
                  logo: p.logo_file || ''
                });
              }
              return projectsList;
            } catch (err) {
              console.warn(`Failed to load or parse details for ${builder.builder_id}:`, err);
              return [];
            }
          })
        );
        // Flatten arrays and set state
        const allProjects = projectArrays.flat();
        setProjects(allProjects);
        // Extract unique builder IDs, cities and locations
        const uniqueBuilders = Array.from(new Set(allProjects.map((p) => p.builderId))).sort((a, b) => a.localeCompare(b));
        setBuilderIds(uniqueBuilders);
        const uniqueCities = Array.from(new Set(allProjects.map((p) => p.city))).sort((a, b) => a.localeCompare(b));
        setCities(uniqueCities);
      } catch (err) {
        console.error('Error loading project data', err);
      }
    }
    loadProjects();
  }, []);

  // Update available locations when city selection changes
  useEffect(() => {
    // Filter based on selected builder and city
    const filtered = projects.filter((p) => {
      const matchBuilder = !selectedBuilder || p.builderId === selectedBuilder;
      const matchCity = !selectedCity || p.city === selectedCity;
      return matchBuilder && matchCity;
    });
    const uniqueLocations = Array.from(new Set(filtered.map((p) => p.location))).sort((a, b) => a.localeCompare(b));
    setLocations(uniqueLocations);
    // Reset selected location if it's no longer valid
    if (selectedLocation && !uniqueLocations.includes(selectedLocation)) {
      setSelectedLocation('');
    }
  }, [projects, selectedCity, selectedBuilder]);

  // Update available cities when builder selection changes
  useEffect(() => {
    const filtered = projects.filter((p) => !selectedBuilder || p.builderId === selectedBuilder);
    const uniqueCities = Array.from(new Set(filtered.map((p) => p.city))).sort((a, b) => a.localeCompare(b));
    setCities(uniqueCities);
    // Reset city if no longer valid
    if (selectedCity && !uniqueCities.includes(selectedCity)) {
      setSelectedCity('');
    }
  }, [projects, selectedBuilder]);

  // Reset city and location filters when builder changes to avoid stale selections
  useEffect(() => {
    // Only reset if the selected values are set and may not exist in new builder's data
    setSelectedCity('');
    setSelectedLocation('');
  }, [selectedBuilder]);

  // Compute filtered projects list based on current filters
  const filteredProjects = projects.filter((p) => {
    const matchBuilder = !selectedBuilder || p.builderId === selectedBuilder;
    const matchCity = !selectedCity || p.city === selectedCity;
    const matchLocation = !selectedLocation || p.location === selectedLocation;
    return matchBuilder && matchCity && matchLocation;
  });

  return (
    <div className="container py-4">
      <header className="mb-4 d-flex align-items-center">
          {/* App logo using a FontAwesome icon */}
          {/* <i className="fa-solid fa-building fa-2x text-primary me-2"></i> */}
          <img src="./reflat-logo3.png" alt="React banner" width="100" height="100"/>
          <div>
            <h1 className="display-6 mb-0">ReFlat-Flat Finding Made Easy</h1>
            {/* <p className="lead mb-0">Search projects by builder, city and locality.</p> */}
          </div>
    </header>

      {/* <header className="mb-4">
         <img src="data/reflatAppLogo1.jpg" alt="React banner" width="100" height="50"/>
        <h1 className="display-6">ReFlat-Find Flats Easily</h1> */}
        {/* <p className="lead">Search projects by city and locality.</p> */}
      {/* </header> */}
      <SearchBar
        builders={builderIds}
        selectedBuilder={selectedBuilder}
        setSelectedBuilder={setSelectedBuilder}
        cities={cities}
        locations={locations}
        selectedCity={selectedCity}
        setSelectedCity={setSelectedCity}
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
      />
      <hr />
      <div className="row g-4">
        {filteredProjects.map((p, idx) => (
          <div
            className="col-12 col-sm-6 col-lg-4"
            key={`${p.builderId}-${p.projectId}-${idx}`}
          >
            <ProjectCard project={p} />
          </div>
        ))}
        {filteredProjects.length === 0 && (
          <div className="col-12">
            <p className="text-muted">No projects match your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;