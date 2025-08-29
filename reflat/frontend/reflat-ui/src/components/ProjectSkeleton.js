import React from "react";

function ProjectSkeleton() {
  return (
    <div className="col-md-4 mb-3">
      <div className="card shadow-sm">
        {/* 🔹 Thumbnail placeholder */}
        <div
          className="placeholder col-12"
          style={{
            height: "150px",
            backgroundColor: "#e9ecef",
            borderBottom: "1px solid #dee2e6",
          }}
        ></div>

        <div className="card-body">
          {/* Title Placeholder */}
          <div className="placeholder-glow mb-2">
            <span className="placeholder col-8"></span>
          </div>

          {/* Location Placeholder */}
          <div className="placeholder-glow mb-3">
            <span className="placeholder col-6"></span>
          </div>

          {/* Buttons Placeholder */}
          <div className="d-flex gap-2">
            <span className="placeholder col-4 btn btn-sm"></span>
            <span className="placeholder col-4 btn btn-sm"></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectSkeleton;
