// Which surface the word is on. A phone looks at paper through its rear camera; a desktop usually
// has the word on its own screen and a webcam that faces the wrong way, so it shares a window instead.
export const isPhone = () => {
  if (typeof navigator === "undefined") return false;
  const coarse = matchMedia?.("(pointer: coarse)").matches;
  const ua = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)); // iPadOS says Mac
  return coarse && (ua || innerWidth < 900);
};
export const canShareScreen = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia) && !isPhone();
export const canUseCamera = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

// The image in a paste or a drop, if there is one.
export function imageFrom(dataTransfer) {
  const items = [...(dataTransfer?.items ?? [])];
  const it = items.find((x) => x.kind === "file" && x.type.startsWith("image/"));
  if (it) return it.getAsFile();
  const f = [...(dataTransfer?.files ?? [])].find((x) => x.type.startsWith("image/"));
  return f ?? null;
}

// How to unblock the microphone on this device, said once; a refused mic needs a settings change and a reload.
export const micFix = () => isIOS()
  ? "Microphone is blocked. Tap aA in the address bar, then Website Settings, set Microphone to Allow, and reload."
  : isPhone() ? "Microphone is blocked. Tap the lock in the address bar, allow the microphone, and reload."
  : "Microphone is blocked. Click the camera icon in the address bar, allow the microphone, and reload.";
export const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)));

// The embedded browser inside another app: on iOS it has no camera, or asks and then fails without a word.
// Returns the app's name, or null in a real browser.
const IN_APP = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"], [/Instagram/, "Instagram"], [/LinkedInApp/, "LinkedIn"], [/Twitter|X\/iOS|XApp/, "X"],
  [/Line\//, "LINE"], [/Snapchat/, "Snapchat"], [/BytedanceWebview|TikTok|musical_ly/, "TikTok"], [/GSA\//, "the Google app"],
  [/Slack/, "Slack"], [/Teams\//, "Teams"], [/DiscordAndroid|Discord\//, "Discord"], [/Pinterest/, "Pinterest"], [/WhatsApp/, "WhatsApp"],
  [/Messenger|MessengerLite/, "Messenger"], [/Gmail/, "Gmail"], [/Outlook-iOS|Outlook-Android/, "Outlook"],
  [/; wv\)/, "another app"], // Android WebView
];
export function inAppBrowser() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  // iOS: a WKWebView has no "Safari/" token although it says "Version/x Mobile"; Chrome and Firefox name themselves.
  if (isIOS() && /Mobile\//.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPT\//.test(ua)) return "another app";
  return null;
}
