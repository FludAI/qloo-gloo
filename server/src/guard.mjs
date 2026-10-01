// Qloo rule: never send personal data (emails, phone numbers, device IDs).
// Block the obvious patterns before any call. This is a backstop, not a
// substitute for the UI only ever asking for aggregate concepts.
const PATTERNS = [
  [/[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i, "email address"],
  [/(?:\+\d{1,3}[\s.-]?)?\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "phone number"],
  [/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/i, "device/MAC identifier"],
  [/\b(?:idfa|gaid|adid|device[_ ]?id)\b/i, "device identifier"],
];

export function findPersonalData(value) {
  const text = JSON.stringify(value ?? "");
  for (const [re, label] of PATTERNS) if (re.test(text)) return label;
  return null;
}
