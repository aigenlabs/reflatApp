// src/components/Menu.jsx
import React, { Suspense, lazy } from "react";
import { NavLink, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

// Keep your page imports/lazy here since routes live in this file
const NewProjects = lazy(() => import("../pages/NewProjects"));
const Rent        = lazy(() => import("../pages/Rent"));
const Resale      = lazy(() => import("../pages/Resale"));
const Intake      = lazy(() => import("../pages/Intake"));
const ListingDetails = lazy(() => import("../pages/ListingDetails"));
const AdminServiceable = lazy(() => import("../pages/AdminServiceable"));

const linkBase = {
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
  color: "#34495e",
};
const activeStyle = {
  background: "#e7f1ff",
  color: "#0d6efd",
  boxShadow: "inset 0 0 0 2px #0d6efd20",
};

// ===== New: just the nav bar (no routes) =====
export function MenuBar() {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <nav className="mobile-nav" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "transparent", borderBottom: 0 }}>
      {/* Scrollable links */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch", flex: "1 1 auto" }}>
        <NavLink to="/new-projects" style={({ isActive }) => ({ ...linkBase, ...(isActive ? activeStyle : {}) })}>New Projects</NavLink>
        <NavLink to="/intake" style={({ isActive }) => ({ ...linkBase, ...(isActive ? activeStyle : {}) })}>Listings</NavLink>
        {(process.env.NODE_ENV !== 'production' || process.env.REACT_APP_SHOW_ADMIN === 'true') && (
          <NavLink to="/admin/serviceable" style={({ isActive }) => ({ ...linkBase, ...(isActive ? activeStyle : {}) })}>Admin</NavLink>
        )}
      </div>
    </nav>
  );
}

// ===== New: the routes block to render below header =====
export function AppRoutes() {
  return (
    <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 12, paddingBottom: 12 }}>
      <Suspense fallback={<div>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/new-projects" replace />} />
          <Route path="/new-projects" element={<NewProjects />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/rent" element={<Rent />} />
          <Route path="/resale" element={<Resale />} />
          <Route path="/listing/:id" element={<ListingDetails />} />
          {/* Admin route intentionally not linked in navbar */}
          <Route path="/admin/serviceable" element={<AdminServiceable />} />
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </Suspense>
    </div>
  );
}

// Optional: keep default export for backward compatibility
export default function Menu({ showRoutes = true }) {
  return (
    <>
      <MenuBar />
      {showRoutes && <AppRoutes />}
    </>
  );
}
