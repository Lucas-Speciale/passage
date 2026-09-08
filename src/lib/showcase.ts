// Portfolio embed protocol. Interactive standalone visits are unaffected.
let initialized = false;
let parentOrigin: string | null = null;
let requestedActive = true;
let ready = false;
let generation = 0;

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const params = new URLSearchParams(window.location.search);
  if (window.parent === window || params.get("portfolio") !== "1") return;
  try {
    const origin = new URL(params.get("parentOrigin") || document.referrer);
    const local = ["localhost", "127.0.0.1"].includes(origin.hostname) && origin.protocol === "http:";
    const production = ["lucasspeciale.com", "www.lucasspeciale.com"].includes(origin.hostname) && origin.protocol === "https:";
    if (!local && !production) return;
    parentOrigin = origin.origin;
  } catch { return; }
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== "portfolio:activity") return;
    requestedActive = event.data.active === true;
  });
  window.parent.postMessage({ type: "portfolio:online" }, parentOrigin);
}

export function showcaseIsActive() {
  initialize();
  // Always allow initial rendering, even when the host has marked the scene offscreen.
  return !parentOrigin || !ready || (requestedActive && !document.hidden);
}

export function resetShowcaseReady() {
  initialize();
  ready = false;
  generation += 1;
  if (parentOrigin) window.parent.postMessage({ type: "portfolio:pending" }, parentOrigin);
}

export function notifyShowcaseReady() {
  initialize();
  if (!parentOrigin || ready) return;
  const current = generation;
  // A data/texture load is not a painted frame. Allow the renderer to complete.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (current !== generation || ready || !parentOrigin) return;
    ready = true;
    window.parent.postMessage({ type: "portfolio:ready" }, parentOrigin);
  }));
}
