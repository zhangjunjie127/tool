// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { PlayableNodeContext } from "../src/shared/playable-nodes.js";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";

let host: DocumentPlayableSurfaceHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("keeps the backdrop container and video when applying the same asset", async () => {
  Object.defineProperty(window, "origin", {
    configurable: true,
    value: "null",
  });
  Object.defineProperty(window, "top", {
    configurable: true,
    value: {},
  });
  vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:opening")
    .mockReturnValueOnce("blob:replacement");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

  host = new DocumentPlayableSurfaceHost(document, async () => ({
    mount: () => undefined,
  }));
  await host.mountNode(
    {
      id: "start",
      html: '<main><div class="backdrop" data-media="backdrop" data-asset="old" data-type="video"><video src="blob:old"></video></div></main>',
      css: "",
      javascript: "",
      inputs: [],
    },
    {
      assets: { url: () => "blob:opening" },
      state: {
        get: () => ({}),
        set: async () => {},
        patch: async () => {},
        subscribe: () => () => {},
      },
      session: {
        hasSave: () => false,
        reset: async () => {},
        continue: async () => {},
        save: async () => {},
        restart: async () => {},
      },
      story: { map: () => ({ nodes: [], edges: [] }) },
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => false,
      },
    } as Omit<PlayableNodeContext, "root">,
  );
  const backdrop = document.querySelector<HTMLElement>(
    "[data-playable-surface]",
  )!.shadowRoot!.querySelector<HTMLElement>('[data-media="backdrop"]')!;
  host.controlMedia({
    command: "set-backdrop",
    nodeId: "start",
    sequence: 1,
    asset: {
      assetId: "opening",
      type: "video",
      transfer: {
        contentType: "video/mp4",
        bytes: new ArrayBuffer(4),
      },
      loop: true,
    },
  });
  const video = backdrop.querySelector("video")!;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: 8,
  });

  host.controlMedia({
    command: "set-backdrop",
    nodeId: "start",
    sequence: 2,
    asset: {
      assetId: "opening",
      type: "video",
      transfer: {
        contentType: "video/mp4",
        bytes: new ArrayBuffer(4),
      },
      loop: false,
    },
  });

  expect(
    document.querySelector("[data-playable-surface]")!.shadowRoot!.querySelector(
      '[data-media="backdrop"]',
    ),
  ).toBe(backdrop);
  expect(backdrop.querySelector("video")).toBe(video);
  expect(video.currentTime).toBe(8);
  expect(video.loop).toBe(false);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();

  host.controlMedia({
    command: "set-backdrop",
    nodeId: "start",
    sequence: 3,
    asset: {
      assetId: "replacement",
      type: "image",
      transfer: {
        contentType: "image/png",
        bytes: new ArrayBuffer(4),
      },
    },
  });

  expect(backdrop.querySelector("video")).toBeNull();
  expect(backdrop.querySelector("img")?.src).toBe("blob:replacement");
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:opening");

  host.controlMedia({
    command: "set-backdrop",
    nodeId: "start",
    sequence: 4,
  });

  expect(backdrop.childElementCount).toBe(0);
  expect(backdrop.hasAttribute("data-asset")).toBe(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:replacement");
});
