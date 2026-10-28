import { useMemo } from "react";
import SVG from "../brand-logo-on-dark.js";

// The logo, inline (the string is generated from the kit's SVG, see brand-logo-on-dark.js). As an <img>, iOS Safari sometimes drops the clip that keeps the gold on the toes, and
// the gold layer then covers the whole paw. Inline SVG keeps its clip. The kit's metadata block is left out
// and the ids are namespaced so nothing else on the page can capture them.

export default function Logo({ className = "" }) {
  const html = useMemo(() => ({ __html: SVG }), []);
  return <span className={`inline-flex ${className}`} role="img" aria-label="Gloo" dangerouslySetInnerHTML={html} />;
}
