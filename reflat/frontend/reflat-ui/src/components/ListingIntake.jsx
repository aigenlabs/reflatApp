import React, { useEffect, useMemo, useState } from "react";
import { Wand2, Check, Loader2, RotateCcw, SlidersHorizontal, XCircle, Plus, Minus, ArrowUpDown } from "lucide-react";
import { EXTRACT_URL, FIREBASE_FUNCTIONS_URL } from "./constants";
import { chipbarNoScroll as sharedChipbarNoScroll, chip as sharedChip, chipDisabled as sharedChipDisabled, chipPrimary as sharedChipPrimary, chipDanger as sharedChipDanger } from "./chipbarStyles";
import IntakeListings from "./IntakeListings";

/**
 * ListingIntake
 * Props:
 *  - mode: "rent" | "resale"
 *  - extractUrl: string (POST { mode, message }) -> returns { listing: {...} }
 *  - submitUrl: string (POST { mode, listing })  -> returns { id, ok: true }
 */
export default function ListingIntake({
  // mode prop deprecated in favor of dropdown; kept only for compatibility
  mode: _deprecatedMode,
  submitUrl = `${FIREBASE_FUNCTIONS_URL}/listings`,
}) {
  const [message, setMessage] = useState("");
  const [extracted, setExtracted] = useState(null); // raw returned object
  const [form, setForm] = useState(null);           // editable copy
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // top bar selections
  const [svcMap, setSvcMap] = useState(null); // { [city]: { [locality]: [{id,name}] } }
  const [svcLoading, setSvcLoading] = useState(false);
  const [svcError, setSvcError] = useState("");
  // mode and pre-form location selections (visible before extract)
  const [selectedMode, setSelectedMode] = useState(""); // '' | 'rent' | 'resale'
  const [preCity, setPreCity] = useState("");
  const [preLocality, setPreLocality] = useState("");
  const [preProjectId, setPreProjectId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tmpMode, setTmpMode] = useState("");
  const [tmpCity, setTmpCity] = useState("");
  const [tmpLocality, setTmpLocality] = useState("");
  const [tmpProjectId, setTmpProjectId] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  // Add flow gating: require fresh filter apply before enabling paste/extract
  const [addRequireFilters, setAddRequireFilters] = useState(false);
  const [addFiltersReady, setAddFiltersReady] = useState(false);
  // Sorting
  const [sortKey, setSortKey] = useState('default');
  const [listings, setListings] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [elevated, setElevated] = useState(false);

  const isRent = selectedMode === "rent";

  const STORAGE_KEY = useMemo(() => `listingIntake:${selectedMode || "all"}`, [selectedMode]);
  const MODE_KEY = 'listingIntake:selectedMode';
  const SORT_KEY = 'listingIntake:sortKey';

  // Load serviceable city/locality/project options
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSvcError("");
      setSvcLoading(true);
      try {
        const url = `${FIREBASE_FUNCTIONS_URL}/serviceable_projects${selectedMode ? `?mode=${encodeURIComponent(selectedMode)}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load options (${res.status})`);
        const data = await res.json();
        if (!cancelled) setSvcMap(data || {});
      } catch (e) {
        if (!cancelled) setSvcError("Failed to load city/locality/project options.");
        console.error(e);
      } finally {
        if (!cancelled) setSvcLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMode]);

  // Restore persisted mode on mount (to keep listings visible after back nav)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'rent' || saved === 'resale') setSelectedMode(saved);
      const savedSort = localStorage.getItem(SORT_KEY);
      if (savedSort) setSortKey(savedSort);
    } catch {}
  }, []);

  // Persist mode when it changes (scoped to listing screen behavior)
  useEffect(() => {
    try {
      if (selectedMode) localStorage.setItem(MODE_KEY, selectedMode);
      else localStorage.removeItem(MODE_KEY);
    } catch {}
  }, [selectedMode]);

  // Persist sort preference
  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, sortKey); } catch {}
  }, [sortKey]);

  // Restore persisted selections when form becomes available
  useEffect(() => {
    if (!form) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { city, locality, projectId } = JSON.parse(raw);
      if (city) setForm((prev) => ({ ...prev, city }));
      if (locality) setForm((prev) => ({ ...prev, locality }));
      if (projectId) setForm((prev) => ({ ...prev, projectId }));
    } catch {}
  }, [form, STORAGE_KEY]);

  // Initialize pre-form selections from persisted storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { city, locality, projectId } = JSON.parse(raw);
      if (city) setPreCity(city);
      if (locality) setPreLocality(locality);
      if (projectId) setPreProjectId(projectId);
    } catch {}
  }, [STORAGE_KEY]);

  const handleExtract = async () => {
    setError("");
    setSuccess("");
    if (!selectedMode) { setError("Please select mode (Rent/Resale) first."); return; }
    if (!preCity || !preLocality || !preProjectId) { setError("Please select City, Locality and Project."); return; }
    if (!message.trim()) {
      setError("Please paste the property details first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(EXTRACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode, message }),
      });
      if (!res.ok) throw new Error(`Extractor failed (${res.status})`);
      const data = await res.json();

      // Expecting shape: { listing: {...} } — fall back gracefully
      let listing = normalizeListing(data?.listing || {}, selectedMode);
      // Sync listing with chosen filters
      listing = { ...listing, city: preCity, locality: preLocality, projectId: preProjectId };
      try {
        const name = svcMap?.[preCity]?.[preLocality]?.find((p) => String(p.id) === String(preProjectId))?.name || "";
        listing.projectName = name;
      } catch {}
      setExtracted(listing);
      setForm(listing);
    } catch (e) {
      console.error(e);
      setError("Could not extract details. Please review the text and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessage("");
    setExtracted(null);
    setForm(null);
    setError("");
    setSuccess("");
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Enforce dependent resets for cascading dropdowns
      if (field === "city") {
        next.locality = "";
        next.projectId = "";
        next.projectName = "";
      } else if (field === "locality") {
        next.projectId = "";
        next.projectName = "";
      } else if (field === "projectId") {
        // also set projectName if available from svcMap
        try {
          const name = svcMap?.[next.city]?.[next.locality]?.find((p) => String(p.id) === String(value))?.name || "";
          next.projectName = name;
        } catch { /* noop */ }
      }
      return next;
    });
  };

  // Persist key dropdown selections on change
  useEffect(() => {
    if (!form) return;
    try {
      const payload = JSON.stringify({ city: form.city || "", locality: form.locality || "", projectId: form.projectId || "" });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {}
  }, [form?.city, form?.locality, form?.projectId, STORAGE_KEY]);

  const validate = () => {
    const errs = [];
    if (!selectedMode) errs.push("Mode is required.");
    if (!form?.title) errs.push("Title is required.");
    if (!form?.city) errs.push("City is required.");
    if (!form?.locality) errs.push("Locality is required.");
    if (!form?.projectId) errs.push("Project is required.");
    if (!form?.contactPhone && !form?.contactEmail) {
      errs.push("Provide at least one contact detail (phone or email).");
    }
    if (selectedMode === "rent") {
      if (!form?.rent) errs.push("Monthly rent is required for rent listings.");
    } else if (selectedMode === "resale") {
      if (!form?.price) errs.push("Sale price is required for resale listings.");
    }
    return errs;
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    const errs = validate();
    if (errs.length) {
      setError(errs.join(" "));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode, listing: form }),
      });
      if (!res.ok) throw new Error(`Submit failed (${res.status})`);
      const data = await res.json();
      setSuccess(`Listing submitted successfully${data?.id ? ` (ID: ${data.id})` : ""}.`);
      // Auto-close intake and show listings
      setShowIntake(false);
      setAddRequireFilters(false);
      setAddFiltersReady(false);
      setExtracted(null);
      setForm(null);
      setMessage("");
    } catch (e) {
      console.error(e);
      setError("Failed to submit listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Load listings when collapsed and filters change
  useEffect(() => {
    const fetchListings = async () => {
      if (!selectedMode || !preCity || !preLocality) { setListings([]); return; }
      setListLoading(true); setListError("");
      try {
        const params = new URLSearchParams();
        params.set('mode', selectedMode);
        params.set('city', preCity);
        params.set('locality', preLocality);
        if (preProjectId) params.set('projectId', preProjectId);
        params.set('limit', '50');
        const url = `${FIREBASE_FUNCTIONS_URL}/listings?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setListings(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        console.error(e);
        setListError('Failed to load listings');
      } finally {
        setListLoading(false);
      }
    };
    if (!showIntake) fetchListings();
  }, [selectedMode, preCity, preLocality, preProjectId, showIntake]);

  const openDrawer = () => {
    setTmpMode(selectedMode);
    setTmpCity(preCity);
    setTmpLocality(preLocality);
    setTmpProjectId(preProjectId);
    setDrawerOpen(true);
  };

  const applyDrawer = () => {
    // Mode
    setSelectedMode(tmpMode);
    // City/Locality/Project
    setPreCity(tmpCity);
    setPreLocality(tmpLocality);
    setPreProjectId(tmpProjectId);
    // Persist filters against the mode being applied (not the previous one)
    try {
      const keyForMode = `listingIntake:${tmpMode || 'all'}`;
      localStorage.setItem(keyForMode, JSON.stringify({ city: tmpCity, locality: tmpLocality, projectId: tmpProjectId }));
    } catch {}
    // When in add flow, mark filters as ready
    if (showIntake && addRequireFilters) setAddFiltersReady(true);
    if (form) {
      if (form.city !== tmpCity) handleChange("city", tmpCity);
      if (form.locality !== tmpLocality) handleChange("locality", tmpLocality);
      if (form.projectId !== tmpProjectId) handleChange("projectId", tmpProjectId);
    }
    setDrawerOpen(false);
  };

  const cancelDrawer = () => {
    setDrawerOpen(false);
    // If user is in add flow and hasn't applied new filters, close intake and keep prior chip selection
    if (showIntake && addRequireFilters && !addFiltersReady) {
      setShowIntake(false);
      setAddRequireFilters(false);
      setAddFiltersReady(false);
      // keep previous selectedMode/pre* intact (no resets here)
    }
  };

  const chipbarStyle = sharedChipbarNoScroll;
  const chipStyle = sharedChip;
  const summaryChip = { ...chipStyle, maxWidth: '70vw', overflow: 'hidden', textOverflow: 'ellipsis' };

  // Auto-select single option in drawer dropdowns
  const availableModes = useMemo(() => {
    const isValid = (m) => m === 'rent' || m === 'resale';
    try {
      if (typeof window !== 'undefined' && Array.isArray(window.REFLAT_AVAILABLE_MODES)) {
        const modes = window.REFLAT_AVAILABLE_MODES.filter(isValid);
        if (modes.length) return modes;
      }
      const raw = localStorage.getItem('listingIntake:availableModes');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const modes = parsed.filter(isValid);
          if (modes.length) return modes;
        }
      }
    } catch {}
    return ['rent', 'resale'];
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    if (!tmpMode && availableModes.length === 1) {
      setTmpMode(availableModes[0]);
    }
  }, [drawerOpen, availableModes, tmpMode]);

  // City
  useEffect(() => {
    if (!drawerOpen) return;
    const cities = Object.keys(svcMap || {});
    if (!tmpCity && cities.length === 1) {
      setTmpCity(cities[0]);
    }
  }, [drawerOpen, svcMap, tmpCity]);

  useEffect(() => {
    if (!drawerOpen || !tmpCity) return;
    const locs = Object.keys(svcMap?.[tmpCity] || {});
    if (!tmpLocality && locs.length === 1) {
      setTmpLocality(locs[0]);
    }
  }, [drawerOpen, svcMap, tmpCity, tmpLocality]);

  useEffect(() => {
    if (!drawerOpen || !tmpCity || !tmpLocality) return;
    const projects = svcMap?.[tmpCity]?.[tmpLocality] || [];
    if (!tmpProjectId && projects.length === 1) {
      setTmpProjectId(String(projects[0]?.id ?? ""));
    }
  }, [drawerOpen, svcMap, tmpCity, tmpLocality, tmpProjectId]);

  const handleFilterReset = () => {
    setPreCity("");
    setPreLocality("");
    setPreProjectId("");
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ city: "", locality: "", projectId: "" })); } catch {}
  };

  // Elevate sticky bar with shadow on scroll
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="container pt-0 pb-0" style={{ paddingLeft: 8, paddingRight: 8 }}>
      {/* Sticky controls: Filters + Summary + Add (+) (single row) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 9, background: '#fff', borderBottom: '1px solid #f1f5f9', boxShadow: elevated ? '0 2px 8px rgba(0,0,0,0.04)' : 'none' }}>
        <div role="toolbar" aria-label="Filters" style={{ ...chipbarStyle, paddingTop: 0, paddingBottom: 3, marginTop: -6, justifyContent: 'center' }}>
          {/* Filters icon */}
          <button
            type="button"
            onClick={openDrawer}
            title="Filters"
            style={{ ...chipStyle, ...sharedChipPrimary, padding: '6px 8px' }}
          >
            <SlidersHorizontal size={16} />
          </button>
          {/* Sort (icon cycle) */}
          {(() => {
            const options = [
              { key: 'default', label: 'Sort: Default', badge: '•' },
              { key: 'amount_desc', label: selectedMode === 'rent' ? 'Sort: Rent High→Low' : 'Sort: Price High→Low', badge: selectedMode === 'rent' ? 'R↓' : 'P↓' },
              { key: 'amount_asc', label: selectedMode === 'rent' ? 'Sort: Rent Low→High' : 'Sort: Price Low→High', badge: selectedMode === 'rent' ? 'R↑' : 'P↑' },
              { key: 'bhk_desc', label: 'Sort: BHK High→Low', badge: 'BHK' },
              { key: 'size_desc', label: 'Sort: Size High→Low', badge: 'SZ' },
            ];
            const idx = Math.max(0, options.findIndex(o => o.key === sortKey));
            const cur = options[idx] || options[0];
            const cycle = () => {
              const next = options[(idx + 1) % options.length];
              setSortKey(next.key);
            };
            return (
              <button
                type="button"
                onClick={cycle}
                aria-label={cur.label}
                title={cur.label}
                style={{ ...chipStyle, padding: '6px 8px', position: 'relative' }}
              >
                <ArrowUpDown size={16} />
                <span style={{ position: 'absolute', top: -5, right: -6, background: '#0f172a', color: '#fff', borderRadius: 999, padding: '0 4px', fontSize: 10, lineHeight: '14px', height: 14, display: 'inline-flex', alignItems: 'center' }}>
                  {cur.badge}
                </span>
              </button>
            );
          })()}
          {/* Sort dropdown (explicit selection) */}
          <select
            aria-label="Sort listings"
            title="Sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            style={{ ...chipStyle, padding: '6px 8px', border: '1px solid #e5e7eb', background: '#fff' }}
          >
            <option value="default">Sort</option>
            <option value="amount_desc">{selectedMode === 'rent' ? 'Rent High→Low' : 'Price High→Low'}</option>
            <option value="amount_asc">{selectedMode === 'rent' ? 'Rent Low→High' : 'Price Low→High'}</option>
            <option value="bhk_desc">BHK High→Low</option>
            <option value="size_desc">Size High→Low</option>
          </select>
          {/* Summary chip (clickable) */}
          <button
            type="button"
            onClick={openDrawer}
            title="Change Filters"
            style={summaryChip}
          >
            <span style={{ fontWeight: 700 }}>
              {(() => {
                const modeLabel = selectedMode ? (selectedMode === 'rent' ? 'Rent' : 'Resale') : 'Mode —';
                const cityLabel = preCity || 'City —';
                const locLabel = preLocality || 'Locality —';
                const projLabel = (() => { const arr = svcMap?.[preCity]?.[preLocality] || []; const name = arr.find(p => String(p.id) === String(preProjectId))?.name; return name || (preProjectId || 'Project —'); })();
                return `${modeLabel} · ${cityLabel} · ${locLabel} · ${projLabel}`;
              })()}
            </span>
          </button>
          {/* Add (+) button with tooltip */}
          <button
            type="button"
            onClick={() => {
              if (showIntake) {
                setShowIntake(false);
                setAddRequireFilters(false);
                setAddFiltersReady(false);
                return;
              }
              // Start add flow and force user to pick fresh filters
              setMessage("");
              setExtracted(null);
              setForm(null);
              setError("");
              setSuccess("");
              setAddRequireFilters(true);
              setAddFiltersReady(false);
              // Open drawer with empty selections (do not clear existing chip bar filters)
              setTmpMode("");
              setTmpCity("");
              setTmpLocality("");
              setTmpProjectId("");
              setShowIntake(true);
              setDrawerOpen(true);
            }}
            title={showIntake ? 'Hide add property' : 'Add property'}
            aria-label={showIntake ? 'Hide add property' : 'Add property'}
            style={{
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: showIntake ? '#ef4444' : '#6e0be0',
              border: '1px solid ' + (showIntake ? '#dc2626' : '#5b07bb'),
              color: '#fff',
              flex: '0 0 auto',
            }}
          >
            {showIntake ? <Minus size={18} /> : <Plus size={18} />}
          </button>
        </div>
      </div>

      {/* Summary line removed; summary lives in the chip bar */}

      {/* Paste box (expandable) */}
      {showIntake && (
      <div className="card" style={{ padding: 12, margin: "10px 0" }}>
        {/* Title removed as requested */}
        {(() => {
          const filtersReady = addRequireFilters ? addFiltersReady : Boolean(selectedMode && preCity && preLocality && preProjectId);
          return (
            <>
              <p className="text-muted" style={{ margin: "8px 0 12px" }}>
                {filtersReady
                  ? 'Paste the full property description here (location, price/rent, size, amenities, contact, etc.)'
                  : 'Select Mode, City, Locality and Project to enable pasting.'}
              </p>
            </>
          );
        })()}

        {(() => {
          const ready = addRequireFilters ? addFiltersReady : Boolean(selectedMode && preCity && preLocality && preProjectId);
          const disabled = !ready;
          return (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={disabled ? "Select Mode, City, Locality, Project first…" : "Paste property details…"}
              rows={6}
              disabled={disabled}
              style={{
                width: "100%",
                resize: "vertical",
                overflowY: "auto",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: 10,
                background: disabled ? '#f8fafc' : 'white',
                color: disabled ? '#9ca3af' : 'inherit',
              }}
            />
          );
        })()}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={handleExtract}
            disabled={loading || !message.trim() || (addRequireFilters ? !addFiltersReady : !(selectedMode && preCity && preLocality && preProjectId))}
            className="btn btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: loading ? "#93c5fd" : "#6e0be0",
              color: "#fff",
            }}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {loading ? "Extracting…" : "Extract Details"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="btn btn-outline-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10 }}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

        {error && (
          <div className="alert alert-danger mt-3" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success mt-3" role="alert">
            {success}
          </div>
        )}
      </div>
      )}

      {/* Drawer (mount only when open to avoid overlay blocking nav) */}
      {drawerOpen && (
        <div className="filter-drawer open" style={{ position: 'fixed', inset: 0, zIndex: 1050 }}>
          {/* Backdrop */}
          <div
            className="filter-drawer__backdrop"
            onClick={cancelDrawer}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.25)', opacity: 1, transition: 'opacity .24s ease', zIndex: 1 }}
          />
          {/* Panel */}
          <div
            className="filter-drawer__panel"
            role="dialog"
            aria-modal="true"
            style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 'min(92vw, 360px)', background: '#fff', boxShadow: '-8px 0 24px rgba(0,0,0,.08)', padding: 16, transform: 'translateX(0)', transition: 'transform .24s ease', zIndex: 2, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h6 className="m-0" style={{ margin: 0 }}>Filters</h6>
              <button type="button" className="btn btn-link btn-sm text-muted p-0" onClick={cancelDrawer} style={{ textDecoration: 'none' }}>✕</button>
            </div>

            {/* Mode */}
            <div className="mb-2" style={{ marginBottom: 12 }}>
              <label className="form-label mb-1" style={{ display: 'block', marginBottom: 6 }}>Mode</label>
              <select className="form-select" value={tmpMode} onChange={(e) => setTmpMode(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="">Select mode</option>
                {availableModes.map((m) => (
                  <option key={m} value={m}>{m === 'rent' ? 'Rent' : 'Resale'}</option>
                ))}
              </select>
            </div>

            {/* City */}
            <div className="mb-2" style={{ marginBottom: 12 }}>
              <label className="form-label mb-1" style={{ display: 'block', marginBottom: 6 }}>City</label>
              <select className="form-select" value={tmpCity} onChange={(e) => { setTmpCity(e.target.value); setTmpLocality(''); setTmpProjectId(''); }} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="">Select city</option>
                {Object.keys(svcMap || {}).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Locality */}
            <div className="mb-2" style={{ marginBottom: 12 }}>
              <label className="form-label mb-1" style={{ display: 'block', marginBottom: 6 }}>Locality</label>
              <select className="form-select" value={tmpLocality} onChange={(e) => { setTmpLocality(e.target.value); setTmpProjectId(''); }} disabled={!tmpCity} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="">Select locality</option>
                {(tmpCity ? Object.keys(svcMap?.[tmpCity] || {}) : []).map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Project */}
            <div className="mb-2" style={{ marginBottom: 12 }}>
              <label className="form-label mb-1" style={{ display: 'block', marginBottom: 6 }}>Project</label>
              <select className="form-select" value={tmpProjectId} onChange={(e) => setTmpProjectId(e.target.value)} disabled={!tmpCity || !tmpLocality} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="">Select project</option>
                {(svcMap?.[tmpCity]?.[tmpLocality] || []).map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>{p.name || p.id}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              {(() => {
                const canApply = Boolean(tmpMode && tmpCity && tmpLocality && tmpProjectId);
                return (
                  <button
                    className="drawer-apply"
                    onClick={applyDrawer}
                    disabled={!canApply}
                    style={{
                      background: canApply ? '#0d6efd' : '#9ca3af',
                      border: '1px solid ' + (canApply ? '#0d6efd' : '#cbd5e1'),
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: 8,
                      opacity: canApply ? 1 : 0.7,
                      cursor: canApply ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Apply
                  </button>
                );
              })()}
              <button className="btn btn-outline-secondary" onClick={cancelDrawer} style={{ padding: '6px 12px', borderRadius: 8 }}>
                Cancel
              </button>
              <button className="btn btn-link btn-sm text-muted ms-auto p-0" onClick={() => { handleFilterReset(); }} title="Reset filters" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                <XCircle size={14} style={{ marginRight: 4 }} /> Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form (shown after extract) */}
      {showIntake && form && (
        <div className="card" style={{ padding: 12 }}>
          <h4 style={{ marginTop: 0 }}>Verify & Edit Details</h4>

          {/* Option loading status for user awareness */}
          {svcLoading && (
            <div className="alert alert-info" role="alert" style={{ marginBottom: 8 }}>
              Loading city/locality/project options…
            </div>
          )}
          {svcError && (
            <div className="alert alert-warning" role="alert" style={{ marginBottom: 8 }}>
              {svcError}
            </div>
          )}

          <FormGrid
            form={form}
            onChange={handleChange}
            isRent={isRent}
            svcMap={svcMap}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn btn-success"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 10,
                background: "#22c55e",
                color: "#fff",
                border: "1px solid #16a34a",
              }}
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              {submitting ? "Submitting…" : "Submit Listing"}
            </button>
          </div>
        </div>
      )}

      {/* Listings view when collapsed */}
      {!showIntake && (
        <IntakeListings items={sortedListings(listings, sortKey, selectedMode)} loading={listLoading} error={listError} mode={selectedMode} svcMap={svcMap} />
      )}
    </div>
  );
}

/** Normalize backend output to the fields our form expects. */
function sortedListings(items, sortKey, mode) {
  const arr = Array.isArray(items) ? [...items] : [];
  const num = (v) => {
    if (v == null || v === "") return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const getSize = (it) => {
    const s = num(it.superBuiltupAreaSqft);
    const c = num(it.carpetAreaSqft);
    const a = num(it.area);
    return Math.max(s || 0, c || 0, a || 0);
  };
  const getAmount = (it) => {
    if (mode === 'rent') return num(it.rent) || 0;
    if (mode === 'resale') return num(it.price) || 0;
    // fallback: whichever is present
    return num(it.price) || num(it.rent) || 0;
  };

  switch (sortKey) {
    case 'amount_desc':
      return arr.sort((a, b) => getAmount(b) - getAmount(a));
    case 'amount_asc':
      return arr.sort((a, b) => getAmount(a) - getAmount(b));
    case 'bhk_desc':
      return arr.sort((a, b) => (num(b.bedrooms) || 0) - (num(a.bedrooms) || 0));
    case 'size_desc':
      return arr.sort((a, b) => getSize(b) - getSize(a));
    default:
      return arr;
  }
}

/** Normalize backend output to the fields our form expects. */
function normalizeListing(src = {}, mode) {
  const isRent = mode === "rent";
  const num = (v) => {
    if (v == null || v === "") return "";
    const parsed = Number(String(v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : "";
  };

  return {
    title: src.title || "",
    listingType: isRent ? "rent" : "resale",
    propertyType: src.propertyType || src.type || "Apartment",
    bedrooms: num(src.bedrooms),
    bathrooms: num(src.bathrooms),
    superBuiltupAreaSqft: num(src.superBuiltupAreaSqft || src.area || src.superBuiltupArea),
    carpetAreaSqft: num(src.carpetAreaSqft || src.carpetArea),
    furnishing: src.furnishing || "",
    // pricing (mode-specific)
    rent: isRent ? num(src.rent || src.monthlyRent) : "",
    deposit: isRent ? num(src.deposit || src.securityDeposit) : "",
    maintenance: num(src.maintenance),
    price: !isRent ? num(src.price) : "",
    // location
    city: src.city || "",
    locality: src.locality || "",
    projectId: src.projectId || "",
    projectName: src.projectName || "",
    address: src.address || "",
    floor: src.floor || "",
    totalFloors: src.totalFloors || "",
    facing: src.facing || "",
    amenities: Array.isArray(src.amenities) ? src.amenities.join(", ") : (src.amenities || ""),
    parking: src.parking || "",
    availabilityDate: src.availabilityDate || "",
    // contact
    contactName: src.contactName || "",
    contactPhone: src.contactPhone || "",
    contactEmail: src.contactEmail || "",
    // misc
    notes: src.notes || "",
  };
}

/** Small presentational controlled form grouped by sections */
function FormGrid({ form, onChange, isRent, svcMap }) {
  const input = (label, field, type = "text", attrs = {}) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontWeight: 600 }}>{label}</label>
      <input
        type={type}
        value={form[field] ?? ""}
        onChange={(e) => onChange(field, e.target.value)}
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
        {...attrs}
      />
    </div>
  );

  const textarea = (label, field, attrs = {}) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontWeight: 600 }}>{label}</label>
      <textarea
        rows={attrs.rows || 3}
        value={form[field] ?? ""}
        onChange={(e) => onChange(field, e.target.value)}
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", resize: "vertical" }}
        {...attrs}
      />
    </div>
  );

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
  };

  const cityOptions = useMemo(() => (svcMap ? Object.keys(svcMap) : []), [svcMap]);
  const localityOptions = useMemo(() => {
    if (!svcMap || !form?.city) return [];
    const locs = svcMap[form.city] || {};
    return Object.keys(locs);
  }, [svcMap, form?.city]);
  const projectOptions = useMemo(() => {
    if (!svcMap || !form?.city || !form?.locality) return [];
    const arr = (svcMap?.[form.city]?.[form.locality]) || [];
    return arr;
  }, [svcMap, form?.city, form?.locality]);


  return (
    <>
      {/* Basic */}
      <div style={grid}>
        {input("Title", "title")}
        {input("Property Type", "propertyType")}
        {input("Bedrooms", "bedrooms", "number", { min: 0 })}
        {input("Bathrooms", "bathrooms", "number", { min: 0 })}
        {input("Super Built-up (sqft)", "superBuiltupAreaSqft", "number", { min: 0 })}
        {input("Carpet Area (sqft)", "carpetAreaSqft", "number", { min: 0 })}
        {input("Furnishing", "furnishing")}
      </div>

      {/* Pricing */}
      <h5 style={{ margin: "12px 0 6px" }}>Pricing</h5>
      <div style={grid}>
        {isRent ? (
          <>
            {input("Monthly Rent (₹)", "rent", "number", { min: 0 })}
            {input("Deposit (₹)", "deposit", "number", { min: 0 })}
            {input("Maintenance (₹)", "maintenance", "number", { min: 0 })}
          </>
        ) : (
          <>
            {input("Sale Price (₹)", "price", "number", { min: 0 })}
            {input("Maintenance (₹)", "maintenance", "number", { min: 0 })}
          </>
        )}
      </div>

      {/* Location (chips are at top). Keep address/floors here. */}
      <h5 style={{ margin: "12px 0 6px" }}>Location</h5>
      <div style={grid}>
        {input("Address", "address")}
        {input("Floor", "floor")}
        {input("Total Floors", "totalFloors")}
        {input("Facing", "facing")}
      </div>

      {/* Extras */}
      <h5 style={{ margin: "12px 0 6px" }}>Extras</h5>
      <div style={grid}>
        {input("Parking", "parking")}
        {input("Availability Date", "availabilityDate", "date")}
        {input("Amenities (comma separated)", "amenities")}
      </div>

      {/* Contact */}
      <h5 style={{ margin: "12px 0 6px" }}>Contact</h5>
      <div style={grid}>
        {input("Name", "contactName")}
        {input("Phone", "contactPhone", "tel")}
        {input("Email", "contactEmail", "email")}
      </div>

      {textarea("Notes", "notes", { rows: 4 })}
    </>
  );
}

// (ChipSelect removed, chipbar now uses drawer pattern like New Projects)
