import React, { useEffect, useState } from "react";
import axios from "axios";
import ProjectTable from "./projects_ui";

export default function Fetch_Builder_Projects_Data() {
    const [builder_id, setBuilderId] = useState("");
    const [projectData, setProjectData] = useState([]);
    const [loading, setLoading] = useState(false);

    const builders=["myhome", "aparna"]
    
    const fetchData = async () => {
    if (!builder_id) {
      alert("Please enter Builder ID");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Fetch project IDs for given city + location
      const res = await axios.get(`http://localhost:8000/builder_projects_list`, {
        params: {builder_id}
      });
      console.log("Projects List API response:", res.data);

      setProjectData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

    return (
        <div className="container">
          <h1>Get Projects Based on Builder</h1>
    
          <div className="input-group">
            <select
              type="text"
              placeholder="Enter Builder"
              value={builder_id}
              onChange={(e) => setBuilderId(e.target.value)}
             >
                <option value="">-- Choose a Builder --</option>
                {builders.map((b, idx) => (
                <option key={idx} value={b}>
                    {b}
                </option>
                ))}
            </select>
            <button onClick={fetchData}>Fetch Projects Data</button>
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