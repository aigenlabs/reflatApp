import React, { useRef, useState } from "react";
import { FIREBASE_FUNCTIONS_URL } from "../components/constants";

export default function AdminServiceable() {
  const [merge, setMerge] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [jsonText, setJsonText] = useState(`{
  "cities": []
}`);
  const fileInput = useRef(null);

  // Single entry form
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [builderId, setBuilderId] = useState("");
  const [builderName, setBuilderName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [modeRent, setModeRent] = useState(true);
  const [modeResale, setModeResale] = useState(true);
  const [active, setActive] = useState(true);

  const endpointBase = `${FIREBASE_FUNCTIONS_URL}`; // ends with /api

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      setJsonText(text);
      setStatus(`Loaded ${f.name} (${text.length} chars)`);
      setError("");
    } catch (err) {
      setError(`Failed to read file: ${String(err?.message || err)}`);
    }
  };

  const postReplaceOrMerge = async () => {
    setError(""); setStatus(""); setBusy(true);
    try {
      let body;
      try { body = JSON.parse(jsonText); } catch (e) { throw new Error("JSON is invalid"); }
      const url = `${endpointBase}/admin/serviceable${merge ? "?merge=true" : ""}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      let json; try { json = text ? JSON.parse(text) : null; } catch {}
      if (!resp.ok) throw new Error(json?.error || text || `HTTP ${resp.status}`);
      setStatus(`Success: ${JSON.stringify(json)}`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const postAddSingle = async () => {
    setError(""); setStatus(""); setBusy(true);
    try {
      if (!city || !locality || !builderId || !projectId) {
        throw new Error("city, locality, builderId, projectId are required");
      }
      const modes = [ ...(modeRent ? ["rent"] : []), ...(modeResale ? ["resale"] : []) ];
      const body = {
        city,
        locality,
        builderId,
        builderName: builderName || undefined,
        projectId,
        projectName: projectName || undefined,
        modes: modes.length ? modes : ["rent","resale"],
        active,
      };
      const url = `${endpointBase}/admin/serviceable/add`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      let json; try { json = text ? JSON.parse(text) : null; } catch {}
      if (!resp.ok) throw new Error(json?.error || text || `HTTP ${resp.status}`);
      setStatus(`Added/updated successfully`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h2>Admin: Serviceable Properties</h2>
      <p className="text-muted">Provide your admin key to write config/serviceable. Use with caution.</p>

      {/* Admin key entry removed; backend authorizes by trusted origin */}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <h4>Replace / Merge Full JSON</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input ref={fileInput} type="file" accept="application/json" onChange={onPickFile} />
          <label style={{ display: 'inline-flex', gap: 6 }}>
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            Merge instead of replace
          </label>
        </div>
        <textarea rows={12} className="form-control" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button disabled={busy} className="btn btn-primary" onClick={postReplaceOrMerge}>{busy ? 'Working…' : (merge ? 'Merge JSON' : 'Replace JSON')}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h4>Add / Update Single Property</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">City</label>
            <input className="form-control" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Locality</label>
            <input className="form-control" value={locality} onChange={(e) => setLocality(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Builder ID</label>
            <input className="form-control" value={builderId} onChange={(e) => setBuilderId(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Builder Name (optional)</label>
            <input className="form-control" value={builderName} onChange={(e) => setBuilderName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Project ID</label>
            <input className="form-control" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Project Name (optional)</label>
            <input className="form-control" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label><input type="checkbox" checked={modeRent} onChange={(e) => setModeRent(e.target.checked)} /> Rent</label>
            <label><input type="checkbox" checked={modeResale} onChange={(e) => setModeResale(e.target.checked)} /> Resale</label>
            <label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button disabled={busy} className="btn btn-secondary" onClick={postAddSingle}>{busy ? 'Working…' : 'Add/Update Property'}</button>
        </div>
      </div>

      {(status || error) && (
        <div style={{ marginTop: 12 }}>
          {status && <div className="alert alert-success">{status}</div>}
          {error && <div className="alert alert-danger">{error}</div>}
        </div>
      )}
    </div>
  );
}
