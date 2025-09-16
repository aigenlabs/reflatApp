import React from "react";
import "./App.css";
import { MenuBar, AppRoutes } from "./components/Menu";
// If logo is in src/assets/...:
import logo from "./assets/images/reflat_logo.png";
// If it's in public/assets/... use: const logoPath = "/assets/images/reflat_logo.png";

export default function App() {
  return (
    <div className="app">
      {/* Row 1: Logo + Menu (same line) */}
      <header
        className="d-flex align-items-center"
        style={{
          padding: "4px 8px",
          gap: 8,
          borderBottom: "1px solid #eef2f5",
          position: 'sticky',
          top: 0,
          zIndex: 1400,
          background: '#fff',
          backdropFilter: 'saturate(180%) blur(6px)',
          // expose header height for pages that need to stick below it
          ['--app-header-height']: '72px'
        }}
      >
        <img
          src={logo /* or logoPath */}
          alt="Logo"
          style={{ height: 56, width: "auto", objectFit: "contain", flex: "0 0 auto" }}
        />
        <MenuBar />
      </header>

      {/* Row 2: Routes (New Projects by default) */}
      <main>
        <AppRoutes />
      </main>
    </div>
  );
}
