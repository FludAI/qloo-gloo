import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// /edit is the owner console (typing is fine there); everything else is the learner app, which has no typing.
const Edit = React.lazy(() => import("./edit/Edit.jsx"));
const isEdit = /^\/edit(\/|$)/.test(location.pathname);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isEdit ? <React.Suspense fallback={null}><Edit /></React.Suspense> : <App />}
  </React.StrictMode>
);
