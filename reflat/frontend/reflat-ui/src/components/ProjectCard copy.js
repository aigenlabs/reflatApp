import React from 'react';

function ProjectCard({ project }) {
  const {
    name,
    // projectId,
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
    logo
  } = project;
  const brochureUrl = brochure
    // ? `${process.env.PUBLIC_URL || ''}/data/${builderId}/brochures/${brochure}`
    // : null;
  const imgUrl = logo
    // ? `${process.env.PUBLIC_URL || ''}/data/${builderId}/logos/${logo}`
    // : null;
  return (
    <div className="card h-100 shadow-sm border-0">
      <div className="card-body d-flex flex-column">
        {/* <h2>{imgUrl}</h2> */}
        <img src={imgUrl} alt="React banner" width="100" height="50"/>
        <h5 className="card-title fw-semibold">{name}</h5>
        <h6 className="card-subtitle mb-2 text-muted">
          {builderName || (builderId ? builderId.toUpperCase() : '')}
        </h6>

        {/* Location, builder ID and project ID */}
        <p className="mb-2 small">
          <i className="fa-solid fa-location-dot me-1 text-primary"></i>
          {location}, {city}
        </p>
        {/* Badges for unit size and configuration */}
        <div className="d-flex flex-wrap gap-2 mb-3">
        <tr>
          <th>
          {unitSizes && (
            <span className="badge bg-light text-dark fw-normal">
              <i className="fa-solid fa-ruler-combined me-1 text-primary"></i>
              {unitSizes}
            </span>
          )}
          </th>
          <th>
              {configuration && (
              <span className="badge bg-light text-dark fw-normal">
                <i className="fa-solid fa-bed me-1 text-primary"></i>
                {configuration}
              </span>
             )}
          </th>
        </tr>
        </div>
        <table>
          <tr>
            <th>
                {totalAcres && (
                  <li className="mb-1 d-flex align-items-start">
                    <i className="fa-solid fa-tree me-2 text-primary"></i>
                    <span>Acres: {totalAcres}</span>
                  </li>
                )}
            </th>
            <th>
                {totalTowers && (
                <li className="mb-1 d-flex align-items-start">
                  <i className="fa-solid fa-building me-2 text-primary"></i>
                  <span>Towers: {totalTowers}</span>
                </li>
          )}
            </th>
            </tr>
          <tr>
            <th>
               {totalUnits && (
                <li className="mb-1 d-flex align-items-start">
                  <i className="fa-solid fa-cubes-stacked me-2 text-primary"></i>
                  <span>Units: {totalUnits}</span>
                </li>
              )}
            </th>
            <th>
                {unitsPerFloor && (
                  <li className="mb-1 d-flex align-items-start">
                    <i className="fa-solid fa-layer-group me-2 text-primary"></i>
                    <span>perFloor: {unitsPerFloor}</span>
                  </li>
                )}
            </th>
            </tr>
            <tr>
                <th>
                     {totalFloors && (
                      <li className="mb-1 d-flex align-items-start">
                        <i className="fa-solid fa-building-columns me-2 text-primary"></i>
                        <span>Floors: {totalFloors}</span>
                      </li>
                    )}
              </th>
              <th>
                  {densityPerAcre && (
                    <li className="mb-1 d-flex align-items-start">
                      <i className="fa-solid fa-chart-column me-2 text-primary"></i>
                      <span>Density: {densityPerAcre}</span>
                    </li>
                  )}
            </th>
          </tr>
        </table>
        {/* Detailed attributes list */}
        {/* <ul className="list-unstyled mb-4 small">
        </ul> */}
        <table>
          <tr>
            <th>
             {/* Brochure button (optional) */}
              <div className="mt-auto">
                {brochureUrl ? (
                  <a href={brochureUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      download={`${project.project_name}_brochure.pdf` || "brochure.pdf"}
                      className="btn btn-sm btn-outline-primary">
                    <i className="fa-solid fa-file-pdf me-2"></i>Brochure
                  </a>
                ) : (
                  <small className="text-muted">Brochure coming soon</small>
                )}
              </div>
            </th>
            <th>
                {website && (
                  <li className="mb-1 d-flex align-items-start">
                    <i className="fa-solid fa-globe me-2 text-primary"></i>
                    <span>
                      {/* Website:{' '} */}
                      <a href={website} target="_blank" rel="noopener noreferrer">
                        Visit website
                      </a>
                    </span>
                  </li>
                )}
            </th>
          </tr>
        </table>
      </div>
    </div>
  );
}

export default ProjectCard;
