// ProjectCard.jsx
import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { useNavigate } from 'react-router-dom';
import { getCachedImage } from './imageCache';
import { FIREBASE_STORAGE_URL } from './constants';

/**
 * ProjectCard
 * - Equal-height: Card fills its Grid cell (height: 100%)
 * - No horizontal overflow: pervasive minWidth: 0 and text truncation
 * - Actions pinned to bottom with mt: 'auto'
 *
 * Expected project fields:
 *  name, city, location, unitSizes, configuration,
 *  totalAcres, totalTowers, totalUnits, unitsPerFloor, totalFloors, densityPerAcre,
 *  brochure, builderId, builderName, website, logo
 */
export default function ProjectCard({ project }) {
  // Prefer structured Key_Project_details emitted by the scraper when available
  const kd = (project && project.key_project_details) || {};

  // keep some identifiers from top-level project
  const { builderId, builderName, logo, projectId } = project || {};

  // Map values from Key_Project_details (snake_case) into the camelCase props UI expects,
  // falling back to existing top-level fields for backwards compatibility.
  const name = kd.project_name;
  const city = kd.project_city;
  const location = kd.project_location;
  // const unitSizes = kd.unit_sizes;
  const unitSizes = kd.flat_sizes;
  const configuration = kd.config;
  const totalAcres = kd.total_acres;
  const totalTowers = kd.total_towers;
  const totalUnits = kd.total_units;
  const unitsPerFloor = kd.units_per_floor;
  const totalFloors = kd.total_floors;
  // Prefer explicit flats_per_acre where available; fall back to legacy flats_density or other density fields
  const densityPerAcre = kd.flats_per_acre;
  const reraNumber = kd.rera_number;

  const navigate = useNavigate();

  // Determine image source: prefer explicit project.logo, then canonical key_project_details fields
  // const rawLogo = logo || kd.builder_logo || kd.project_logo || project?.builder_logo || project?.project_logo || null;
  const rawLogo = kd.project_logo || null;
  // console.log("ProjectCard: rawLogo=", rawLogo);
  // Build a full storage URL when the logo is a relative storage path like 'logos/...' or includes builder/project
  const buildStorageUrl = (raw) => {
    if (!raw) return null;
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    if (!s) return null;
    if (s.startsWith('http')) return s;
    // known media folders
    const KNOWN = ['logos','photos','banners','layouts','floor_plans','amenities','brochures','news','documents'];
    const parts = s.split('/').filter(Boolean);
    let candidatePath = s;
    if (parts.length >= 4) {
      // probably already contains builder/project prefix: builder/project/folder/filename
      candidatePath = parts.join('/');
    } else if (parts.length >= 2 && KNOWN.includes(parts[0])) {
      // path like 'logos/filename' -> prefix with builderId/projectId
      if (builderId && projectId) candidatePath = `${builderId}/${projectId}/${s}`;
    } else if (parts.length >= 3) {
      // ensure path is used as-is
      candidatePath = parts.join('/');
    } else if (parts.length === 1 && builderId && projectId) {
      // single filename -> assume logos
      candidatePath = `${builderId}/${projectId}/logos/${s}`;
    }
    if (!FIREBASE_STORAGE_URL) return null;
    const base = FIREBASE_STORAGE_URL.replace(/\/+$/, '');
    return `${base}/${candidatePath}`;
  };

  const storageLogoUrl = buildStorageUrl(rawLogo);
  // console.log("ProjectCard: storageLogoUrl=", storageLogoUrl);
  const [cachedLogo, setCachedLogo] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const toFetch = storageLogoUrl || rawLogo;
    if (!toFetch) return;
    (async () => {
      try {
        const v = await getCachedImage(toFetch);
        if (alive) setCachedLogo(v);
        console.log("ProjectCard: cachedLogo=", v);
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [storageLogoUrl, rawLogo]);

  // FontAwesome (Free) icon classnames
  const ICONS = {
    acres: "fa-leaf",
    towers: "fa-building",
    units: "fa-cubes",
    perFloor: "fa-layer-group",
    floors: "fa-building-columns",
    density: "fa-chart-column",
  };

  const StatItem = ({ icon, label, value }) =>
    value ? (
      <Box
        sx={{
          // grid cell content: fill the cell, keep tight spacing
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mb: 0.25,
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        <Box component="span" sx={{ flex: '0 0 auto', minWidth: 0, mr: 0.5, display: 'inline-flex', alignItems: 'center' }}>
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </Box>
        <Box
          component="span"
          sx={{
            typography: 'body2',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
          title={`${label}: ${value}`}
        >
          {label}: {value}
        </Box>
      </Box>
    ) : null;

  return (
    <Card
      elevation={0}
      onClick={() => {
        // safe debug log using available identifiers
        console.debug('Card clicked', { builderId, projectId, builderName });
        if (builderId && projectId) navigate(`/project/${encodeURIComponent(builderId)}/${encodeURIComponent(projectId)}`);
      }}
      sx={{
        cursor: 'pointer',
        // fixed height so all cards render identical sizes
        height: '320px',
        minHeight: '200px',
        maxHeight: '320px',
        bgcolor: "background.paper",
        borderRadius: 2,
        boxShadow:
          "0 4px 24px 0 rgba(60,72,88,0.18), 0 1.5px 4px 0 rgba(60,72,88,0.10)",
        display: "flex",
        flexDirection: "column",
        // keep a stable width inside the grid cell
        width: "100%",
        maxWidth: "100%",      // never exceed its grid cell
        overflow: 'hidden',     // clip any internal overflow
         boxSizing: "border-box",
         minWidth: 0, // prevent children causing overflow
        flex: "1 1 0",          // allow card to shrink/grow to grid cell
         alignSelf: "stretch",
         transition: "box-shadow 0.2s",
         "&:hover": {
           boxShadow:
             "0 8px 32px 0 rgba(60,72,88,0.28), 0 2px 8px 0 rgba(60,72,88,0.16)",
         },
       }}
     >
      <CardContent
        sx={{
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          flexGrow: 1, // allow content to occupy all height
          justifyContent: 'space-between',
          minWidth: 0,
          width: "100%",
          overflow: 'hidden',
          boxSizing: "border-box",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {/* Header: logo • title • location */}
          <Box
            display="flex"
            alignItems="center"
            gap={2}
            flexWrap="wrap"
            minWidth={0}
          >
            {/* Render only when we have an object URL from cache (cachedLogo) or when rawLogo is a public HTTP URL.
            // Do NOT set the <img> src to the constructed storageLogoUrl because that causes the browser
            // to fetch the private storage.googleapis.com URL directly (403). getCachedImage will fetch
            // via the signed_url/proxy flow and populate cachedLogo when ready.
            {cachedLogo ? (
              <Box
                component="img"
                src={cachedLogo}
                 alt={`${builderName || builderId || ""} logo`}
                 sx={{
                  width: 48,
                  height: 48,
                  maxWidth: 48,
                  maxHeight: 48,
                  objectFit: "contain",
                  borderRadius: 1,
                  bgcolor: "background.default",
                  flexShrink: 0, // don't let the logo stretch
                  // ensure image cannot force card width
                  display: 'block',
                }}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (rawLogo && typeof rawLogo === 'string' && rawLogo.startsWith('http')) ? (
              // If rawLogo already points to a public HTTP(S) URL (not our private GCS path), render it directly.
              <Box
                component="img"
                src={rawLogo}
                 alt={`${builderName || builderId || ""} logo`}
                 sx={{ width: 48, height: 48, maxWidth: 48, maxHeight: 48, objectFit: "contain", borderRadius: 1, bgcolor: "background.default", flexShrink: 0, display: 'block' }}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              />
            ) : (
              <Box sx={{ width: 48, height: 48, flexShrink: 0 }} />
            ) */}

            {cachedLogo ? (
              <Box
                component="img"
                src={cachedLogo}
                 alt={`${builderName || builderId || ""} logo`}
                 sx={{
                  width: 48,
                  height: 48,
                  maxWidth: 48,
                  maxHeight: 48,
                  objectFit: "contain",
                  borderRadius: 1,
                  bgcolor: "background.default",
                  flexShrink: 0, // don't let the logo stretch
                  // ensure image cannot force card width
                  display: 'block',
                }}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (rawLogo && typeof rawLogo === 'string' && rawLogo.startsWith('http')) ? (
              // If rawLogo already points to a public HTTP(S) URL (not our private GCS path), render it directly.
              <Box
                component="img"
                src={rawLogo}
                 alt={`${builderName || builderId || ""} logo`}
                 sx={{ width: 48, height: 48, maxWidth: 48, maxHeight: 48, objectFit: "contain", borderRadius: 1, bgcolor: "background.default", flexShrink: 0, display: 'block' }}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              />
            ) : (
              <Box sx={{ width: 48, height: 48, flexShrink: 0 }} />
            )}

            <Box minWidth={0} flex={1}>
              <Typography
                variant="subtitle1"
                noWrap
                title={name || "Project"}
                sx={{ fontWeight: 600 }}
              >
                {name || "Project"}
              </Typography>

              {(city || location) && (
                <Box
                  display="flex"
                  alignItems="center"
                  gap={1}
                  mt={0.5}
                  sx={{ minWidth: 0, // make location icon blue
                    '& i': { color: 'primary.main' }
                  }}
                >
                  <i className="fa-solid fa-location-dot" aria-hidden="true" />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={`${location || ""}${
                      location && city ? ", " : ""
                    }${city || ""}`}
                    sx={{ minWidth: 0 }}
                  >
                    {location}
                    {location && city ? ", " : ""}
                    {city}
                  </Typography>
                </Box>
              )}

              {/* Ensure RERA is visible: small caption under location */}
              {reraNumber && (
                <Box sx={{ mt: 0.5, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" title={`RERA: ${reraNumber}`} sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    RERA: {reraNumber}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* Badges */}
          <Box
            display="flex"
            flexWrap="wrap"
            gap={1}
            mt={2}
            sx={{ overflow: "hidden", minWidth: 0 }}
          >
            {configuration && (
              <Box
                component="span"
                sx={{
                  bgcolor: "grey.100",
                  color: "text.primary",
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  fontSize: "0.85em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  maxWidth: "50%",
                  width:"125px", 
                  mb: 0.5,
                  boxSizing: 'border-box',
                  '& i': { color: 'primary.main' }
                }}
                title={configuration}
              >
                <i className="fa-solid fa-bed" aria-hidden="true" />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    maxWidth: '100%'
                  }}
                >
                  {configuration}
                </span>
              </Box>
            )}
            {unitSizes && (
              <Box
                component="span"
                sx={{
                  bgcolor: "grey.100",
                  color: "text.primary",
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  fontSize: "0.85em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  maxWidth: "50%",
                  width:"125px", 
                  mb: 0.5,
                  boxSizing: 'border-box',
                  // keep badge icon blue while text stays normal
                  '& i': { color: 'primary.main' }
                }}
                title={unitSizes}
              >
                <i className="fa-solid fa-ruler-combined" aria-hidden="true" />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    maxWidth: '100%'
                  }}
                >
                  {unitSizes}
                </span>
              </Box>
            )}

            {/* RERA moved to bottom actions to avoid disturbing layout */}

          </Box>

          {/* Stats grid + Actions grouped */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 0.5, // reduced horizontal gap between columns
                rowGap: 0.25,
                mt: 2,
                mb: 0,
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
                minWidth: 0,
                // make any inline icons inside stats blue
                '& i': { color: 'primary.main' }
              }}
            >
              <StatItem icon={ICONS.acres} label="Acres" value={totalAcres} />
              <StatItem icon={ICONS.towers} label="Towers" value={totalTowers} />
              <StatItem icon={ICONS.floors} label="Floors" value={totalFloors} />
              <StatItem
                icon={ICONS.perFloor}
                label="perFloor"
                value={unitsPerFloor}
              />
              <StatItem icon={ICONS.units} label="Units" value={totalUnits} />
              <StatItem
                icon={ICONS.density}
                label="Flats / acre"
                value={densityPerAcre}
              />
            </Box>

            {/* Actions pinned to bottom */}
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                mt: 'auto', // push to bottom of this group
                justifyContent: 'flex-start',
                flexWrap: 'wrap',
                maxWidth: '100%',
                minWidth: 0,
                flexShrink: 0, // don't let actions force parent to grow
              }}
            >
              {/* Removed brochure and website icons; card is now fully clickable */}
              {reraNumber && (
                <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    RERA: {reraNumber}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
