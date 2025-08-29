import React, { useEffect, useRef, useState } from "react";
import { XCircle, SlidersHorizontal } from "lucide-react";

/**
 * Logo left, chips (incl. Reset + Filters) in remaining space.
 * Chips wrap; their multi-rows are vertically centered against the logo.
 */
export default function SearchBar({
  variant = "topbar",
  logoSrc = "../assets/images/reflat_logo.png",
  logoHeight = 100, // sensible default for visible logo + vertical centering space
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
  chips = [], // (kept if you want extra chips later)
  onChipClick,
  onReset = () => {},
  onFilter, // optional external hook
}) {
  // Drawer state
  const [open, setOpen] = useState(false);

  // Temp drawer state (safe to cancel)
  const [tmpCity, setTmpCity] = useState(selectedCity);
  const [tmpLocation, setTmpLocation] = useState(selectedLocation);
  const [tmpBuilder, setTmpBuilder] = useState(selectedBuilder);

  // Sync temp with external changes
  useEffect(() => setTmpCity(selectedCity), [selectedCity]);
  useEffect(() => setTmpLocation(selectedLocation), [selectedLocation]);
  useEffect(() => setTmpBuilder(selectedBuilder), [selectedBuilder]);

  const drawerRef = useRef(null);

  // Open / Close
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

  // Apply from drawer
  const applyFilters = () => {
    const cityChanged = tmpCity !== selectedCity;
    const locChanged = tmpLocation !== selectedLocation;

    setSelectedCity(tmpCity);
    setSelectedLocation(tmpLocation);

    const builderUnavailable =
      builderDisabled || builders.length === 0 || !tmpLocation;
    if (!cityChanged && !locChanged && !builderUnavailable) {
      setSelectedBuilder(tmpBuilder);
    } else {
      setSelectedBuilder("");
    }
    setOpen(false);
  };

  // Reset
  const clearAll = () => {
    onReset();
    setOpen(false);
  };

  // Disabled states for drawer selects
  const isCityDisabled = cities.length === 0;
  const isLocationDisabled = !tmpCity || locations.length === 0;
  const isBuilderSelectDisabled =
    builderDisabled || builders.length === 0 || !tmpLocation;

  // 🔽 Compact chip styles
  const chip = {
    border: "1px solid #eceff1",
    background: "#f8f9fa",
    borderRadius: 999,
    padding: "2px 8px",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: ".80rem",
    color: "#495057",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
    lineHeight: 1.2,
  };
  const chipLabel = { color: "#6c757d" };
  const chipValue = { fontWeight: 600 };
  const chipDisabled = { opacity: 0.6, cursor: "not-allowed" };

  return (
    <>
      {/* Row:(chips container that wraps and is vertically centered vs logo) */}
      <div
        className="d-flex align-items-center gap-2"
        style={{ flexWrap: "nowrap", padding: "6px 8px", width: "100%" }}
      >
        {/* Chips container */}
        <div
          className="d-flex"
          style={{
            flex: 1,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignContent: "center",     // center wrapped rows vertically
            minHeight: logoHeight,       // match logo to center multi-row block
          }}
        >
          {/* City chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit City"
            style={chip}
          >
            <span style={chipLabel}>City</span>
            <span style={chipValue}>{selectedCity || "Select"}</span>
          </button>

          {/* Locality chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit Locality"
            style={chip}
          >
            <span style={chipLabel}>Locality</span>
            <span style={chipValue}>{selectedLocation || "Select"}</span>
          </button>

          {/* Builder chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={openDrawer}
            aria-label="Edit Builder"
            title={builderDisabled ? "Select city & locality first" : ""}
            style={{ ...chip, ...(builderDisabled ? chipDisabled : null) }}
          >
            <span style={chipLabel}>Builder</span>
            <span style={chipValue}>{selectedBuilder || "All"}</span>
          </button>

          {/* Reset chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={onReset}
            aria-label="Reset Filters"
            style={{ ...chip, color: "#d9534f", fontWeight: 600 }}
          >
            <XCircle size={14} style={{ marginRight: 4 }} />
            Reset
          </button>

          {/* Filters chip */}
          <button
            type="button"
            className="btn p-0"
            onClick={(e) => {
              onFilter?.(e);
              openDrawer(e);
            }}
            aria-label="Open Filters"
            style={{ ...chip, background: "#e7f1ff", color: "#0d6efd", fontWeight: 600 }}
          >
            <SlidersHorizontal size={14} style={{ marginRight: 4 }} />
            Filters
          </button>
        </div>
      </div>

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
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
          <div className="mb-2">
            <label htmlFor="citySelect" className="form-label mb-1">City</label>
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
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Locality */}
          <div className="mb-2">
            <label htmlFor="locationSelect" className="form-label mb-1">Locality</label>
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
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Builder */}
          <div className="mb-3">
            <label htmlFor="builderSelect" className="form-label mb-1">Builder</label>
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
                <option key={b} value={b}>{b.toUpperCase()}</option>
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
