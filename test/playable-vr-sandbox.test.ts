import { expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";

it("exports visible buttons from the current playable surface into ERP coordinates", async () => {
  const window = new Window();
  Object.defineProperty(window, "top", { value: {} });
  Object.defineProperty(window, "origin", { value: "null" });
  Object.assign(globalThis, {
    MutationObserver: window.MutationObserver,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    ShadowRoot: window.ShadowRoot,
    Event: window.Event,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  const document = window.document as unknown as Document;
  const host = new DocumentPlayableSurfaceHost(document, async () => ({
    mount: async () => {},
  }));
  await host.mountNode(
    {
      id: "start",
      html: '<main><button style="display:block">Continue</button></main>',
      css: "",
      javascript: "",
      inputs: [],
    },
    {
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );

  const surface = document.querySelector<HTMLElement>(
    '[data-playable-surface="start"]',
  )!;
  const button =
    surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
  surface.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1920,
    bottom: 1080,
    width: 1920,
    height: 1080,
    toJSON: () => ({}),
  });
  button.getBoundingClientRect = () => ({
    x: 480,
    y: 270,
    left: 480,
    top: 270,
    right: 720,
    bottom: 378,
    width: 240,
    height: 108,
    toJSON: () => ({}),
  });

  const buttons = host.inspectVrButtons("start", {
    width: 1920,
    height: 1080,
  });

  expect(buttons).toHaveLength(1);
  expect(buttons[0]).toMatchObject({
    label: "Continue",
    x: 0.25,
    y: 0.25,
    width: 0.125,
    height: 0.1,
  });
  host.destroy();
  window.close();
});

it("keeps a hold charge alive past its hide time and routes completion", async () => {
  const window = new Window();
  Object.defineProperties(window, {
    top: { value: {} },
    origin: { value: "null" },
  });
  Object.assign(globalThis, {
    MutationObserver: window.MutationObserver,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    ShadowRoot: window.ShadowRoot,
    Event: window.Event,
    PointerEvent: window.PointerEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  let now = 0;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length as unknown as ReturnType<
      typeof window.requestAnimationFrame
    >;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const document = window.document as unknown as Document;
  const emit = vi.fn(async () => {});
  const host = new DocumentPlayableSurfaceHost(document, async () => ({
    mount: async () => {
      const surface = document.querySelector<HTMLElement>(
        '[data-playable-surface="start"]',
      )!;
      surface.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 1920,
          bottom: 1080,
          width: 1920,
          height: 1080,
        }) as DOMRect;
      const button = surface.shadowRoot!.querySelector<HTMLButtonElement>(
        "button",
      )!;
      button.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 200,
          bottom: 80,
          width: 200,
          height: 80,
        }) as DOMRect;
      Object.defineProperties(button, {
        offsetWidth: { configurable: true, value: 200 },
        offsetHeight: { configurable: true, value: 80 },
      });
      Object.defineProperty(button, "animate", {
        configurable: true,
        value: () => ({
          id: "",
          playState: "running",
          finished: Promise.resolve(),
          cancel() {},
        }),
      });
    },
  }));
  await host.mountNode(
    {
      id: "start",
      html: `<main><button aria-label="Charge"
        data-putenggame-button-preset
        data-signal="charged"
        data-putenggame-motion="hold-charge"
        data-putenggame-motion-mode="interactive"
        data-putenggame-motion-duration="4"
        data-putenggame-motion-interaction="hold"
        data-putenggame-motion-signal="charged"
        style="--putenggame-appear-at: 0s; --putenggame-disappear-at: 2s"
      ></button></main>`,
      css: "",
      javascript: "",
      inputs: [],
    },
    {
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );

  const button = document.querySelector<HTMLElement>(
    '[data-playable-surface="start"]',
  )?.shadowRoot?.querySelector<HTMLButtonElement>("button")!;
  const vrButton = host.inspectVrButtons("start", {
    width: 1920,
    height: 1080,
  })[0]!;
  expect(vrButton.holdToCharge).toBe(true);

  host.pressVrButton("start", vrButton.id, "start");
  now = 1000;
  frames.at(-1)!(now);
  expect(
    button.querySelector<HTMLElement>("[data-putenggame-motion-fill]")?.style
      .transform,
  ).toBe("scaleX(0.25)");

  now = 3000;
  host.updateAppearanceTiming([]);
  expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);

  now = 4000;
  frames.at(-1)!(now);
  expect(emit).toHaveBeenCalledWith("charged");
  host.destroy();
  window.close();
  vi.restoreAllMocks();
});
