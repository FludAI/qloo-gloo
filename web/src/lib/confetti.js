// A small burst of confetti on a full-screen canvas, no dependency. Lasts about 1.4 s.
const COLORS = ["#d9822b", "#f6dfc2", "#2f6f73", "#f6f1e7", "#ffd166"];

export function confetti({ x = 0.5, y = 0.6, count = 90 } = {}) {
  if (typeof document === "undefined") return;
  const c = document.createElement("canvas");
  c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 6 + Math.random() * 9;
    return { x: innerWidth * x, y: innerHeight * y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  });
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / 1400;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = p.color; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
