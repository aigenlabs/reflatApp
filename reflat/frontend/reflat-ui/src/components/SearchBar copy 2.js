import React, { useEffect, useRef, useState } from "react";
import { XCircle, SlidersHorizontal } from "lucide-react";
/**
 * Compact chip toolbar + slide-in drawer
 * - Tighter chips & toolbar spacing
 * - Full-bleed card on mobile to gain width
 * - "Filters" label hides on XS to save space (icon remains)
 */
export default function SearchBar({
  variant = "topbar",
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
  // onReset = () => {},
  chips = [],
  onChipClick,
  onReset,
  onFilter,
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

    // Apply builder only if deps unchanged & available
    const builderUnavailable =
      builderDisabled || builders.length === 0 || !tmpLocation;
    if (!cityChanged && !locChanged && !builderUnavailable) {
      setSelectedBuilder(tmpBuilder);
    } else {
      setSelectedBuilder(""); // keep consistent with parent logic
    }
    setOpen(false);
  };

  // Reset via parent (inside drawer only)
  const clearAll = () => {
    onReset();
    setOpen(false);
  };

  // Disabled states for drawer selects
  const isCityDisabled = cities.length === 0;
  const isLocationDisabled = !tmpCity || locations.length === 0;
  const isBuilderSelectDisabled =
    builderDisabled || builders.length === 0 || !tmpLocation;

  // 🔽 Tighter chip styles
  const chip = {
    border: "1px solid #eceff1",
    background: "#f8f9fa",
    borderRadius: 999,
    padding: "2px 8px",           // was 4px 10px
    display: "inline-flex",
    alignItems: "center",
    gap: 4,                       // was 6
    fontSize: ".80rem",           // was .85rem
    color: "#495057",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  };
  const chipLabel = { color: "#6c757d" };
  const chipValue = { fontWeight: 600 };
  const chipDisabled = { opacity: 0.6, cursor: "not-allowed" };

  // Toolbar (no wrap; horizontal scroll if overflow)
  const Toolbar = (
    <div
      className="filter-toolbar d-flex align-items-center"
      style={{
        flexWrap: "nowrap",
        gap: 6,                    // tighter gap between chips
        overflowX: "auto",
        minWidth: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
       {/* Filters trigger (icon + label; label hidden on XS) */}
      <button
        type="button"
        className="btn p-0 filters-btn"
        onClick={openDrawer}
        aria-label="Open filters"
        title="Open filters"
        style={{ textDecoration: "none", whiteSpace: "nowrap", flex: "0 0 auto" }}
      >
        ☰ {/*<span className="d-none d-sm-inline">Filters</span>*/}
      </button>

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

    </div>
  );

  return (
    <>
      {/* Wrapper:
         - topbar variant: inline with header/logo (no card)
         - default variant: uses a card; full-bleed on mobile via CSS */}
      {variant === "topbar" ? (
        Toolbar
      ) : (
        <div className="card filter-card shadow-sm py-2 px-2 mb-2">{Toolbar}</div>
      )}

      {/* Drawer (inline-style controlled; mobile-safe) */}
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
