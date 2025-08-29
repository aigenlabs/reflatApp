import React, { useEffect, useState } from "react";
import axios from "axios";
import ProjectTable from "./projects_ui";

export default function FetchLocationData() {
  const [city, setCity] = useState("");
  const [location, setLocation] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectData, setProjectData] = useState([]);
  const [loading, setLoading] = useState(false);

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

      const projectList = res.data.projects;
      setProjects(projectList);

      // Step 2: Fetch all project details in parallel
      const promises = projectList.map((prj) =>
        fetch(`http://localhost:8000/project_data/${prj.builder_id}/${prj.project_id}`)
          .then((res) => res.json())
      );

      const results = await Promise.all(promises);
      console.log("Project details:", results);
      const prj_list = results.filter(r => r != null);
      console.log("PRJ LIST:",prj_list)
      setProjectData(prj_list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Get Projects based on Location</h1>

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
