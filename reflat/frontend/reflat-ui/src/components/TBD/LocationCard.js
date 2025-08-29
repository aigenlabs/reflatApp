import React, { useEffect, useState } from "react";
import axios from "axios";

export default function FetchLocationData(){
    const [city, setCity] = useState("");
    const [location, setLocation] = useState("");
    // const [locationData, setLocationData] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchData = () => {
        if (!city || !location) {
        alert("Please enter both City and Location");
        return;
        }
        setLoading(true);
        axios
        .get(`http://localhost:8000/location_data`, {
            params: { city: city, location: location }
        })
        .then(res => {
            console.log("Backend response:", res.data); // ✅ Prints JSON to browser console
            // res.data.projects.map((project)=>fetch_projectData(project.builder_id, project.project_id))
            Fetch_projectData(res.data.projects)
            // setLocationData(res.data); // Because FastAPI returns {"builder_id":..., "project_id":..., "data": {...}}
            setLoading(false);
        })
        .catch(err => {
            console.error(err);
            setLoading(false);
        });
        return (
            <div className="container">
                <h1>Real Estate Project Viewer</h1>
        
                <div className="input-group">
                <input
                    type="text"
                    placeholder="Enter City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Enter Location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                />
                <button onClick={fetchData}>Fetch Project Data</button>
                </div>
            </div>
            );
    }
}

function Fetch_projectData(pdata){
    useFetch(pdata)
}
function useFetch(pdata){
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    // const [builderId, setBuilderId] = useState("");
    // const [projectId, setProjectId] = useState("");
    // const [projectData, setProjectData] = useState(null);
    // const [loading, setLoading] = useState(false);
    console.log("HHHH")
    useEffect(()=>{
        async function fetchData() {
            setLoading(true);
            const promises=pdata.map(prj=>
                fetch(`http://localhost:8000/project_data/${prj.builder_id}/${prj.project_id}`)
                .then(res=>res.json()));

            const results = await Promise.all(promises);
            setData(results);
            setLoading(false);
        }
        fetchData();
    },[]);
    return { data, loading };
}
//     // const fetchData = () => {
//     if (!builderId || !projectId) {
//       alert("Please enter both Builder ID and Project ID");
//       return;
//     }
//     // setLoading(true);
//     axios
//       .get(`http://localhost:8000/project_data`, {
//         params: { builder_id: builderId, project_id: projectId }
//       })
//       .then(res => {
//         console.log("Backend response:", res.data); // ✅ Prints JSON to browser console
//         // setProjectData(res.data); // Because FastAPI returns {"builder_id":..., "project_id":..., "data": {...}}
//         // setLoading(false);
//       })
//       .catch(err => {
//         console.error(err);
//         // setLoading(false);
//       });
// //   };
//   }