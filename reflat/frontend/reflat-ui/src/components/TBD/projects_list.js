import { useState } from "react";
import axios from "axios";
import ProjectTable from "./projects_ui";

export default function Projects_List(){
    const [builder_id, setBuilderId] = useState("");
    const [city, setCity] = useState("");
    const [location, setLocation] = useState("");
    const [location_prj_list, setProjects] = useState([]);
    const [projectData, setProjectData] = useState([]);
    const [loading, setLoading] = useState(false);


    const builders=["myhome", "aparna","all"]
    const cities = ["Hyderabad"];
    const locations = ["Kollur", "Nallagandla", "Tellapur", "Madhapur"];

    const fetchData = async () => {
    if (!city || !location) {
      alert("Please enter both City and Location");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Fetch project IDs for given city + location
      const res = await axios.get(`http://localhost:8000/location_data`, {
        params: { city, location }
      });
      console.log("Location API response:", res.data);
      const location_prj_list = res.data.projects;
      setProjects(location_prj_list);

      var loc_builder_prj_list=location_prj_list
      if(builder_id !== "all"){
        loc_builder_prj_list=location_prj_list.filter((prj)=>prj.builder_id === builder_id)
        console.log("location-builder-list:", loc_builder_prj_list)
      }
      // Step 2: Fetch all project details in parallel
      const promises = loc_builder_prj_list.map((prj) =>
        fetch(`http://localhost:8000/project_data/${prj.builder_id}/${prj.project_id}`)
          .then((res) => res.json())
      );

      const results = await Promise.all(promises);
      console.log("Project details:", results);
      const prj_list = results.filter(r => r != null);
      console.log("PRJ LIST:",prj_list)
      const file_base_url="//storage.googleapis.com/reflat.firebasestorage.app/brochures"
      const projects_list=prj_list.map((prj)=>{
        var file_url=`${file_base_url}/${prj.builder_id}/${prj.project_id}/${prj.brochure_file}`
        console.log("file url:", file_url)
        prj["file_url"]=file_url});
      console.log("PROject list",projects_list)
      setProjectData(prj_list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }

};

return (
    <div className="container">
      <h1>Get Projects based on Location & builder id</h1>

      <div className="input-group">
        <select
          type="text"
          placeholder="Enter City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="border border-gray-300 rounded p-2 w-64"
        >
         <option value="">-- Choose a city --</option>
        {cities.map((c, idx) => (
          <option key={idx} value={c}>
            {c}
          </option>
        ))}
      </select>
        <select
          type="text"
          placeholder="Enter Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border border-gray-300 rounded p-2 w-64"
        >
         <option value="">-- Choose a location --</option>
        {locations.map((l, idx) => (
          <option key={idx} value={l}>
            {l}
          </option>
        ))}
      </select>
      <select
            type="text"
            placeholder="Enter Builder"
            value={builder_id}
            onChange={(e) => setBuilderId(e.target.value)}
            className="border border-gray-300 rounded p-2 w-64"
             >
            <option value="">-- Choose a Builder --</option>
            {builders.map((b, idx) => (
            <option key={idx} value={b}>
                {b}
            </option>
            ))}
        </select>            
        <button onClick={fetchData}>Fetch Project Data</button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && projectData.length > 0 && (
              <div className="p-4">
                      <h1 className="text-lg font-bold mb-4">Projects</h1>
                      <ProjectTable projects={projectData} />
                </div>
                // </>

      )}
    </div>
  );
}