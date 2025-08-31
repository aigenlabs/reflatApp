// ProjectCard.jsx
import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import LanguageIcon from "@mui/icons-material/Language";

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
      sx={{
        // fixed height so all cards render identical sizes
        height: '320px',
        minHeight: '250px',
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
            {imgUrl ? (
              <Box
                component="img"
                src={imgUrl}
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
                label="Density"
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
              {brochureUrl ? (
                <>
                  <IconButton
                    component="a"
                    href={brochureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open brochure"
                    aria-label="Open brochure"
                    size="small"
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      width: 32,
                      height: 32,
                      p: 0,
                      minWidth: 32,
                      color: 'primary.main',
                    }}
                  >
                    <i className="fa-solid fa-file-pdf" aria-hidden="true" style={{ fontSize: 16, color: 'inherit' }} />
                  </IconButton>

                  {website && (
                    <IconButton
                      component="a"
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open website"
                      aria-label="Open website"
                      size="small"
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        width: 32,
                        height: 32,
                        p: 0,
                        minWidth: 32,
                        color: 'primary.main',
                      }}
                    >
                      <LanguageIcon fontSize="small" sx={{ color: 'primary.main' }} />
                    </IconButton>
                  )}
                </>
              ) : (
                <IconButton
                  size="small"
                  disabled
                  aria-label="No brochure"
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    width: 32,
                    height: 32,
                    p: 0,
                    minWidth: 32,
                    color: 'primary.main',
                  }}
                >
                  <i className="fa-solid fa-file-pdf" aria-hidden="true" style={{ fontSize: 16, color: 'inherit', opacity: 0.5 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
