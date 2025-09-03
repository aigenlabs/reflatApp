import React, { useEffect, useRef, useState } from "react";
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { FIREBASE_FUNCTIONS_URL } from './constants';
import { chipbarScrollable as sharedChipbar, chip as sharedChip, chipPrimary as sharedChipPrimary } from "./chipbarStyles";

/**
 * Compact chip bar (City / Locality / Builder + Reset / Filters)
 * - Lives under header (logo + Menu)
 * - Wraps as needed, no forced height
 * - Drawer uses classNames + inline styles so it works even if CSS isn't loaded
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
  onReset = () => {},
  onFilter, // optional external hook
}) {
  // Drawer state
  const [open, setOpen] = useState(false);

  // Temp drawer state (safe to cancel)
  const [tmpCity, setTmpCity] = useState(selectedCity);
  const [tmpLocation, setTmpLocation] = useState(selectedLocation);
  const [tmpBuilder, setTmpBuilder] = useState(selectedBuilder);
  const [availableBuilders, setAvailableBuilders] = useState([]);

  // Sync temp with external changes
  useEffect(() => setTmpCity(selectedCity), [selectedCity]);
  useEffect(() => setTmpLocation(selectedLocation), [selectedLocation]);
  useEffect(() => setTmpBuilder(selectedBuilder), [selectedBuilder]);

  // When the temporary locality changes in the drawer, fetch builders for that city+locality
  useEffect(() => {
    let cancelled = false;
    async function fetchBuildersForLocation() {
      if (!tmpCity || !tmpLocation) {
        setAvailableBuilders([]);
        return;
      }
      try {
        const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/location_project_data/${tmpCity}/${tmpLocation}`);
        if (!res.ok) throw new Error('Failed to fetch builders for location');
        const { projects: locProjects } = await res.json();
        if (cancelled) return;
        
        // Sanitize the data from the API to prevent runtime errors.
        const builderIds = (Array.isArray(locProjects) ? locProjects : [])
          .map(p => p?.builder_id) // 1. Safely get builder_id
          .filter(id => id)        // 2. Filter out falsy values (null, undefined, '')
          .map(String);            // 3. Convert all to strings

        // 4. Get unique values and sort them.
        const uniqueSortedIds = [...new Set(builderIds)].sort();
        
        setAvailableBuilders(uniqueSortedIds);

      } catch (err) {
        console.debug('fetchBuildersForLocation error', err);
        setAvailableBuilders([]);
      }
    }
    fetchBuildersForLocation();
    return () => { cancelled = true; };
  }, [tmpCity, tmpLocation]);

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

  // Reset via parent
  const clearAll = () => {
    onReset();
    setOpen(false);
  };

  // Disabled states for drawer selects
  const isCityDisabled = cities.length === 0;
  const isLocationDisabled = !tmpCity || locations.length === 0;
  const isBuilderSelectDisabled =
    builderDisabled || (!availableBuilders.length && builders.length === 0) || !tmpLocation;

  // Shared styles
  const chip = sharedChip;
  const chipValue = { fontWeight: 600 };

  return (
    <>
      {/* Chipbar under header */}
      <div className="chipbar" role="toolbar" aria-label="Filters" style={{
        ...sharedChipbar,
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        position: 'relative',
        margin: '0 auto',
      }}>
        {/* Filters icon (opens drawer) */}
        <button
          type="button"
          className="btn p-0"
          onClick={(e) => { onFilter?.(e); openDrawer(e); }}
          aria-label="Open Filters"
          title="Filters"
          style={{ ...chip, ...sharedChipPrimary, padding: "6px 8px" }}
        >
          <SearchIcon fontSize="small" />
        </button>

        {/* Selected values (summary chips) — read-only but clickable to open drawer */}
        {/* Combined summary chip */}
        <button
          type="button"
          className="btn p-0"
          onClick={openDrawer}
          aria-label="Change Filters"
          title="Change Filters"
          style={{ ...chip }}
        >
          <span style={chipValue}>
            {(selectedCity || "City —") + " · " + (selectedLocation || "Locality —") + " · " + (selectedBuilder || "All Builders")}
          </span>
        </button>
      </div>

      {/* Drawer (classNames + inline fallbacks) */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className={`filter-drawer ${open ? "open" : ""}`}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1050,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={closeDrawer}
      >
        {/* Panel */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="filter-drawer__panel"
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
            <label htmlFor="citySelect" className="form-label mb-1">
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
          <div className="mb-2">
            <label htmlFor="locationSelect" className="form-label mb-1">
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
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="builder-select" style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#555' }}>Builder</label>
            <select
              id="builder-select"
              value={tmpBuilder}
              onChange={(e) => setTmpBuilder(e.target.value)}
              disabled={isBuilderSelectDisabled}
              style={selectStyle(isBuilderSelectDisabled)}
            >
              <option value="">All Builders</option>
              {availableBuilders.map((b) => (
                <option key={b} value={b}>
                  {b.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="actions" style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="button"
              className="drawer-apply btn btn-primary btn-sm"
              onClick={applyFilters}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm text-muted ms-auto p-0"
              onClick={clearAll}
              title="Reset filters"
              aria-label="Reset Filters"
              style={{ color: '#d9534f', fontWeight: 700, padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}
            >
              <CloseIcon fontSize="small" style={{ marginRight: 8, color: '#d9534f' }} />
              <span style={{ color: '#d9534f' }}>Reset</span>
            </button>
          </div>
        </div>

        {/* Backdrop (inline fallback for opacity/pointer events) */}
        <div
          className="filter-drawer__backdrop"
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

function selectStyle(disabled) {
  return {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: disabled ? '#f2f2f2' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
  };
}
