// The owner API client shared by the console's modes. The token is asked once per tab (sessionStorage,
// the same key Edit.jsx reads) and sent as x-gloo-admin on every call.
export const TOKEN_KEY = "gloo_admin_token";
export const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
export const writeToken = (t) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

export async function call(token, method, path, body) {
  const res = await fetch(path, { method, headers: { "x-gloo-admin": token, ...(body && { "content-type": "application/json" }) }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error ?? `HTTP ${res.status}`); e.status = res.status; e.code = data.code; e.problems = data.problems ?? []; throw e; }
  return data;
}

export const lessonApi = (token, id) => {
  const base = `/api/admin/lessons/${encodeURIComponent(id)}`;
  return {
    get: () => call(token, "GET", base),
    patch: (patch) => call(token, "PATCH", base, patch),
    suggest: (field, instruction) => call(token, "POST", `${base}/suggest`, { field, ...(instruction && { instruction }) }),
    review: (instruction) => call(token, "POST", `${base}/review`, instruction ? { instruction } : {}),
    accept: (paths, keepRest) => call(token, "POST", `${base}/proposals/accept`, { paths, ...(keepRest && { keep_rest: true }) }),
    discard: () => call(token, "POST", `${base}/proposals/discard`),
    transcribe: (pcm16) => call(token, "POST", "/api/transcribe", { pcm16 }),
  };
};
