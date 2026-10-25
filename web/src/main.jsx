import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// /edit is the owner console (typing is fine there); everything else is the learner app, which has no typing.
// The console opens in its ambient mode (a camera over the lesson); ?mode=list is the field list.
const Edit = React.lazy(() => import("./edit/Edit.jsx"));
const Ambient = React.lazy(() => import("./edit/Ambient.jsx"));
const isEdit = /^\/edit(\/|$)/.test(location.pathname);
const listMode = new URLSearchParams(location.search).get("mode") === "list";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isEdit ? <React.Suspense fallback={null}>{listMode ? <Edit /> : <Ambient />}</React.Suspense> : <App />}
  </React.StrictMode>
);
