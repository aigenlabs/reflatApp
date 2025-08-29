// import React from "react";

export default function ProjectCard({ project }) {
  if (!project) return <p>No project data available</p>;

  return (
    <div className="card">
      <h2>{project.project_name}</h2>
      <h2>{project.project_location}</h2>
      <h2>{project.project_city}</h2>
      <h2>{project.project_website}</h2>
      <a
        href={project.file_url}
        download={project.file_name || "brochure.pdf"} // ✅ forces download
        className="download-btn"
      >
        📄 Download Brochure
      </a>

    </div>
  );
}
