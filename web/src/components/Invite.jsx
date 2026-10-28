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

// Share the link, or copy it. Returns a short line for the toast.
export async function inviteFriend(credits) {
  const url = credits?.referral?.link ?? `${location.origin}/?ref=${credits?.referral?.code ?? ""}`;
  const text = `Gloo makes hard words stick. Your first ${credits?.welcome === 2 ? "two" : credits?.welcome ?? "few"} words are on us.`;
  if (isPhone() && navigator.share) {
    try { await navigator.share({ title: "Gloo", text, url }); return "Shared."; }
    catch (e) { if (e?.name === "AbortError") return ""; }
  }
  try { await navigator.clipboard.writeText(url); return "Invite link copied."; }
  catch { return url; }
}

export function InviteButton({ credits, say, className = "btn-ghost" }) {
  return <button className={className} onClick={async () => { const m = await inviteFriend(credits); if (m) say?.(m); }}>Invite a friend</button>;
}
