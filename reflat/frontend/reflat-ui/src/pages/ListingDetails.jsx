import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FIREBASE_FUNCTIONS_URL } from "../components/constants";
import PhoneIcon from '@mui/icons-material/Phone';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function ListingDetails() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const resp = await fetch(`${FIREBASE_FUNCTIONS_URL}/listing/${id}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const phone = String(data?.contactPhone || '').replace(/\D+/g, '');
  const telHref = phone ? `tel:${phone}` : undefined;
  const waHref = phone ? `https://wa.me/${phone}` : undefined;

  return (
    <div className="container px-2 pt-2 pb-2" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Link to="/intake" className="btn btn-link p-0" style={{ textDecoration: 'none' }}><ArrowBackIcon fontSize="small" /> Back</Link>
      </div>
      {loading && <div className="text-muted">Loading…</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && data && (
        <div className="card" style={{ padding: 12 }}>
          <h4 style={{ marginTop: 0, marginBottom: 4 }}>{data.title || '(Untitled)'}</h4>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {(data.mode === 'rent' ? 'Rent' : data.mode === 'resale' ? 'Resale' : '—')} · {data.city || '—'} · {data.locality || '—'} {data.projectName ? `· ${data.projectName}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
            <Field label="Property Type" value={data.propertyType} />
            <Field label="Bedrooms" value={data.bedrooms} />
            <Field label="Bathrooms" value={data.bathrooms} />
            {data.mode === 'rent' ? (
              <>
                <Field label="Rent (₹)" value={data.rent} />
                <Field label="Deposit (₹)" value={data.deposit} />
              </>
            ) : (
              <Field label="Price (₹)" value={data.price} />
            )}
            <Field label="Maintenance (₹)" value={data.maintenance} />
            <Field label="Super Built-up (sqft)" value={data.superBuiltupAreaSqft} />
            <Field label="Carpet Area (sqft)" value={data.carpetAreaSqft} />
            <Field label="Facing" value={data.facing} />
            <Field label="Floor" value={data.floor} />
            <Field label="Total Floors" value={data.totalFloors} />
            <Field label="Furnishing" value={data.furnishing} />
            <Field label="Parking" value={data.parking} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Address" value={data.address} full />
            <Field label="Amenities" value={data.amenities} full />
            <Field label="Notes" value={data.notes} full />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            {telHref && <a href={telHref} className="btn btn-sm btn-outline-secondary" title="Call"><PhoneIcon fontSize="small" /> Call</a>}
            {waHref && <a href={waHref} className="btn btn-sm btn-outline-success" target="_blank" rel="noopener noreferrer" title="WhatsApp"><ChatBubbleOutlineIcon fontSize="small" /> WhatsApp</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, full = false }) {
  const val = value === 0 ? 0 : (value || '—');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{String(val)}</div>
    </div>
  );
}

