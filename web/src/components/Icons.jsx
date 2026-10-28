const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true };

export const MicIcon = ({ size = 24 }) => (
  <svg width={size} height={size} {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></svg>
);
export const KeyboardIcon = ({ size = 22 }) => (
  <svg width={size} height={size} {...base}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>
);
export const CameraIcon = ({ size = 22 }) => (
  <svg width={size} height={size} {...base}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const CloseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const InfoIcon = ({ size = 20 }) => (
  <svg width={size} height={size} {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const LockIcon = ({ size = 16 }) => (
  <svg width={size} height={size} {...base}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const WordsIcon = ({ size = 20 }) => (
  <svg width={size} height={size} {...base}><path d="M4 6h16M4 12h10M4 18h13" /></svg>
);
export const ScreenIcon = ({ size = 22 }) => (
  <svg width={size} height={size} {...base}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);
export const PictureIcon = ({ size = 22 }) => (
  <svg width={size} height={size} {...base}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 15l-5-5-8 8M3 17l4-4 3 3" /></svg>
);
