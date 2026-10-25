import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHoldToTalk } from "../lib/talk.js";
import { api } from "../api.js";
import { sfx, reducedMotion } from "../lib/sfx.js";
import { call, lessonApi, readToken, writeToken } from "./owner.js";
import { COLW, LABEL, buildLayout, buildQueue, columnOf, columnOrigin, getValue, keyForPath, parseKey, patchFor, suggestField, withValue } from "./ambient/grid.js";
import { parseCommand, tagForInstruction } from "./ambient/grammar.js";
import { KEEP_DELTA, NEXT_DELTA, learn, loadTaste, rank, saveTaste, tagsForProposal, top } from "./ambient/taste.js";
import { DUR, EASE, camTransform, flightTo } from "./ambient/camera.js";

// The ambient editor (design study v2, web/public/design/ambient/): the lesson as a grid of fields under a
// camera. It opens on the whole map, flies to the next field worth changing and shows one proposal in focus.
// keep / next / back / undo / map by voice, swipe, keys or taps; typing is the owner's fallback. Nothing is
// spoken: this is the owner working. Every keep is one PATCH (or one accept of a pending proposal) and
// shows the new version; undo is a PATCH that restores the previous text.

const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); };
const EDITING_TAGS = new Set(["short", "sound", "plain", "own words", "rule", "improve"]);

export default function Ambient() {
  const [token, setToken] = useState(readToken);
  const [lessons, setLessons] = useState(null);
  const [err, setErr] = useState("");
  const [id, setId] = useState(() => new URLSearchParams(location.search).get("id"));

  const load = useCallback(async (t) => {
    setErr("");
    try { setLessons(await call(t, "GET", "/api/admin/lessons")); writeToken(t); setToken(t); }
    catch (e) { setLessons(null); if (e.status === 401 || e.status === 403) { writeToken(""); setToken(""); } setErr(e.message); }
  }, []);
  useEffect(() => { if (token) load(token); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const u = new URL(location.href); if (id) u.searchParams.set("id", id); else u.searchParams.delete("id"); u.searchParams.delete("mode"); history.replaceState(null, "", u); }, [id]);

  if (!token || !lessons) return <Gate onSubmit={load} error={err} />;
  if (!id) return <Pick lessons={lessons} onOpen={setId} onForget={() => { writeToken(""); setToken(""); setLessons(null); }} />;
  return <Stage key={id} token={token} id={id} onBack={() => { setId(null); load(token); }} />;
}

function Gate({ onSubmit, error }) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { if (!t.trim() || busy) return; setBusy(true); await onSubmit(t.trim()); setBusy(false); };
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 text-paper">
      <h1 className="font-display text-4xl">Lesson console</h1>
      <p className="mt-2 text-sm text-paper/70">For the owner. Paste the admin token once; it stays in this tab only.</p>
      <div className="mt-5 flex gap-2">
        <input autoFocus aria-label="Admin token" className="field" type="password" autoComplete="off" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="admin token" />
        <button className="btn-light shrink-0" disabled={!t.trim() || busy} onClick={go}>{busy ? "…" : "Open"}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}

function Pick({ lessons, onOpen, onForget }) {
  return (
    <div className="mx-auto min-h-full max-w-xl px-5 pb-16 pt-8 text-paper">
      <header className="flex items-center gap-3">
        <span className="font-mono text-xs text-paper/60">gloo.news · lessons</span>
        <span className="ml-auto flex gap-2"><a className="btn-ghost" href="/edit?mode=list">list</a><button className="btn-ghost" onClick={onForget}>Forget token</button></span>
      </header>
      <h1 className="mt-8 font-display text-5xl">Which lesson?</h1>
      <p className="mt-2 text-sm text-paper/60">Opens on the map, then flies to the first thing worth a look.</p>
      <ul className="mt-6 space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <button onClick={() => onOpen(l.id)} className="flex w-full items-center gap-3 rounded-2xl border border-paper/15 bg-white/5 px-4 py-3 text-left transition hover:border-paper/40">
              <span className="font-display text-2xl">{l.title}</span>
              <span className="ml-auto font-mono text-xs text-paper/60">v{l.version} · {l.review_status}</span>
            </button>
          </li>
        ))}
        {!lessons.length && <li className="text-paper/60">No lessons in the store yet.</li>}
      </ul>
    </div>
  );
}

// ---- The stage: one lesson under the camera ----
function Stage({ token, id, onBack }) {
  const lapi = useMemo(() => lessonApi(token, id), [token, id]);
  const [lesson, setLesson] = useState(null);
  const [err, setErr] = useState("");
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState("");          // "review" | "suggest" | "save" | ""
  const [cam, setCam] = useState(null);
  const [camDur, setCamDur] = useState(0);
  const [camEase, setCamEase] = useState("linear");
  const [focus, setFocus] = useState(null);
  const [map, setMap] = useState(true);
  const [pi, setPi] = useState(0);
  const [asked, setAsked] = useState({});        // key -> candidates from suggest or kept proposals, newest first
  const [done, setDone] = useState(() => new Set());
  const [visited, setVisited] = useState(() => new Set());
  const [taste, setTaste] = useState(loadTaste);
  const [undoStack, setUndoStack] = useState([]);
  const [toast, setToast] = useState(null);      // { msg, undo }
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [showTaste, setShowTaste] = useState(false);
  const [heard, setHeard] = useState("");
  const [vp, setVp] = useState({ w: 800, h: 600 });
  const vpRef = useRef(null);
  const inputRef = useRef(null);
  const timers = useRef({});
  const swipe = useRef({});
  const live = useRef({});

  // ---- Data ----
  useEffect(() => { lapi.get().then(setLesson).catch((e) => setErr(e.message)); }, [lapi]);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ stt: "browser" })); }, []);
  useEffect(() => { saveTaste(taste); }, [taste]);
  const mounted = Boolean(lesson);
  useEffect(() => {
    const el = vpRef.current; if (!el) return; // the stage exists only once the lesson is here
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const layout = useMemo(() => (lesson ? buildLayout(lesson) : []), [lesson]);
  const nodeOf = useCallback((key) => layout.find((n) => n.key === key), [layout]);
  const pending = lesson?.pending?.proposals ?? [];
  const { queue, unmapped } = useMemo(() => (lesson ? buildQueue(lesson, pending) : { queue: [], unmapped: [] }), [lesson, pending]);
  const scale = vp.w < 400 ? (vp.w - 24) / 376 : 1;

  // Candidates for a field: the owner's asked ones first (mine), then the pending proposals for its path, ranked by taste.
  const candidatesFor = useCallback((key) => {
    if (!lesson || !key) return [];
    const current = getValue(lesson, key);
    const fromPending = pending
      .filter((p) => typeof p.after === "string" && p.after !== current && keyForPath(lesson, p.path) === key)
      .map((p) => ({ text: p.after, src: "reviewer", tags: tagsForProposal(p), path: p.path, reason: p.reason, pending: true }));
    const own = (asked[key] ?? []).filter((c) => c.text !== current);
    return rank(taste, [...own, ...fromPending]);
  }, [lesson, pending, asked, taste]);

  const sorted = focus ? candidatesFor(focus) : [];
  const cur = sorted.length ? sorted[pi % sorted.length] : null;
  const prevText = focus && lesson ? getValue(lesson, focus) : "";
  live.current = { lesson, focus, map, pi, queue, done, visited, cur, cam, sorted, typing, busy, scale };

  // ---- Camera ----
  const ptOf = useCallback((key) => { const n = nodeOf(key); if (!n) return { fx: 0, fy: 0 }; const o = columnOrigin(n.col, false); return { fx: o.x + n.x + n.w / 2, fy: o.y + n.y + n.cy }; }, [nodeOf]);
  const flyTo = useCallback((key, fromMap) => {
    clearTimeout(timers.current.stage); clearTimeout(timers.current.adv);
    const from = live.current.cam;
    const stages = flightTo(from, ptOf(key), { fromMap: fromMap || live.current.map, scale: live.current.scale ?? 1 });
    setFocus(key); setPi(0); setMap(false); setTyping(false); setHeard("");
    const run = (i) => { const st = stages[i]; if (!st) return; setCam(st.cam); setCamDur(reducedMotion() ? 0 : st.dur); setCamEase(st.ease); if (stages[i + 1]) timers.current.stage = setTimeout(() => run(i + 1), st.dur); };
    run(0);
  }, [ptOf]);
  const showMap = useCallback(() => { clearTimeout(timers.current.stage); clearTimeout(timers.current.adv); setMap(true); setFocus(null); setTyping(false); setCam({ mode: "map" }); setCamDur(reducedMotion() ? 0 : DUR.map); setCamEase(EASE.map); }, []);

  // Open on the map; then fly to the first field in the queue.
  const opened = useRef(false);
  useEffect(() => {
    if (!lesson || opened.current) return;
    opened.current = true;
    setCam({ mode: "map" });
    const { queue: q } = buildQueue(lesson, lesson.pending?.proposals ?? []);
    if (q.length) timers.current.open = setTimeout(() => flyTo(q[0], true), DUR.hold);
  }, [lesson, flyTo]);

  // ---- Feedback ----
  const flash = useCallback((msg, undo = false) => { clearTimeout(timers.current.toast); setToast({ msg, undo }); timers.current.toast = setTimeout(() => setToast(null), 2800); }, []);
  const pulse = (sel) => { if (reducedMotion()) return; setTimeout(() => document.querySelectorAll(sel).forEach((el) => el.animate([{ transform: "translateY(10px)", filter: "blur(6px)", opacity: 0.2 }, { transform: "none", filter: "blur(0)", opacity: 1 }], { duration: 520, easing: EASE.settle })), 20); };

  // ---- Queue ----
  const advance = useCallback(() => {
    const { queue: q, done: d, visited: v, focus: f } = live.current;
    const next = q.find((k) => !d.has(k) && !v.has(k) && k !== f);
    if (!next) { showMap(); flash(q.some((k) => !d.has(k)) ? "that's the pass · say map or tap a field" : "all set"); setVisited(new Set()); return; }
    flyTo(next);
  }, [flyTo, showMap, flash]);
  const prevStep = useCallback(() => { const { queue: q, focus: f } = live.current; if (!q.length) return; const i = Math.max(0, q.indexOf(f) - 1); flyTo(q[i]); }, [flyTo]);

  // ---- Changes against the real API ----
  const commit = useCallback(async (key, cand, { undoable = true, label = "kept" } = {}) => {
    const L = live.current.lesson;
    const prev = getValue(L, key);
    setBusy("save"); setErr("");
    setLesson(withValue(L, key, cand.text));
    try {
      const doc = cand.pending && cand.path && (L.pending?.proposals ?? []).some((p) => p.path === cand.path)
        ? await lapi.accept([cand.path], true)
        : await lapi.patch(patchFor(key, cand.text));
      setLesson(doc);
      if (undoable) setUndoStack((s) => [...s, { key, prev, cand: { ...cand, pending: false, path: undefined } }]);
      flash(`${label} · v${doc.version}`, undoable);
      return doc;
    } catch (e) {
      setLesson(L);
      flash(e.problems?.length ? `${e.message}: ${e.problems[0]}` : e.message);
      return null;
    } finally { setBusy(""); }
  }, [lapi, flash]);

  const apply = useCallback(async (key, cand) => {
    clearTimeout(timers.current.adv);
    const doc = await commit(key, cand);
    if (!doc) return;
    sfx("lock");
    pulse(`[data-node="${CSS.escape(key)}"] [data-text]`);
    setDone((d) => new Set(d).add(key));
    setHeard("");
    if (cand.tags?.length) { setTaste((t) => learn(t, cand.tags, KEEP_DELTA, cand.src === "you" ? "you" : "edits")); cand.tags.forEach((t) => pulse(`[data-taste="${CSS.escape(t)}"]`)); }
    timers.current.adv = setTimeout(advance, 700);
  }, [commit, advance]);

  const keep = useCallback(() => { const { focus: f, cur: c } = live.current; if (!f) return; if (c) apply(f, c); else advance(); }, [apply, advance]);
  // Next lowers the shown candidate's tags and shows another; with nothing else to show it moves on to the next field.
  const next = useCallback(() => {
    const { cur: c, focus: f, sorted: s } = live.current;
    if (c?.tags?.length) setTaste((t) => learn(t, c.tags, NEXT_DELTA, "edits"));
    if (c && s.length > 1) { setPi((p) => p + 1); pulse(`[data-node="${CSS.escape(f)}"] [data-text]`); return; }
    if (f) setVisited((v) => new Set(v).add(f));
    advance();
  }, [advance]);
  const undo = useCallback(async () => {
    const u = undoStack[undoStack.length - 1]; if (!u) return;
    clearTimeout(timers.current.adv);
    setUndoStack((s) => s.slice(0, -1));
    const doc = await commit(u.key, { text: u.prev, src: "undo", tags: [] }, { undoable: false, label: "undone" });
    if (!doc) return;
    setDone((d) => { const n = new Set(d); n.delete(u.key); return n; });
    setAsked((a) => ({ ...a, [u.key]: [u.cand, ...(a[u.key] ?? []).filter((c) => c.text !== u.cand.text)] }));
    flyTo(u.key);
  }, [undoStack, commit, flyTo]);

  const ask = useCallback(async (key, instruction) => {
    const field = suggestField(key);
    const current = getValue(live.current.lesson, key);
    if (!field) return flash("not a field the AI can rewrite");
    if (!String(current ?? "").trim()) return flash("empty field: say the words instead");
    setBusy("suggest"); setErr("");
    const tag = tagForInstruction(instruction);
    try {
      const r = await lapi.suggest(field, instruction);
      const cand = { text: String(r.suggestion ?? ""), src: "asked", tags: [tag], mine: true, reason: r.reason };
      setAsked((a) => ({ ...a, [key]: [cand, ...(a[key] ?? []).map((c) => ({ ...c, mine: false }))] }));
      setTaste((t) => learn(t, [tag], 0, "you"));
      setPi(0);
      pulse(`[data-node="${CSS.escape(key)}"] [data-text]`);
      pulse(`[data-taste="${CSS.escape(tag)}"]`);
    } catch (e) { flash(e.code === "AGENT_UNAVAILABLE" ? "no assistant on this server" : e.message); }
    finally { setBusy(""); }
  }, [lapi, flash]);

  const review = useCallback(async (instruction) => {
    setBusy("review"); setErr("");
    try {
      const doc = await lapi.review(instruction);
      setLesson(doc); setVisited(new Set());
      const { queue: q } = buildQueue(doc, doc.pending?.proposals ?? []);
      flash(q.length ? `${q.length} to look at` : "nothing to change");
      if (q.length) timers.current.open = setTimeout(() => flyTo(q[0], true), 600);
    } catch (e) { flash(e.message); }
    finally { setBusy(""); }
  }, [lapi, flash, flyTo]);

  // The draft box is always mounted (hidden when idle) so a letter key can focus it in the same keystroke and the
  // next letters land in the input, not in the key handler.
  const openTyping = useCallback((seed = "") => { inputRef.current?.focus(); setTyping(true); setDraft(seed); }, []);
  const closeTyping = useCallback(() => { setTyping(false); setDraft(""); inputRef.current?.blur(); }, []);

  // ---- The command grammar: voice and typing land here ----
  const command = useCallback((raw) => {
    closeTyping(); setHeard("");
    const c = parseCommand(raw);
    if (!c) return;
    if (c.kind === "keep") return keep();
    if (c.kind === "next") return next();
    if (c.kind === "back") return prevStep();
    if (c.kind === "undo") return undo();
    if (c.kind === "map") return showMap();
    if (c.kind === "review") return review();
    const { focus: f, queue: q } = live.current;
    const key = f || q[0];
    if (!key) return flash("tap a field first");
    if (!f) flyTo(key);
    if (c.kind === "instruct") return ask(key, c.text);
    return apply(key, { text: c.text, src: "you", tags: ["own words"] });
  }, [keep, next, prevStep, undo, showMap, review, flyTo, ask, apply, flash, closeTyping]);

  // Hold-to-talk: server speech when the server has it (the owner token opens the gate), the browser's otherwise.
  const talk = useHoldToTalk({
    stt: health?.stt,
    onPcm: async ({ pcm16 }) => { setHeard("…"); const r = await lapi.transcribe(pcm16); setHeard(""); command(r.transcript); },
    onText: ({ transcript }) => command(transcript),
  });
  useEffect(() => { if (talk.error) { talk.clearError(); openTyping(""); } }, [talk.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keys: arrows, Enter, Escape; any letter opens the draft box with that letter.
  useEffect(() => {
    const onKey = (e) => {
      if (live.current.typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prevStep(); }
      else if (e.key === "Enter") { e.preventDefault(); keep(); }
      else if (e.key === "Escape") showMap();
      else if (e.key.length === 1 && /[a-z]/i.test(e.key)) { e.preventDefault(); openTyping(e.key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prevStep, keep, showMap, openTyping]);

  // Swipes on the stage: left next, right back, down map. A swipe swallows the tap that ends it.
  const swipeStart = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const swipeEnd = (e) => {
    const dx = e.clientX - (swipe.current.x ?? e.clientX), dy = e.clientY - (swipe.current.y ?? e.clientY);
    const swallow = () => { swipe.current.swiped = true; setTimeout(() => (swipe.current.swiped = false), 0); };
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { swallow(); dx < 0 ? next() : prevStep(); }
    else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) { swallow(); showMap(); }
  };
  const tap = (key) => { if (swipe.current.swiped) return; if (map || key !== focus) flyTo(key, map); else keep(); };

  if (err && !lesson) return <div className="flex min-h-full items-center justify-center px-6 text-paper"><p>{err} <a className="underline" href="/edit">back</a></p></div>;
  if (!lesson) return <div className="flex min-h-full items-center justify-center text-paper/50">opening…</div>;

  const fcol = focus ? columnOf(lesson, focus) : -1;
  const ribbon = top(taste, 5);
  const bars = top(taste, 9);
  const qDone = queue.filter((k) => done.has(k)).length;
  const whisper = busy === "review" ? "reviewing…" : busy === "suggest" ? "writing…" : talk.listening ? "listening" : heard ? "hearing…"
    : map ? (!lesson.pending && !queue.length ? "nothing flagged · review?" : queue.length - qDone === 0 ? "all set · tap anything" : `${queue.length - qDone} to look at`)
    : cur ? (cur.reason ? `${cur.src} · ${cur.reason}` : cur.src) : sorted.length ? "" : "no proposal · say it, or ask for one";

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black text-paper">
      <div ref={vpRef} className="absolute inset-0 overflow-hidden" onPointerDown={swipeStart} onPointerUp={swipeEnd} style={{ touchAction: "none" }}>
        <div className="absolute left-0 top-0 will-change-transform" style={{ transform: camTransform(cam, { ...vp, top: 64, bottom: 150 }, lesson), transformOrigin: "0 0", transition: `transform ${camDur}ms ${camEase}` }}>
          {layout.map((n) => {
            const f = n.key === focus;
            const field = parseKey(n.key)?.field;
            let text = getValue(lesson, n.key), tone = "text-paper";
            let showing = "value";
            if (f && !map && (talk.listening || heard)) { text = heard || "…"; tone = "text-white"; showing = "heard"; }
            else if (f && !map && cur) { text = cur.text; tone = "text-gloo"; showing = "proposal"; }
            const empty = !text;
            const inQueue = queue.includes(n.key) && !done.has(n.key);
            const op = map ? (inQueue ? 1 : 0.55) : f ? 1 : n.col === fcol ? 0.3 : 0.12;
            const o = columnOrigin(n.col, map);
            const display = n.fs >= 22;
            return (
              <div key={n.key} data-node={n.key} onClick={() => tap(n.key)} role="button" tabIndex={-1}
                className={`absolute ${n.tile ? "flex items-center justify-center rounded-2xl border-2 px-2.5 text-center" : "py-1"}`}
                style={{ transform: `translate(${o.x + n.x}px,${o.y + n.y}px)`, width: n.w, minHeight: n.h || undefined, opacity: op,
                  filter: !map && !f && n.col !== fcol ? "blur(1.5px)" : "none", borderColor: n.tile ? (f ? "var(--gloo)" : "rgba(246,241,231,.45)") : undefined,
                  transition: `transform ${camDur}ms ${camEase}, opacity 420ms ease, filter 420ms ease`, cursor: "pointer" }}>
                <span className="step absolute" style={{ left: n.tile ? 10 : 0, top: n.tile ? 6 : -20, fontSize: n.tile ? 9 : 11, opacity: f && !map ? 1 : 0, transition: "opacity 300ms" }}>{n.label ?? LABEL[field] ?? field}</span>
                <div data-text className={`${display ? "font-display" : "font-sans"} ${n.hot && showing === "value" ? "italic text-paper/90" : ""} ${empty ? "text-gloo" : tone}`} style={{ fontSize: n.fs, lineHeight: 1.18 }}>
                  {n.pre}{empty ? "?" : text}
                </div>
                {f && !map && showing === "proposal" && (
                  <div className="absolute left-0 top-full mt-1 w-full font-mono text-[11px] leading-snug text-paper/55" style={{ left: n.tile ? 0 : 0, textAlign: n.tile ? "center" : "left" }}>was {prevText || "empty"}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top: the lesson, its version, the taste ribbon, the mode links. */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-3 px-4">
        <button className="pointer-events-auto text-left" onClick={onBack} title="Lessons">
          <div className="font-display text-xl leading-tight">{lesson.title}</div>
          <div key={lesson.version} className="light-up font-mono text-[11px] text-paper/60">v{lesson.version} · {lesson.review_status}{busy === "save" ? " · saving…" : ""}</div>
        </button>
        <div className="mx-auto hidden flex-wrap justify-center gap-x-3 gap-y-1 pt-1 sm:flex" aria-label="taste ribbon">
          {ribbon.map((t) => <span key={t.tag} data-taste={t.tag} className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ opacity: 0.35 + t.weight * 0.65 }}>{t.tag}</span>)}
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <button className="round !h-9 !w-auto px-3 font-mono text-xs" onClick={() => setShowTaste((s) => !s)} aria-pressed={showTaste}>taste</button>
          <a className="round !h-9 !w-auto px-3 font-mono text-xs" href={`/edit?mode=list&id=${encodeURIComponent(id)}`}>list</a>
        </div>
      </div>

      {showTaste && (
        <aside className="absolute right-4 top-20 z-20 w-64 rounded-2xl border border-paper/15 bg-black/75 p-4 text-paper backdrop-blur-xl">
          <div className="flex items-baseline justify-between"><span className="step">taste, live</span><span className="font-mono text-[10px] text-paper/50">this browser</span></div>
          <ul className="mt-3 space-y-2">
            {bars.map((t) => (
              <li key={t.tag} data-taste={t.tag}>
                <div className="flex justify-between font-mono text-[11px]"><span>{t.tag}</span><span className="text-paper/50">{t.source} · {Math.round(t.weight * 100)}%</span></div>
                <div className="mt-1 h-1 rounded bg-paper/10"><div className="h-1 rounded" style={{ width: `${Math.round(t.weight * 100)}%`, background: EDITING_TAGS.has(t.tag) ? "var(--sea-lit)" : "var(--gloo)" }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-paper/50">Keep raises a proposal's tags, next lowers them, your own words add one. Qloo signals later.</p>
        </aside>
      )}

      {/* Bottom: whisper, the dots rail, next · talk · keep, the draft box. */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-4">
        {toast && (
          <div className="toast pointer-events-auto flex items-center gap-3">{toast.msg}{toast.undo && undoStack.length > 0 && <button className="underline" onClick={undo}>undo</button>}</div>
        )}
        <div className="max-w-md truncate text-center font-mono text-[11px] text-paper/60" title={whisper}>{whisper}{unmapped.length > 0 && map ? ` · ${unmapped.length} more in the list` : ""}</div>
        <div className="flex items-center gap-1.5" aria-label="queue">
          {queue.map((k) => <span key={k} className="block h-1.5 rounded-full transition-all duration-300" style={{ width: k === focus ? 22 : 6, background: done.has(k) ? "var(--gloo)" : k === focus ? "var(--paper)" : "rgba(246,241,231,.3)" }} />)}
        </div>
        <div className="flex w-full max-w-md items-center gap-2" style={typing ? undefined : { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}>
          <input ref={inputRef} className="field" tabIndex={typing ? 0 : -1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={focus ? "say it, or ask: shorter" : "keep · next · map · review"}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") command(draft); if (e.key === "Escape") closeTyping(); }} />
          <button className="btn-ghost" tabIndex={typing ? 0 : -1} onClick={closeTyping}>esc</button>
        </div>
        {!typing && (
          <div className="flex items-center gap-4">
            {map
              ? <button className="btn-ghost" disabled={busy === "review"} onClick={() => review()}>{busy === "review" ? "reviewing…" : lesson.pending ? "review again" : "review"}</button>
              : <button className="btn-ghost" onClick={next}>next</button>}
            {talk.mode !== "none"
              ? <button className={`shutter !h-16 !w-16 ${talk.listening ? "listening round-live" : ""}`} aria-label="Hold to talk" {...talk.holdProps}><MicIcon /></button>
              : <button className="shutter !h-16 !w-16" aria-label="Type" onClick={() => openTyping("")}><KeyIcon /></button>}
            {map
              ? <button className="btn-light px-4 py-2 text-sm" disabled={!queue.length} onClick={advance}>{queue.length ? "go" : "all set"}</button>
              : <button className={`px-5 py-2 text-sm ${cur ? "btn-light" : "btn-ghost"}`} onClick={keep}>keep</button>}
          </div>
        )}
        <div className="font-mono text-[10px] text-paper/35">{map ? "tap a field · ↓ swipe for map · type a letter" : "← → keys · swipe · Enter keeps · Esc map · hold mic"}</div>
      </div>
    </div>
  );
}

const MicIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>;
const KeyIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>;
