/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f1e7",
        ink: "#1d1a16",
        muted: "#6b6358",
        line: "#ddd3c2",
        gloo: { DEFAULT: "#dfaa37", deep: "#c98a12", soft: "#f6cb5c" },
        sea: { DEFAULT: "#11917f", lit: "#2bb8a3" },
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
