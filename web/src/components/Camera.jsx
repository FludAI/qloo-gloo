import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Rail } from "./Motion.jsx";

// The viewfinder, over whatever the word is on: the rear camera (a phone looking at paper), a shared
// window (a desktop looking at its own screen), or a picture (uploaded, pasted or dropped). One reticle
// in the middle; capture() returns a JPEG of the framed region only (plus a little margin), so the server
// reads one word and never sees the whole scene. A camera fills the viewport; a window or picture is shown
// whole and can be dragged and zoomed so the word sits in the frame.
// scan: null | "sweep" (reading) | { pieces: n } (found: one tick per piece drops under the frame)
const VIDEO = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
const SLOW_MS = 12000; // a prompt the user can see is answered well before this
const SCREEN = { video: { displaySurface: "window", frameRate: { ideal: 15 } }, audio: false, selfBrowserSurface: "exclude", surfaceSwitching: "include" };

const Camera = forwardRef(function Camera({ onState, scan = null, children }, ref) {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const urlRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | starting | live | denied | unavailable
  const [source, setSource] = useState(null); // camera | screen | image
  const [view, setView] = useState({ x: 0, y: 0, z: 1 }); // pan and zoom of a window or picture
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const set = (s, extra) => { setState(s); onState?.(s, { source: extra?.source ?? source, ...extra }); };
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // The mic permission, asked in the same tap. Audio is captured only while the mic is held (talk.js).
  const askMic = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return true; } catch { return false; }
  };

  const start = async (which = "camera") => {
    if (!navigator.mediaDevices?.getUserMedia) return set("unavailable", { reason: "This browser can't open the camera.", source: which });
    if (which === "screen" && !navigator.mediaDevices.getDisplayMedia) return set("unavailable", { reason: "This browser can't share a window.", source: which });
    stop(); setSource(which); setView({ x: 0, y: 0, z: 1 });
    set("starting", { source: which });
    // The permission prompt can be hidden, dismissed, or never shown (an embedded browser): after a while the gate says so.
    const slow = setTimeout(() => set("starting", { source: which, slow: true }), SLOW_MS);
    let mic = false, stream;
    try {
      if (which === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia(SCREEN);
        mic = await askMic();
      } else {
        // One prompt for both, in the tap that asked for it. If the pair is refused, retry video alone.
        try { stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: true }); mic = true; }
        catch { stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false }); }
      }
    } catch (e) {
      clearTimeout(slow);
      return set(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : "unavailable", { reason: e?.message, error: e?.name ?? "Error", source: which });
    }
    clearTimeout(slow);
    stream.getAudioTracks().forEach((t) => t.stop());
    streamRef.current = stream;
    // A share the user ends from the browser's own bar takes the viewfinder with it.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (streamRef.current === stream) { stop(); setSource(null); set("idle", { source: null }); } });
    const v = videoRef.current;
    v.srcObject = stream;
    try { await v.play(); } catch { /* autoplay policies: the muted inline video still shows frames */ }
    set("live", { mic, source: which });
  };

  // A picture of the word: a file from the camera roll, a paste, or a drop.
  const show = async (file) => {
    if (!file || !String(file.type).startsWith("image/")) return;
    stop(); setSource("image"); setView({ x: 0, y: 0, z: 1 });
    const url = URL.createObjectURL(file); urlRef.current = url;
    set("starting", { source: "image" });
    const img = imgRef.current;
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    if (!img.naturalWidth) return set("unavailable", { reason: "That picture couldn't be read.", source: "image" });
    set("live", { mic: false, source: "image" });
  };

  useEffect(() => () => stop(), []);

  // Where the media sits on screen: a camera covers the viewport; a window or picture is contained, then panned and zoomed.
  const placement = () => {
    const el = source === "image" ? imgRef.current : videoRef.current, box = boxRef.current;
    const nw = source === "image" ? el?.naturalWidth : el?.videoWidth, nh = source === "image" ? el?.naturalHeight : el?.videoHeight;
    if (!el || !nw || !nh || !box) return null;
    const vr = el.parentElement.getBoundingClientRect();
    const fit = source === "camera" ? Math.max(vr.width / nw, vr.height / nh) : Math.min(vr.width / nw, vr.height / nh);
    const scale = fit * (source === "camera" ? 1 : view.z);
    const cx = vr.left + vr.width / 2 + (source === "camera" ? 0 : view.x), cy = vr.top + vr.height / 2 + (source === "camera" ? 0 : view.y);
    return { el, nw, nh, scale, offX: cx - (nw * scale) / 2, offY: cy - (nh * scale) / 2, box: box.getBoundingClientRect() };
  };

  const capture = () => {
    const p = placement();
    if (!p) return null;
    const { el, nw, nh, scale, offX, offY, box: br } = p;
    const pad = 0.18;
    let sw = br.width / scale, sh = br.height / scale;
    let sx = (br.left - offX) / scale - sw * pad, sy = (br.top - offY) / scale - sh * pad;
    sw *= 1 + 2 * pad; sh *= 1 + 2 * pad;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.min(nw - sx, sw); sh = Math.min(nh - sy, sh);
    if (sw < 8 || sh < 8) return null; // the frame is off the picture
    const outW = Math.min(1024, Math.round(sw));
    const outH = Math.round(sh * (outW / sw));
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    c.getContext("2d").drawImage(el, sx, sy, sw, sh, 0, 0, outW, outH);
    return { image: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" };
  };

  useImperativeHandle(ref, () => ({ start, show, capture, state, source }), [state, source]);

  // Drag to pan, wheel or pinch to zoom: a window or picture only. The buttons above the viewfinder stay clickable.
  const pannable = state === "live" && source !== "camera";
  const onPointerDown = (e) => { if (!pannable) return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2) pinch.current = null; };
  const onPointerMove = (e) => {
    if (!pannable || !pointers.current.has(e.pointerId)) return;
    const pts = pointers.current; const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) setView((v) => ({ ...v, z: Math.min(8, Math.max(0.5, v.z * (d / pinch.current))) }));
      pinch.current = d;
    }
  };
  const onPointerUp = (e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  // The wheel zooms, and must stop the page from scrolling: React's wheel handler is passive, so this one is attached by hand.
  const rootRef = useRef(null);
  const pannableRef = useRef(false); pannableRef.current = pannable;
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const onWheel = (e) => { if (!pannableRef.current) return; e.preventDefault(); setView((v) => ({ ...v, z: Math.min(8, Math.max(0.5, v.z * (e.deltaY < 0 ? 1.1 : 0.9))) })); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const found = scan && typeof scan === "object" ? scan.pieces : 0;
  const mediaStyle = source === "camera" ? {} : { objectFit: "contain", transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, cursor: pannable ? "grab" : undefined };
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ touchAction: pannable ? "none" : undefined }}>
      <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${state === "live" && source !== "image" ? "opacity-100" : "opacity-0"}`} style={mediaStyle} draggable={false} />
      <img ref={imgRef} alt="" className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${state === "live" && source === "image" ? "opacity-100" : "opacity-0"}`} style={mediaStyle} draggable={false} />
      {state === "live" && <div className="pointer-events-none absolute inset-0 bg-black/25" />}
      {state === "live" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "22vh" }}>
          <div ref={boxRef} className={`reticle ${found ? "reticle-lock" : ""}`} aria-hidden>
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            {scan === "sweep" && <div className="sweep" />}
            {found > 0 && <div className="absolute inset-x-3 top-full mt-3"><Rail count={found} animate /></div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
});

export default Camera;
