import React from "react";

export default function ProjectTable({ projects }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-200 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 border">Project Name</th>
            <th className="px-4 py-2 border">City</th>
            <th className="px-4 py-2 border">Location</th>
            <th className="px-4 py-2 border">Builder</th>
            <th className="px-4 py-2 border">Website</th>
            <th className="px-4 py-2 border">Brochure</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((proj, idx) => (


            <tr key={idx} className="hover:bg-gray-50">
              <td className="px-4 py-2 border">{proj.project_name}</td>
              <td className="px-4 py-2 border">{proj.project_city}</td>
              <td className="px-4 py-2 border">{proj.project_location}</td>
              <td className="px-4 py-2 border">{proj.builder_id}</td>
              <td className="px-4 py-2 border">
                <a
                  href={`https://${proj.project_website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  {proj.project_website}
                </a>
              </td>
              <td className="px-4 py-2 border text-center">
                <a
                  // href={proj.file_url}
        
                  href={proj.file_url}
                  download={proj.brochure_file}
                  className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Download Brochure
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
