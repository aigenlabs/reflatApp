import React from "react";

function ProjectCard({ project }) {
  const {
    name,
    city,
    location,
    unitSizes,
    configuration,
    totalAcres,
    totalTowers,
    totalUnits,
    unitsPerFloor,
    totalFloors,
    densityPerAcre,
    brochure,
    builderId,
    builderName,
    website,
    logo,
  } = project || {};

  const brochureUrl = brochure || null;
  const imgUrl = logo || null;
  // const downloadName = `${(name || "brochure").replace(/\s+/g, "_")}.pdf`;

  // Safer FA Free icon names (swap if you’re on Pro)
  const ICONS = {
    acres: "fa-leaf",              // or fa-tree (both are Free)
    towers: "fa-building",
    units: "fa-cubes",             // replaces fa-cubes-stacked
    perFloor: "fa-layer-group",
    floors: "fa-building-columns",
    density: "fa-chart-column",
  };

  const StatItem = ({ icon, label, value }) =>
    value ? (
      <li className="col-6 d-flex align-items-center gap-1 mb-1">
        <i className={`fa-solid ${icon} text-primary`} aria-hidden="true" />
        <span className="small">{label}: {value}</span>
      </li>
    ) : null;

  return (
    <div className="card card-tight h-100 shadow-sm border-0">
      <div className="card-body p-2 d-flex flex-column">

        {/* Header: logo • title • website */}
        <div className="d-flex align-items-center gap-5">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={`${builderName || builderId || ""} logo`}
              width="64"
              height="64"
              // className="rounded border"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
          ) : (
            <div style={{ width: 40, height: 40 }} />
          )}
          <div className="min-w-0">
            <div className="card-title-tight text-truncate" title={name || "Project"}>
              {name || "Project"}
            </div>

            {(city || location) && (
              <div className="d-flex align-items-center gap-1 mt-1 small text-muted">
                <i className="fa-solid fa-location-dot text-primary" aria-hidden="true" />
                <span
                  className="text-truncate"
                  title={`${location || ""}${location && city ? ", " : ""}${city || ""}`}
                >
                  {location}{location && city ? ", " : ""}{city}
                </span>
              </div>
            )}
          </div>

          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-link btn-icon ms-auto"
              title="Open website"
              aria-label="Open website"
            >
              <i className="fa-solid fa-globe" />
            </a>
          )}
        </div>

        {/* Badges (kept outside header for cleaner wrapping) */}
        <div className="d-flex flex-wrap gap-2 mt-2">
          {unitSizes && (
            <span className="badge badge-soft">
              <i className="fa-solid fa-ruler-combined me-1 text-primary" aria-hidden="true" />
              {unitSizes}
            </span>
          )}
          {configuration && (
            <span className="badge badge-soft">
              <i className="fa-solid fa-bed me-1 text-primary" aria-hidden="true" />
              {configuration}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <ul className="list-unstyled row g-1 mt-2 small mb-0">
          <StatItem icon={ICONS.acres} label="Acres" value={totalAcres} />
          <StatItem icon={ICONS.towers} label="Towers" value={totalTowers} />
          <StatItem icon={ICONS.floors} label="Floors" value={totalFloors} />
          <StatItem icon={ICONS.perFloor} label="perFloor" value={unitsPerFloor} />
          <StatItem icon={ICONS.units} label="Units" value={totalUnits} />
          <StatItem icon={ICONS.density} label="Density" value={densityPerAcre} />
        </ul>

        {/* Actions */}
        <div className="d-flex gap-1 mt-2">
          {brochureUrl ? (
            <>
              <a
                className="btn btn-sm btn-outline-primary flex-fill d-inline-flex align-items-center justify-content-center gap-1"
                href={brochureUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open brochure"
                aria-label="Open brochure"
              >
                <i className="fa-solid fa-file-pdf" aria-hidden="true" /> View
              </a>
              {/* If you re-enable downloads later, ensure the bucket sends proper CORS + headers */}
              {/* <a
                className="btn btn-sm btn-primary flex-fill d-inline-flex align-items-center justify-content-center gap-1"
                href={brochureUrl}
                download={downloadName}
                title="Download brochure"
                aria-label="Download brochure"
              >
                <i className="fa-solid fa-download" aria-hidden="true" /> Download
              </a> */}
            </>
          ) : (
            <button className="btn btn-sm btn-outline-secondary w-100" disabled>
              Brochure unavailable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;
