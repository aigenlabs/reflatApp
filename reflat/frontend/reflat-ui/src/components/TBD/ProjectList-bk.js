import { useState, useEffect } from "react";
import SearchBar from './SearchBar';
import ProjectCard from './ProjectCard';
import ProjectSkeleton from "./ProjectSkeleton";

export default function PrjList(){
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [projects, setProjects] = useState([]);
    // const [location_projects_list, setLocationProjects] = useState([]);
    const [builderIds, setBuilderIds] = useState([]);
    const [selectedBuilder, setSelectedBuilder] = useState('null');
    const [cities, setCities] = useState([]);
    const [locations, setLocations] = useState([]);
    const [selectedCity, setSelectedCity] = useState('Hyderabad');
    const [selectedLocation, setSelectedLocation] = useState('null');

    const FIREBASE_FUNCTIONS_URL="https://api-j7h3kbr6rq-uc.a.run.app/api"
    const FIREBASE_STORAGE_URL="https://storage.googleapis.com/reflat.firebasestorage.app"

   

 useEffect(() => {
   async function fetchlocations(){
    try{
        const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/locations/`);
        if (!res.ok) {
            throw new Error("Failed to fetch locations");
          }
        const data = await res.json();
        set_Search_list(data)
    } catch (err) {
        console.error("Error fetching locations:", err);
      }
    }
  fetchlocations()
}, []);

function set_Search_list(data){
  setBuilderIds(data["builder_ids"]);
  setCities(data["cities"]);
  setLocations(data["locations"]);
}

    useEffect(() => {
      async function loadProjects() {
         try {
                if(selectedCity==null || selectedLocation==null)
                  return
                // Step 1: Fetch project IDs for given city + location
                const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/location_project_data/${selectedCity}/${selectedLocation}`);

                const result = await res.json();
                const location_prj_list = result.projects;
                var loc_builder_prj_list=null
                if(selectedBuilder!=='null'){
                  loc_builder_prj_list=location_prj_list.filter((prj)=>prj.builder_id === selectedBuilder)
                  if(loc_builder_prj_list.length===0){
                    set_Projects_List(loc_builder_prj_list.flat());
                    return;
                  } 
                }
                if(loc_builder_prj_list===null)
                  loc_builder_prj_list=location_prj_list

                  // Step 2: Fetch all project details in parallel
                  const promises = loc_builder_prj_list.map((prj) =>
                    fetch(`${FIREBASE_FUNCTIONS_URL}/project_data/${prj.builder_id}/${prj.project_id}`)
                      .then((res) => res.json())
                  );
                  const results = await Promise.all(promises);
                  const prj_list = results.filter(r => r != null);
                const projects_list=prj_list.map((prj)=>{
                      const brochure_url=`${FIREBASE_STORAGE_URL}/brochures/${prj.builder_id}/${prj.project_id}/${prj.brochure_file}`
                      const logo_url=`${FIREBASE_STORAGE_URL}/logos/${prj.builder_id}/${prj.project_id}/${prj.logo_file}`
                      prj["brochure_url"]=`${brochure_url}?alt=media`
                      prj["logo_url"]=logo_url
                      return prj
                    });
                set_Projects_List(projects_list.flat());
              } catch (err) {
                console.error(err);}
      }
      loadProjects()
    },[selectedBuilder, selectedCity, selectedLocation])
    
  function set_Projects_List(projects_list){
       const projectArrays=projects_list.map(p=>{
                const projectsList = [];
                      projectsList.push({
                          builderId: p.builder_id,
                          builderName: p.builder_id || '',
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
                          brochure: p.brochure_url  || '',
                          logo: p.logo_url || ''
                        });
                  return projectsList});
      setProjects(projectArrays.flat());

    }                
    return (
        <div className="container py-4">
          <header className="mb-4 d-flex align-items-center bg-light p-3 rounded shadow-sm">
            {/* <i className="fa-solid fa-building fa-2x text-primary me-3"></i> */}
            <img src="../assets/images/reflat_logo.png" alt="Reflat Logo" width="100" height="100"/>
            <div>
              <h2 className="fw-bold text-gradient mb-1">ReFlat – Happy Flatting</h2>
              <p className="text-muted mb-0">Find your dream home with ease</p>
            </div>
          </header>
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
            {projects.map((p, idx) => (
            <div
                className="col-12 col-sm-6 col-lg-4"
                key={`${p.builderId}-${p.projectId}-${idx}`}
            >
                <ProjectCard project={p} />
            </div>
            ))}
            {projects.length === 0 && (
            <div className="col-12">
                <p className="text-muted">No projects match your criteria.</p>
            </div>
            )}
        </div>
        </div>
      );
}