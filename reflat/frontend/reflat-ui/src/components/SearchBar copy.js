import React, { useEffect, useRef, useState } from "react";

/**
 * Compact filter bar with chips + slide-in drawer
 * - Chips show current selections in one slim row
 * - Tap any chip or the "Filters" button to open the drawer
 * - Drawer contains full selects (City → Locality → Builder)
 * - Respects builderDisabled from parent
 *
 * Props:
 *  builders: string[]
 *  selectedBuilder: string
 *  setSelectedBuilder: (s: string) => void
 *  cities: string[]
 *  locations: string[]
 *  selectedCity: string
 *  setSelectedCity: (s: string) => void
 *  selectedLocation: string
 *  setSelectedLocation: (s: string) => void
 *  builderDisabled?: boolean
 *  onReset?: () => void
 */
export default function SearchBar({
  builders = [],
  selectedBuilder = "",
  setSelectedBuilder = () => {},
  cities = [],
  locations = [],
  selectedCity = "",
  setSelectedCity = () => {},
  selectedLocation = "",
  setSelectedLocation = () => {},
  builderDisabled = true,
  onReset = () => {},
}) {
  // Drawer open state
  const [open, setOpen] = useState(false);

  // Temp state for drawer (lets user cancel)
  const [tmpCity, setTmpCity] = useState(selectedCity);
  const [tmpLocation, setTmpLocation] = useState(selectedLocation);
  const [tmpBuilder, setTmpBuilder] = useState(selectedBuilder);

  // Keep temp state in sync if parent changes from elsewhere
  useEffect(() => setTmpCity(selectedCity), [selectedCity]);
  useEffect(() => setTmpLocation(selectedLocation), [selectedLocation]);
  useEffect(() => setTmpBuilder(selectedBuilder), [selectedBuilder]);

  const drawerRef = useRef(null);

  // Open / Close helpers
  const openDrawer = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setTmpCity(selectedCity);
    setTmpLocation(selectedLocation);
    setTmpBuilder(selectedBuilder);
    setOpen(true);
  };
  const closeDrawer = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpen(false);
  };

  // ESC to close
  useEffect(() => {
    const onKey = (ev) => ev.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Apply filters from drawer to parent
  const applyFilters = () => {
    const cityChanged = tmpCity !== selectedCity;
    const locChanged = tmpLocation !== selectedLocation;

    setSelectedCity(tmpCity);
    setSelectedLocation(tmpLocation);

    // Only apply builder if city/location didn’t change and builder is available
    if (!cityChanged && !locChanged && !(builderDisabled || builders.length === 0 || !tmpLocation)) {
      setSelectedBuilder(tmpBuilder);
    } else {
      // Keep consistent with parent logic: reset builder when deps change
      setSelectedBuilder("");
    }

    setOpen(false);
  };

  // Reset via parent
  const clearAll = () => {
    onReset();
    setOpen(false);
  };

  // Effective disabled states (for drawer selects)
  const isCityDisabled = cities.length === 0;
  const isLocationDisabled = !tmpCity || locations.length === 0;
  const isBuilderSelectDisabled = builderDisabled || builders.length === 0 || !tmpLocation;

  // Inline styles (keeps this file self-contained)
  const chipStyle = {
    border: "1px solid #e9ecef",
    background: "#f8f9fa",
    borderRadius: 999,
    padding: "4px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: ".85rem",
    color: "#495057",
  };
  const chipLabelStyle = { color: "#6c757d" };
  const chipValueStyle = { fontWeight: 600 };
  const chipDisabledStyle = { opacity: 0.6, cursor: "not-allowed" };

  return (
    <>
      {/* Slim chip toolbar */}
      <div className="card shadow-sm py-2 px-3 mb-3">
        <div className="d-flex align-items-center gap-2 flex-wrap" style={{ overflowX: "auto" }}>
          {/* City chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit City"
            style={{ ...chipStyle }}
          >
            <span style={chipLabelStyle}>City</span>
            <span style={chipValueStyle}>{selectedCity || "Select"}</span>
          </button>

          {/* Locality chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit Locality"
            style={{ ...chipStyle }}
          >
            <span style={chipLabelStyle}>Locality</span>
            <span style={chipValueStyle}>{selectedLocation || "Select"}</span>
          </button>

          {/* Builder chip (reflects disabled state from parent) */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit Builder"
            title={builderDisabled ? "Select city & locality first" : ""}
            style={{ ...chipStyle, ...(builderDisabled ? chipDisabledStyle : null) }}
          >
            <span style={chipLabelStyle}>Builder</span>
            <span style={chipValueStyle}>{selectedBuilder || "All"}</span>
          </button>

          {/* Right-side actions */}
          <div className="ms-auto d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-link btn-sm text-muted p-0"
              onClick={openDrawer}
              aria-label="Open filters"
              title="Open filters"
              style={{ textDecoration: "none" }}
            >
              ☰ Filters
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm text-muted p-0"
              onClick={onReset}
              aria-label="Reset filters"
              title="Reset filters"
              style={{ textDecoration: "none" }}
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>

      {/* Drawer (inline-style controlled; reliable on mobile) */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        // Root container: only interactive when open
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1050,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Panel */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            height: "100%",
            width: "min(92vw, 360px)",
            background: "#fff",
            boxShadow: "-8px 0 24px rgba(0,0,0,.08)",
            padding: 16,
            transform: open ? "translateX(0)" : "translateX(100%)",
            transition: "transform .24s ease",
            zIndex: 2,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h6 className="m-0">Filters</h6>
            <button
              type="button"
              className="btn btn-link btn-sm text-muted p-0"
              onClick={closeDrawer}
              aria-label="Close"
              style={{ textDecoration: "none" }}
            >
              ✕
            </button>
          </div>

          {/* City */}
          <div className="mb-3">
            <label htmlFor="citySelect" className="form-label">
              City
            </label>
            <select
              id="citySelect"
              className="form-select form-select-sm"
              value={tmpCity}
              onChange={(e) => {
                setTmpCity(e.target.value);
                setTmpLocation("");
                setTmpBuilder("");
              }}
              disabled={isCityDisabled}
              title={isCityDisabled ? "No cities available" : ""}
            >
              <option value="">Select City</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          {/* Locality */}
          <div className="mb-3">
            <label htmlFor="locationSelect" className="form-label">
              Locality
            </label>
            <select
              id="locationSelect"
              className="form-select form-select-sm"
              value={tmpLocation}
              onChange={(e) => {
                setTmpLocation(e.target.value);
                setTmpBuilder("");
              }}
              disabled={isLocationDisabled}
              title={isLocationDisabled ? "Select a city to choose localities" : ""}
            >
              <option value="">Select Locality</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Builder */}
          <div className="mb-3">
            <label htmlFor="builderSelect" className="form-label">
              Builder
            </label>
            <select
              id="builderSelect"
              className="form-select form-select-sm"
              value={tmpBuilder}
              onChange={(e) => setTmpBuilder(e.target.value)}
              disabled={isBuilderSelectDisabled}
              title={
                isBuilderSelectDisabled
                  ? "Select city & locality to see available builders"
                  : ""
              }
            >
              <option value="">All Builders</option>
              {builders.map((b) => (
                <option key={b} value={b}>
                  {b.toUpperCase()}
                </option>
              ))}
            </select>
            {isBuilderSelectDisabled && (
              <small className="text-muted">Select city & locality to enable builder filter.</small>
            )}
          </div>

          {/* Actions */}
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>
              Apply
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeDrawer}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm text-muted ms-auto p-0"
              onClick={clearAll}
              title="Reset filters"
            >
              ↺ Reset
            </button>
          </div>
        </div>

        {/* Backdrop */}
        <div
          onClick={closeDrawer}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,.25)",
            opacity: open ? 1 : 0,
            transition: "opacity .24s ease",
            zIndex: 1,
            pointerEvents: open ? "auto" : "none",
          }}
        />
      </div>
    </>
  );
}
