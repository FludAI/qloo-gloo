import { useCallback, useEffect, useMemo, useState } from "react";

// The owner console at /edit. One token (ADMIN_TOKEN) asked once per tab, a list of lessons, and one lesson
// at a time as plain fields. "Ask the AI" fetches a proposal for one field; nothing changes until the owner
// accepts it and saves. Save sends a single merge PATCH; Publish marks the lesson reviewed.
const TOKEN_KEY = "gloo_admin_token";
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const writeToken = (t) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

async function call(token, method, path, body) {
  const res = await fetch(path, { method, headers: { "x-gloo-admin": token, ...(body && { "content-type": "application/json" }) }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error ?? `HTTP ${res.status}`); e.status = res.status; e.problems = data.problems ?? []; throw e; }
  return data;
}

const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const nul = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

export default function Edit() {
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
  useEffect(() => { const u = new URL(location.href); if (id) u.searchParams.set("id", id); else u.searchParams.delete("id"); history.replaceState(null, "", u); }, [id]);

  if (!token || !lessons) return <Gate onSubmit={load} error={err} />;
  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 pb-24 pt-6 text-paper sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-paper/60">gloo.news · lessons</span>
        <span className="ml-auto flex gap-2">
          <a className="btn-ghost" href="/">Learner app</a>
          <button className="btn-ghost" onClick={() => { writeToken(""); setToken(""); setLessons(null); }}>Forget token</button>
        </span>
      </header>
      {id
        ? <Editor key={id} token={token} id={id} onBack={() => { setId(null); load(token); }} />
        : <List lessons={lessons} onOpen={setId} />}
    </div>
  );
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

function List({ lessons, onOpen }) {
  return (
    <div className="mt-6">
      <h1 className="font-display text-4xl">Lessons</h1>
      <p className="mt-1 text-sm text-paper/60">The AI drafts. You decide. Edits reach the learner app on save.</p>
      <ul className="mt-5 space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <button onClick={() => onOpen(l.id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-paper/15 bg-white/5 px-4 py-3 text-left transition hover:border-paper/40">
              <span className="text-lg">{l.title}</span>
              <Status s={l.review_status} />
              <span className="ml-auto font-mono text-xs text-paper/60">v{l.version} · {l.edited_by} · {when(l.edited_at)}</span>
            </button>
          </li>
        ))}
        {!lessons.length && <li className="text-paper/60">No lessons in the store yet.</li>}
      </ul>
    </div>
  );
}

const Status = ({ s }) => <span className={`chip text-xs ${s === "reviewed" ? "border-sea bg-sea/30" : "border-gloo bg-gloo/30"}`}>{s}</span>;

function Editor({ token, id, onBack }) {
  const [orig, setOrig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [msg, setMsg] = useState("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => { call(token, "GET", `/api/admin/lessons/${id}`).then((d) => { setOrig(d); setDraft(structuredClone(d)); }).catch((e) => setMsg(e.message)); }, [token, id]);

  const patch = useMemo(() => (orig && draft ? buildPatch(orig, draft) : {}), [orig, draft]);
  const dirty = Object.keys(patch).length > 0;

  const set = (fn) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; });
  const ask = async (field) => {
    const r = await call(token, "POST", `/api/admin/lessons/${id}/suggest`, { field, ...(instruction.trim() && { instruction: instruction.trim() }) });
    return r.suggestion;
  };
  const save = async () => {
    setBusy("save"); setMsg(""); setProblems([]);
    try { const d = await call(token, "PATCH", `/api/admin/lessons/${id}`, patch); setOrig(d); setDraft(structuredClone(d)); setMsg(`Saved as version ${d.version}. Learners see it now.`); }
    catch (e) { setMsg(e.message); setProblems(e.problems ?? []); }
    finally { setBusy(""); }
  };
  const publish = async () => {
    if (!confirm("Mark this lesson reviewed? It loses the draft label for every learner.")) return;
    setBusy("publish"); setMsg(""); setProblems([]);
    try { const d = await call(token, "POST", `/api/admin/lessons/${id}/publish`); setOrig(d); setDraft(structuredClone(d)); setMsg(`Published as version ${d.version}.`); }
    catch (e) { setMsg(e.message); setProblems(e.problems ?? []); }
    finally { setBusy(""); }
  };

  if (!draft) return <p className="mt-6 text-paper/60">{msg || "Loading…"}</p>;
  return (
    <div className="mt-5">
      <button className="btn-ghost" onClick={() => { if (!dirty || confirm("Discard unsaved changes?")) onBack(); }}>← Lessons</button>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{orig.title}</h1>
        <Status s={orig.review_status} />
      </div>
      <p className="mt-1 font-mono text-xs text-paper/60">{orig.id} · version {orig.version} · last edit {orig.edited_by}, {when(orig.edited_at)}{orig.reviewed_at ? ` · reviewed ${orig.reviewed_at}` : ""}{orig.promoted_from ? ` · promoted from ${orig.promoted_from.provisional_id} (${orig.promoted_from.origin})` : ""}</p>

      <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-paper/10 bg-black/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-light" disabled={!dirty || Boolean(busy)} onClick={save}>{busy === "save" ? "Saving…" : dirty ? `Save (${Object.keys(patch).length} change${Object.keys(patch).length === 1 ? "" : "s"})` : "Saved"}</button>
          {orig.review_status !== "reviewed" && <button className="btn-ghost" disabled={dirty || Boolean(busy)} title={dirty ? "Save first" : ""} onClick={publish}>{busy === "publish" ? "Publishing…" : "Publish as reviewed"}</button>}
          {msg && <span className="text-sm text-paper/80">{msg}</span>}
        </div>
        {problems.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-red-300">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <label className="mt-3 block">
          <span className="step">Instruction for the AI (optional, used by every Ask)</span>
          <input className="field mt-1" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. shorter; lead with the sound; plainer words" />
        </label>
      </div>

      <Section title="Lesson">
        <Field ask={ask} label="Title" path="title" value={draft.title} onChange={(v) => set((d) => { d.title = v; })} />
        <Field ask={ask} label="Pronunciation (respelling)" path="pronunciation.approx" value={draft.pronunciation?.approx ?? ""} onChange={(v) => set((d) => { d.pronunciation = { ...(d.pronunciation ?? {}), approx: v }; })} />
        <Field ask={ask} label="IPA (whole word, no slashes)" path="pronunciation.ipa" value={draft.pronunciation?.ipa ?? ""} onChange={(v) => set((d) => { d.pronunciation = { ...(d.pronunciation ?? {}), ipa: nul(v) }; })} mono />
        <Field ask={ask} label="Summary (spoken first)" path="summary" value={draft.summary} onChange={(v) => set((d) => { d.summary = v; })} multiline />
        <Field ask={ask} label="Definition" path="definition" value={draft.definition} onChange={(v) => set((d) => { d.definition = v; })} multiline />
      </Section>

      {draft.roles.map((r, i) => (
        <Section key={r.id} title={`Piece ${i + 1}: ${r.part || r.id}`} sub={r.id}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field ask={ask} label="Part" path={`roles.${r.id}.part`} value={r.part ?? ""} onChange={(v) => set((d) => { d.roles[i].part = v; })} />
            <Field ask={ask} label="Say (respelling)" path={`roles.${r.id}.say`} value={r.say ?? ""} onChange={(v) => set((d) => { d.roles[i].say = nul(v); })} />
            <Field ask={ask} label="IPA" path={`roles.${r.id}.ipa`} value={r.ipa ?? ""} onChange={(v) => set((d) => { d.roles[i].ipa = nul(v); })} mono />
            <Field ask={ask} label="Sounds like" path={`roles.${r.id}.sound_like`} value={r.sound_like ?? ""} onChange={(v) => set((d) => { d.roles[i].sound_like = nul(v); })} />
          </div>
          <Field ask={ask} label="Meaning" path={`roles.${r.id}.meaning`} value={r.meaning ?? ""} onChange={(v) => set((d) => { d.roles[i].meaning = v; })} />
          {r.pick && <>
            <Field ask={ask} label="Pick question (spoken)" path={`roles.${r.id}.pick.question`} value={r.pick.question ?? ""} onChange={(v) => set((d) => { d.roles[i].pick.question = v; })} />
            <div className="mt-2 space-y-2">
              {r.pick.options.map((o, j) => (
                <div key={j} className="grid gap-2 rounded-xl border border-paper/10 p-2 sm:grid-cols-2">
                  <Field ask={ask} label={`Option ${j + 1} name`} path={`roles.${r.id}.pick.options.${j}.name`} value={o.name ?? ""} onChange={(v) => set((d) => { d.roles[i].pick.options[j].name = v; })} small />
                  <Field ask={ask} label="Wikipedia title (picture)" path={`roles.${r.id}.pick.options.${j}.wiki`} value={o.wiki ?? ""} onChange={(v) => set((d) => { d.roles[i].pick.options[j].wiki = nul(v); })} small />
                </div>
              ))}
            </div>
          </>}
        </Section>
      ))}

      {draft.prompts.map((p, i) => (
        <Section key={p.id} title={`Practice ${i + 1}`} sub={`${p.id} · ${p.skill} · ${p.type}`}>
          <Field ask={ask} label="Question" path={`prompts.${p.id}.question`} value={p.question} onChange={(v) => set((d) => { d.prompts[i].question = v; })} multiline />
          <Field ask={ask} label="Hint" path={`prompts.${p.id}.hint`} value={p.hint ?? ""} onChange={(v) => set((d) => { d.prompts[i].hint = nul(v); })} />
          <Field ask={ask} label="Answer (shown after the attempt)" path={`prompts.${p.id}.answer`} value={p.answer} onChange={(v) => set((d) => { d.prompts[i].answer = v; })} multiline />
          {p.type === "text" && <>
            <ListField label="Accept: every line must match (alternatives with |)" help="One group per line. A keyword matches literally; /…/ is a regex." groups value={p.accept_all ?? []} onChange={(v) => set((d) => { d.prompts[i].accept_all = v; })} />
            <ListField label="Accept: any of these" help="Separate with |" value={p.accept_any ?? []} onChange={(v) => set((d) => { d.prompts[i].accept_any = v; })} />
          </>}
          {p.type === "number" && (
            <label className="mt-3 block">
              <span className="step">Expected number</span>
              <input className="field mt-1 font-mono" type="number" step="any" value={p.expected ?? ""} onChange={(e) => set((d) => { d.prompts[i].expected = e.target.value === "" ? null : Number(e.target.value); })} />
            </label>
          )}
          {p.type === "choice" && <>
            <ListField label="Choices" help="Separate with |" value={p.options ?? []} onChange={(v) => set((d) => { d.prompts[i].options = v; })} />
            <label className="mt-3 block">
              <span className="step">Expected choice</span>
              <select className="field mt-1" value={p.expected ?? ""} onChange={(e) => set((d) => { d.prompts[i].expected = e.target.value; })}>
                {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </>}
        </Section>
      ))}

      <Proposals token={token} id={id} pending={orig.pending} dirty={dirty} instruction={instruction} onChange={(d) => { setOrig(d); setDraft(structuredClone(d)); }} />

      {orig.history?.length > 0 && (
        <Section title="Versions">
          <ul className="space-y-1 font-mono text-xs text-paper/60">
            {orig.history.map((h) => <li key={h.version}>v{h.version} · {h.edited_by} · {when(h.edited_at)} · {h.review_status} · {(h.changed ?? []).join(", ")}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}

const Section = ({ title, sub, children }) => (
  <section className="mt-6 rounded-2xl border border-paper/15 bg-white/5 p-4">
    <h2 className="font-display text-2xl">{title}{sub && <span className="ml-2 font-mono text-xs text-paper/50">{sub}</span>}</h2>
    <div className="mt-2 space-y-3">{children}</div>
  </section>
);

// One text field with "Ask the AI" beside it. The proposal sits under the field until accepted or discarded.
function Field({ label, path, value, onChange, ask, multiline, mono, small }) {
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { setProposal(await ask(path)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const cls = `field ${mono ? "font-mono" : ""} ${small ? "py-1.5 text-sm" : ""}`;
  return (
    <label className="block">
      <span className="flex items-center gap-2">
        <span className="step">{label}</span>
        <button type="button" className="ml-auto rounded-full border border-paper/20 px-2.5 py-0.5 text-xs text-paper/70 transition hover:border-gloo hover:text-gloo disabled:opacity-40" disabled={busy} onClick={go} title={`Ask the AI for ${path}`}>{busy ? "Asking…" : "Ask the AI"}</button>
      </span>
      {multiline
        ? <textarea className={`${cls} mt-1`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className={`${cls} mt-1`} value={value} onChange={(e) => onChange(e.target.value)} />}
      {err && <span className="mt-1 block text-xs text-red-300">{err}</span>}
      {proposal !== null && (
        <span className="mt-2 block rounded-xl border border-gloo/60 bg-gloo/10 p-3 text-sm">
          <span className="step">AI proposal</span>
          <span className="mt-1 block whitespace-pre-wrap">{proposal}</span>
          <span className="mt-2 flex gap-2">
            <button type="button" className="btn-light px-3 py-1 text-sm" onClick={() => { onChange(proposal); setProposal(null); }}>Accept</button>
            <button type="button" className="btn-ghost" onClick={() => setProposal(null)}>Discard</button>
          </span>
        </span>
      )}
    </label>
  );
}

// The reviewer's proposals for the whole lesson. "Review this lesson" asks the server (deterministic checks, then the
// model); proposals wait on the lesson until Accept selected (one new version) or Discard. Flags without a replacement
// have no checkbox: they are for the owner to fix by hand.
const show = (v) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
function Proposals({ token, id, pending, dirty, instruction, onChange }) {
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const proposals = pending?.proposals ?? [];
  const applicable = proposals.filter((p) => p.after != null);
  const run = async (label, method, path, body) => {
    setBusy(label); setErr("");
    try { onChange(await call(token, method, path, body)); setPicked(new Set()); } catch (e) { setErr(e.problems?.length ? `${e.message}: ${e.problems.join("; ")}` : e.message); }
    finally { setBusy(""); }
  };
  const toggle = (path) => setPicked((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
  return (
    <Section title="Review" sub={pending ? `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} · ${pending.by}, ${when(pending.created_at)}` : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-light" disabled={Boolean(busy)} onClick={() => run("review", "POST", `/api/admin/lessons/${id}/review`, instruction.trim() ? { instruction: instruction.trim() } : {})}>{busy === "review" ? "Reviewing…" : "Review this lesson"}</button>
        {proposals.length > 0 && <>
          <button type="button" className="btn-light" disabled={Boolean(busy) || dirty || !picked.size} title={dirty ? "Save or discard your own edits first" : ""} onClick={() => run("accept", "POST", `/api/admin/lessons/${id}/proposals/accept`, { paths: [...picked] })}>{busy === "accept" ? "Applying…" : `Accept selected (${picked.size})`}</button>
          <button type="button" className="btn-ghost" disabled={Boolean(busy)} onClick={() => setPicked(new Set(applicable.map((p) => p.path)))}>Select all</button>
          <button type="button" className="btn-ghost" disabled={Boolean(busy)} onClick={() => run("discard", "POST", `/api/admin/lessons/${id}/proposals/discard`)}>{busy === "discard" ? "…" : "Discard"}</button>
        </>}
      </div>
      {err && <p className="text-sm text-red-300">{err}</p>}
      {pending?.notes?.length > 0 && <ul className="list-disc pl-5 text-sm text-paper/70">{pending.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {pending && !proposals.length && <p className="text-sm text-paper/60">Nothing to change.</p>}
      <ul className="space-y-2">
        {proposals.map((p) => (
          <li key={p.path} className={`rounded-xl border p-3 text-sm ${p.severity === "fix" ? "border-red-300/50" : "border-paper/15"}`}>
            <label className="flex items-start gap-2">
              {p.after != null ? <input type="checkbox" className="mt-1" checked={picked.has(p.path)} onChange={() => toggle(p.path)} /> : <span className="mt-1 w-[13px] text-center text-xs text-paper/40" title="No replacement: fix by hand">!</span>}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{p.path}</span><span className={`chip text-xs ${p.severity === "fix" ? "border-red-300/60 bg-red-300/10" : "border-paper/30"}`}>{p.severity}</span></span>
                <span className="mt-1 block text-paper/80">{p.reason}</span>
                <span className="mt-2 grid gap-2 sm:grid-cols-2">
                  <span className="block rounded-lg bg-black/30 p-2 font-mono text-xs whitespace-pre-wrap text-paper/60"><span className="step">before</span>{show(p.before)}</span>
                  <span className="block rounded-lg bg-gloo/10 p-2 font-mono text-xs whitespace-pre-wrap"><span className="step">after</span>{p.after == null ? "no replacement proposed" : show(p.after)}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// A list edited as text: "a | b | c", one group per line when groups is set. Keeps its own text while typing.
function ListField({ label, help, value, onChange, groups }) {
  const toText = (v) => (groups ? v.map((g) => g.join(" | ")).join("\n") : v.join(" | "));
  const [text, setText] = useState(() => toText(value));
  const parse = (t) => {
    const line = (l) => l.split("|").map((s) => s.trim()).filter(Boolean);
    return groups ? t.split("\n").map(line).filter((g) => g.length) : line(t);
  };
  return (
    <label className="block">
      <span className="step">{label}</span>
      {groups
        ? <textarea className="field mt-1 font-mono text-sm" rows={Math.max(2, value.length + 1)} value={text} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />
        : <input className="field mt-1 font-mono text-sm" value={text} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />}
      <span className="mt-1 block text-xs text-paper/50">{help}</span>
    </label>
  );
}

// Only what changed, as the server's merge-patch shape: top-level fields; roles, prompts and options by id or index.
export function buildPatch(orig, draft) {
  const patch = {};
  for (const k of ["title", "summary", "definition"]) if (!same(orig[k], draft[k])) patch[k] = draft[k];
  const pron = {};
  for (const k of ["approx", "ipa", "note"]) if (!same(orig.pronunciation?.[k] ?? null, draft.pronunciation?.[k] ?? null)) pron[k] = draft.pronunciation?.[k] ?? null;
  if (Object.keys(pron).length) patch.pronunciation = pron;

  const roles = [];
  draft.roles.forEach((r, i) => {
    const o = orig.roles[i] ?? {};
    const item = {};
    for (const k of ["label", "part", "say", "ipa", "sound_like", "meaning"]) if (!same(o[k] ?? null, r[k] ?? null)) item[k] = r[k] ?? null;
    if (r.pick) {
      const pick = {};
      if (!same(o.pick?.question, r.pick.question)) pick.question = r.pick.question;
      const options = [];
      r.pick.options.forEach((op, j) => {
        const oo = o.pick?.options?.[j] ?? {};
        const ch = {};
        for (const k of ["name", "wiki"]) if (!same(oo[k] ?? null, op[k] ?? null)) ch[k] = op[k] ?? null;
        if (Object.keys(ch).length) options.push({ index: j, ...ch });
      });
      if (options.length) pick.options = options;
      if (Object.keys(pick).length) item.pick = pick;
    }
    if (Object.keys(item).length) roles.push({ id: r.id, ...item });
  });
  if (roles.length) patch.roles = roles;

  const prompts = [];
  draft.prompts.forEach((p, i) => {
    const o = orig.prompts[i] ?? {};
    const item = {};
    for (const k of ["question", "hint", "answer", "accept_all", "accept_any", "expected", "options"]) if (!same(o[k] ?? null, p[k] ?? null)) item[k] = p[k] ?? null;
    if (Object.keys(item).length) prompts.push({ id: p.id, ...item });
  });
  if (prompts.length) patch.prompts = prompts;
  return patch;
}
