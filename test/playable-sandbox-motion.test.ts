// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { PlayableNodeContext } from "../src/shared/playable-nodes.js";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";
import {
  PLAYABLE_MOTION_ATTRIBUTES,
  type PlayableMotionConfig,
} from "../src/shared/playable-motion.js";
import { PLAYABLE_SOURCE_ATTRIBUTE } from "../src/shared/playable-source-locations.js";

let host: DocumentPlayableSurfaceHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
  document.body.replaceChildren();
});

it("updates a selected button's effect color in the live surface without replacing it", async () => {
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

  const source = "nodes/start/index.html:1:1";
  await host.mountNode(
    {
      id: "start",
      html: `<main><button id="choice" ${PLAYABLE_SOURCE_ATTRIBUTE}="${source}" ${PLAYABLE_MOTION_ATTRIBUTES.kind}="button-feedback" ${PLAYABLE_MOTION_ATTRIBUTES.mode}="visual" ${PLAYABLE_MOTION_ATTRIBUTES.duration}="0.1" ${PLAYABLE_MOTION_ATTRIBUTES.feedback}="hover-press" ${PLAYABLE_MOTION_ATTRIBUTES.pressEffect}="green-particle-burst" ${PLAYABLE_MOTION_ATTRIBUTES.effectColor}="#00ff00">Continue</button></main>`,
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
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => false,
      },
    } as Omit<PlayableNodeContext, "root">,
  );

  const surface = document.querySelector<HTMLElement>(
    '[data-playable-surface="start"]',
  )!;
  const button = surface.shadowRoot!.querySelector<HTMLButtonElement>(
    "#choice",
  )!;
  const config: PlayableMotionConfig = {
    kind: "button-feedback",
    mode: "visual",
    duration: 0.1,
    feedback: "hover-press",
    pressEffect: "green-particle-burst",
    effectColor: "#fe4120",
  };
  host.updateMotion({
    sequence: 1,
    target: {
      kind: "element",
      pick: {
        nodeId: "start",
        source,
        cssPath: "#choice",
        tag: "button",
        text: "Continue",
        box: { x: 0, y: 0, width: 100, height: 40 },
      },
    },
    config,
  });

  expect(document.querySelector('[data-playable-surface="start"]')).toBe(
    surface,
  );
  expect(surface.shadowRoot!.querySelector("#choice")).toBe(button);
  expect(
    button.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.effectColor),
  ).toBe("#fe4120");
});

it("shows the back preset after the backdrop video ends and returns to the prior scene", async () => {
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
  const back = vi.fn(async () => {});

  await host.mountNode(
    {
      id: "ending",
      html: `<main><div data-media="backdrop"></div><button id="back" data-putenggame-button-preset ${PLAYABLE_MOTION_ATTRIBUTES.buttonAction}="back" ${PLAYABLE_MOTION_ATTRIBUTES.showAfterVideoEnd}>返回</button></main>`,
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
        emit: async () => {},
        fail: async () => {},
        back,
        connected: () => false,
      },
    } as Omit<PlayableNodeContext, "root">,
  );

  const surface = document.querySelector<HTMLElement>(
    '[data-playable-surface="ending"]',
  )!;
  const button = surface.shadowRoot!.querySelector<HTMLButtonElement>("#back")!;
  expect(button.hasAttribute("data-playable-timing-hidden")).toBe(true);

  const backdrop = surface.shadowRoot!.querySelector<HTMLElement>(
    '[data-media="backdrop"]',
  )!;
  const video = document.createElement("video");
  backdrop.append(video);
  await new Promise((resolve) => setTimeout(resolve, 0));

  let currentTime = 0;
  Object.defineProperty(video, "duration", { configurable: true, value: 10 });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => currentTime,
  });

  video.dispatchEvent(new Event("timeupdate"));
  expect(button.hasAttribute("data-playable-timing-hidden")).toBe(true);
  expect(back).not.toHaveBeenCalled();

  currentTime = 10;
  video.dispatchEvent(new Event("timeupdate"));
  expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
  button.click();
  await Promise.resolve();
  expect(back).toHaveBeenCalledOnce();
});
