import React, { useState } from "react";
import axios from "axios";
import ProjectCard from "./components/ProjectCard";
// import AmenitiesList from "./components/AmenitiesList";
import "./styles.css";

function App() {
  const [builderId, setBuilderId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = () => {
    if (!builderId || !projectId) {
      alert("Please enter both Builder ID and Project ID");
      return;
    }
    setLoading(true);
    axios
      .get(`http://localhost:8000/project_data`, {
        params: { builder_id: builderId, project_id: projectId }
      })
      .then(res => {
        console.log("Backend response:", res.data); // ✅ Prints JSON to browser console
        setProjectData(res.data); // Because FastAPI returns {"builder_id":..., "project_id":..., "data": {...}}
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  return (
    <div className="container">
      <h1>Real Estate Project Viewer</h1>

      <div className="input-group">
        <input
          type="text"
          placeholder="Enter Builder ID"
          value={builderId}
          onChange={(e) => setBuilderId(e.target.value)}
        />
        <input
          type="text"
          placeholder="Enter Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
        <button onClick={fetchData}>Fetch Project Data</button>
      </div>

      {loading && <p>Loading...</p>}
      {/* console.loading({projectData}) */}
      {projectData && (
        <>
          <ProjectCard project={projectData} />
        </>
      )}
    </div>
  );
}

export default App;
