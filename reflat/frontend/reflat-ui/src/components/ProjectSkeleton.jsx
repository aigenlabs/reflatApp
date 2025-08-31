import React from "react";

function ProjectSkeleton() {
  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}>
      <div className="card shadow-sm" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 🔹 Responsive Thumbnail placeholder (maintains aspect ratio) */}
        <div
          className="placeholder col-12"
          style={{
            width: '100%',
            backgroundColor: '#e9ecef',
            borderBottom: '1px solid #dee2e6',
            // modern browsers: keep 16:9 aspect ratio; fallback padding for older browsers
            aspectRatio: '16/9',
            paddingTop: 0,
            flexShrink: 0,
            display: 'block',
          }}
        />

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12 }}>
          {/* Title Placeholder */}
          <div className="placeholder-glow" style={{ height: 28 }}>
            <span className="placeholder col-10" style={{ height: '100%', display: 'inline-block' }}></span>
          </div>

          {/* Location Placeholder */}
          <div className="placeholder-glow" style={{ height: 20 }}>
            <span className="placeholder col-8" style={{ height: '100%', display: 'inline-block' }}></span>
          </div>

          {/* Spacer to keep buttons at bottom */}
          <div style={{ flex: 1 }} />

          {/* Buttons Placeholder - wider buttons to match card width */}
          <div style={{ display: 'flex', gap: 12 }}>
            <span className="placeholder btn btn-sm" style={{ height: 44, display: 'inline-block', width: '48%' }}></span>
            <span className="placeholder btn btn-sm" style={{ height: 44, display: 'inline-block', width: '48%' }}></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectSkeleton;
