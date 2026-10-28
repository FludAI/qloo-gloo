import { useEffect, useRef, useState } from "react";
import { isPhone } from "../lib/device.js";

// Gloo credits (decision 33): the balance mark is the token and a number, nothing else; the invite action hands
// the referral link to the phone's share sheet, or copies it on a desktop. No typing anywhere.

export function Balance({ credits }) {
  if (!credits) return null;
  return (
    <span className="flex h-9 items-center gap-1.5 rounded-full bg-white/15 pl-1.5 pr-3 font-mono text-sm text-paper backdrop-blur" role="status" aria-label={`${credits.balance} Gloo`}>
      <img src="/brand/gloo-token.svg" alt="" className="h-6 w-6" />
      <span>{credits.balance}</span>
    </span>
  );
}

// Share the link, or copy it. Returns { done } for the button's own label, or { show } when the link has to be shown.
export async function inviteFriend(credits) {
  const url = credits?.referral?.link ?? `${location.origin}/?ref=${credits?.referral?.code ?? ""}`;
  const text = `Gloo makes hard words stick. Your first ${credits?.welcome === 2 ? "two" : credits?.welcome ?? "few"} words are on us.`;
  if (isPhone() && navigator.share) {
    try { await navigator.share({ title: "Gloo", text, url }); return { done: "Shared" }; }
    catch (e) { if (e?.name === "AbortError") return {}; }
  }
  try { await navigator.clipboard.writeText(url); return { done: "Link copied" }; }
  catch { return { show: url }; }
}

// The confirmation is the button's own label for a moment: a toast would sit behind the lesson sheet.
export function InviteButton({ credits, say, className = "btn-ghost" }) {
  const [done, setDone] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const go = async () => {
    const r = await inviteFriend(credits);
    if (r.show) say?.(r.show);
    if (r.done) { setDone(r.done); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(""), 2500); }
  };
  return <button className={className} aria-live="polite" onClick={go}>{done || "Invite a friend"}</button>;
}
