import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Full-screen rear camera with a reticle. capture() returns a JPEG of the framed region only
// (plus a little margin), so the server reads one word and never sees the whole scene.
const VIDEO = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };

const Camera = forwardRef(function Camera({ onState, children }, ref) {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | starting | live | denied | unavailable

  const set = (s, extra) => { setState(s); onState?.(s, extra); };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return set("unavailable", { reason: "This browser can't open the camera." });
    set("starting");
    let mic = false;
    let stream;
    try {
      // One prompt for both, in the tap that asked for it. If the pair is refused, retry video alone.
      try { stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: true }); mic = true; }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false }); }
    } catch (e) {
      return set(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : "unavailable", { reason: e?.message });
    }
    stream.getAudioTracks().forEach((t) => t.stop()); // permission only; audio is captured while the mic is held
    streamRef.current = stream;
    const v = videoRef.current;
    v.srcObject = stream;
    try { await v.play(); } catch { /* autoplay policies: the muted inline video still shows frames */ }
    set("live", { mic });
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const capture = () => {
    const v = videoRef.current, box = boxRef.current;
    if (!v?.videoWidth || !box) return null;
    const vr = v.getBoundingClientRect(), br = box.getBoundingClientRect();
    const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight); // object-fit: cover
    const offX = vr.left + (vr.width - v.videoWidth * scale) / 2;
    const offY = vr.top + (vr.height - v.videoHeight * scale) / 2;
    const pad = 0.18;
    let sw = br.width / scale, sh = br.height / scale;
    let sx = (br.left - offX) / scale - sw * pad, sy = (br.top - offY) / scale - sh * pad;
    sw *= 1 + 2 * pad; sh *= 1 + 2 * pad;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.min(v.videoWidth - sx, sw); sh = Math.min(v.videoHeight - sy, sh);
    const outW = Math.min(1024, Math.round(sw));
    const outH = Math.round(sh * (outW / sw));
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    c.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH);
    return { image: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" };
  };

  useImperativeHandle(ref, () => ({ start, capture, state }), [state]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${state === "live" ? "opacity-100" : "opacity-0"}`} />
      {state === "live" && <div className="pointer-events-none absolute inset-0 bg-black/25" />}
      {state === "live" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "22vh" }}>
          <div ref={boxRef} className="reticle" aria-hidden>
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          </div>
        </div>
      )}
      {children}
    </div>
  );
});

export default Camera;

// Photo fallback when the live camera is refused: downscale on the device, send one JPEG.
export function fileToJpeg(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ image: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo.")); };
    img.src = url;
  });
}
