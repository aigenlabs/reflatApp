import React from "react";
import { ExternalLink, Phone, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function IntakeListings({ items = [], loading = false, error = "", mode = "", svcMap = null }) {
  return (
    <div className="card" style={{ padding: 12, marginTop: 8 }}>
      <h5 style={{ margin: 0, marginBottom: 8 }}>{mode === 'rent' ? 'Listings for Rent' : mode === 'resale' ? 'Listings for Resale' : 'Listings'}</h5>
      {loading && <div className="text-muted">Loading…</div>}
      {error && <div className="alert alert-warning" role="alert">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="text-muted">No listings for the current selection.</div>
      )}
      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {items.map((it) => {
            const phone = String(it.contactPhone || '').replace(/\D+/g, '');
            const waHref = phone ? `https://wa.me/${phone}` : undefined;
            const telHref = phone ? `tel:${phone}` : undefined;
            const projectDisplayName = (() => {
              if (it.projectName) return it.projectName;
              try {
                const name = svcMap?.[it.city]?.[it.locality]?.find((p) => String(p.id) === String(it.projectId))?.name;
                return name || '';
              } catch { return ''; }
            })();
            const activeMode = it.mode || mode;
            const modeLabel = activeMode === 'rent' ? 'RENT' : activeMode === 'resale' ? 'RESALE' : '';
            const modeStyles = (() => {
              if (activeMode === 'rent') {
                return { background: '#6e0be0', border: '#5b07bb' };
              }
              if (activeMode === 'resale') {
                return { background: '#10b981', border: '#059669' };
              }
              return { background: '#475569', border: '#334155' };
            })();
            return (
              <div key={it.id} className="card" style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)', maxWidth: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                    {it.title || '(Untitled)'}
                  </div>
                  <div style={{ display: 'inline-flex', gap: 8, flex: '0 0 auto' }}>
                    {modeLabel && (
                      <span
                        title={modeLabel}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: modeStyles.background,
                          border: `1px solid ${modeStyles.border}`,
                          color: '#fff',
                          lineHeight: 1.2,
                        }}
                      >
                        {modeLabel}
                      </span>
                    )}
                    {/* View details */}
                    <Link to={`/listing/${it.id}`} title="View details" aria-label="View details" className="btn btn-sm p-0" style={{ color: '#0f172a' }}>
                      <ExternalLink size={16} />
                    </Link>
                    {/* Call */}
                    {telHref && (
                      <a href={telHref} title="Call" aria-label="Call" className="btn btn-sm p-0" style={{ color: '#0f172a' }}>
                        <Phone size={16} />
                      </a>
                    )}
                    {/* WhatsApp */}
                    {waHref && (
                      <a href={waHref} title="WhatsApp" aria-label="WhatsApp" className="btn btn-sm p-0" target="_blank" rel="noopener noreferrer" style={{ color: '#0f172a' }}>
                        <MessageCircle size={16} />
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                  {(() => {
                    const parts = [it.city, it.locality, projectDisplayName].filter(Boolean);
                    return parts.length ? parts.join(' · ') : '—';
                  })()}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#111827' }}>
                  {(() => {
                    const fmt = (v) => (v?.toLocaleString ? v.toLocaleString() : v);
                    const parts = [];
                    const size = it.superBuiltupAreaSqft || it.carpetAreaSqft || it.area;
                    if (size) parts.push(`${fmt(size)} sqft`);
                    if (it.bedrooms) parts.push(`${it.bedrooms} BHK`);
                    if (it.facing) parts.push(String(it.facing));
                    if (it.mode === 'rent') {
                      if (it.rent) parts.push(`Rent: ₹${fmt(it.rent)}`);
                      if (it.deposit) parts.push(`Dep: ₹${fmt(it.deposit)}`);
                    } else {
                      if (it.price) parts.push(`Price: ₹${fmt(it.price)}`);
                    }
                    return parts.length ? parts.join(' · ') : '—';
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
