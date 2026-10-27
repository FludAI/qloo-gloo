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
