// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { PlayableNodeContext } from "../src/shared/playable-nodes.js";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";
import type { PlayableMotionCommand } from "../src/shared/playable-player-protocol.js";

let host: DocumentPlayableSurfaceHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("exposes and activates published buttons without editor source attributes", async () => {
  Object.defineProperty(window, "origin", {
    configurable: true,
    value: "null",
  });
  Object.defineProperty(window, "top", {
    configurable: true,
    value: {},
  });
  host = new DocumentPlayableSurfaceHost(document, async () => ({
    mount: () => undefined,
  }));
  await host.mountNode(
    {
      id: "start",
      html: '<main><button aria-label="Start" data-putenggame-motion="button-feedback" data-putenggame-motion-mode="visual" data-putenggame-motion-duration="5" data-putenggame-motion-feedback="hover-press">Start</button></main>',
      css: "",
      javascript: "",
      inputs: [],
    },
    {
      assets: { url: () => "" },
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
        emit: async () => clicked(),
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    } as never,
  );

  const surface = document.querySelector<HTMLElement>(
    '[data-playable-surface="start"]',
  )!;
  const button = surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
  const clicked = vi.fn();
  button.addEventListener("click", clicked);
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(button.style.transform).toContain("scale(1.08)");
  button.dispatchEvent(
    new PointerEvent("pointerleave", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(button.style.transform).not.toContain("scale(1.08)");
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1920,
    bottom: 1080,
    width: 1920,
    height: 1080,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    x: 200,
    y: 300,
    left: 200,
    top: 300,
    right: 500,
    bottom: 380,
    width: 300,
    height: 80,
    toJSON: () => ({}),
  } as DOMRect);

  const [vrButton] = host.inspectVrButtons("start", {
    width: 1920,
    height: 1080,
  });
  expect(vrButton).toMatchObject({
    label: "Start",
    x: 200 / 1920,
    y: 300 / 1080,
    width: 300 / 1920,
    height: 80 / 1080,
  });
  expect(vrButton?.id).toMatch(/^vr-button-/);

  host.activateVrButton("start", vrButton!.id);
  expect(clicked).toHaveBeenCalledOnce();
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

it("replaces a charge progress image without losing its progress behavior", async () => {
  Object.defineProperty(window, "origin", {
    configurable: true,
    value: "null",
  });
  Object.defineProperty(window, "top", {
    configurable: true,
    value: {},
  });
  vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:progress-preview")
    .mockReturnValueOnce("blob:progress-applied");
  const revokeObjectURL = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => {});
  host = new DocumentPlayableSurfaceHost(document, async () => ({
    mount: () => undefined,
  }));
  await host.mountNode(
    {
      id: "start",
      html: '<main><button id="charge" data-putenggame-source="nodes/start/index.html:1:7" data-putenggame-motion="hold-charge" data-putenggame-motion-mode="interactive" data-putenggame-motion-duration="3" data-putenggame-motion-interaction="hold" data-putenggame-motion-bar-asset="old-progress" data-putenggame-button-asset="button-image">Charge</button></main>',
      css: "",
      javascript: "",
      inputs: [],
    },
    {
      assets: { url: () => "blob:old-progress" },
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
        connected: () => true,
      },
    } as never,
  );

  const source = "nodes/start/index.html:1:7";
  const bytes = new ArrayBuffer(4);
  host.controlMedia({
    command: "motion-progress-preview",
    nodeId: "start",
    cssPath: "#charge",
    source,
    scale: 125,
    offsetX: 4,
    offsetY: -12,
    circular: true,
    barLayer: "bottom",
    asset: { contentType: "image/png", bytes },
  });
  const preview = document.querySelector<HTMLElement>(
    "[data-playable-surface='start']",
  )!.shadowRoot!.querySelector<HTMLElement>(
    "[data-putenggame-motion-progress-preview]",
  )!;
  const previewImage = preview.querySelector<SVGImageElement>("svg image")!;
  expect(preview.style.inset).toBe("0");
  expect(preview.style.zIndex).toBe("-2");
  expect(previewImage.getAttribute("width")).toBe("125");
  expect(previewImage.getAttribute("height")).toBe("125");
  expect(previewImage.getAttribute("x")).toBe("-9.14");
  expect(previewImage.getAttribute("y")).toBe("-12.932");
  expect(
    preview.parentElement?.querySelector<HTMLElement>(
      "[data-putenggame-button-asset-image]",
    )?.style.zIndex,
  ).toBe("-1");
  const pick = {
    nodeId: "start",
    source,
    cssPath: "#charge",
    tag: "button",
    text: "Charge",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };
  const command: PlayableMotionCommand = {
    sequence: 1,
    target: { kind: "element", pick },
    config: {
      kind: "hold-charge",
      mode: "interactive",
      duration: 3,
      interaction: "hold",
      buttonShape: "circle",
      barAssetId: "new-progress",
      barLayer: "bottom",
    },
    assetId: "button-image",
    barAsset: { contentType: "image/png", bytes },
  };
  host.updateMotion(command);

  const button = document
    .querySelector<HTMLElement>('[data-playable-surface="start"]')!
    .shadowRoot!.querySelector<HTMLButtonElement>("#charge")!;
  const progressImages = button.querySelectorAll(
    "svg image[data-putenggame-motion-bar]",
  );
  expect(progressImages).toHaveLength(1);
  expect(progressImages[0]?.getAttribute("href")).toBe(
    "blob:progress-applied",
  );
  expect(button.getAttribute("data-putenggame-motion")).toBe("hold-charge");
  expect(button.getAttribute("data-putenggame-motion-bar-asset")).toBe(
    "new-progress",
  );
  expect(
    button.querySelector<HTMLElement>("[data-putenggame-motion-ui]")?.style
      .zIndex,
  ).toBe("-2");
  expect(button.style.isolation).toBe("isolate");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:progress-preview");
});
