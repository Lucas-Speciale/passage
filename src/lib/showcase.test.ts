import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("portfolio scene readiness", () => {
  const postMessage = vi.fn();
  let receive: (event: { source: unknown; origin: string; data: unknown }) => void;
  const parent = { postMessage };
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    postMessage.mockClear();
    vi.stubGlobal("window", {
      parent,
      location: { search: "?portfolio=1&parentOrigin=http://127.0.0.1:4173" },
      addEventListener: (_type: string, handler: typeof receive) => { receive = handler; },
    });
    vi.stubGlobal("document", { hidden: false, referrer: "" });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("warms an offscreen scene, then suspends it only after a painted ready frame", async () => {
    const bridge = await import("./showcase");
    expect(bridge.showcaseIsActive()).toBe(true);
    receive({ source: parent, origin: "http://127.0.0.1:4173", data: { type: "portfolio:activity", active: false } });
    expect(bridge.showcaseIsActive()).toBe(true);
    bridge.notifyShowcaseReady();
    expect(postMessage).not.toHaveBeenCalledWith({ type: "portfolio:ready" }, expect.anything());
    vi.runAllTimers();
    expect(bridge.showcaseIsActive()).toBe(false);
    receive({ source: parent, origin: "http://127.0.0.1:4173", data: { type: "portfolio:activity", active: true } });
    expect(bridge.showcaseIsActive()).toBe(true);
  });
  it("rejects activity messages from another origin or window", async () => {
    const bridge = await import("./showcase");
    bridge.notifyShowcaseReady();
    vi.runAllTimers();
    receive({ source: parent, origin: "https://example.com", data: { type: "portfolio:activity", active: false } });
    receive({ source: {}, origin: "http://127.0.0.1:4173", data: { type: "portfolio:activity", active: false } });
    expect(bridge.showcaseIsActive()).toBe(true);
  });
  it("does not publish a stale ready callback after a renderer resets", async () => {
    const bridge = await import("./showcase");
    bridge.notifyShowcaseReady();
    bridge.resetShowcaseReady();
    vi.runAllTimers();
    expect(postMessage.mock.calls.filter(([message]) => message.type === "portfolio:ready")).toHaveLength(0);
    bridge.notifyShowcaseReady();
    vi.runAllTimers();
    expect(postMessage.mock.calls.filter(([message]) => message.type === "portfolio:ready")).toHaveLength(1);
  });
});
