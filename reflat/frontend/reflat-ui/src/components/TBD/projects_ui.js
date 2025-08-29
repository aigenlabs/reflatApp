
export default function ProjectTable({ projects }) {
  return (
          projects.map((project, idx) => (
            <div className="card">
                <h2>{project.project_name}</h2>
                <h2>{project.project_location}</h2>
                <h2>{project.project_city}</h2>
                <h2>{project.configuration}</h2>
                <h2>{project.desnsity_per_acre}</h2>
                <h2>{project.total_acres}</h2>
                <h2>{project.total_floors} Floors</h2>
                <h2>{project.total_towers} Towers</h2>
                <h2>{project.total_units} Units</h2>
                <h2>{project.unit_sizes}</h2>
                <h2>{project.units_perfloor} per Floor</h2>
                 <a
                  href={`https://${project.project_website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  Visit Website
                </a>
                <a
                  href={project.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={project.file_name || "brochure.pdf"} // ✅ forces download
                  className="download-btn"
                >
                  📄 Download Brochure
                </a>

            </div>
          ))
  );
}
