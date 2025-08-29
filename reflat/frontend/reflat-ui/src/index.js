import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// TODO(AppCheck): Enable after development to protect GET endpoints.
// Example (when you add Firebase config):
// import { initializeApp } from 'firebase/app';
// import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
// const firebaseApp = initializeApp({ /* config object here */ });
// initializeAppCheck(firebaseApp, {
//   provider: new ReCaptchaV3Provider(process.env.REACT_APP_RECAPTCHA_SITE_KEY),
//   isTokenAutoRefreshEnabled: true,
// });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
