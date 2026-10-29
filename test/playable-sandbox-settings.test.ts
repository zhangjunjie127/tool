// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { PlayableNodeContext } from "../src/shared/playable-nodes.js";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";

let host: DocumentPlayableSurfaceHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
  document.body.replaceChildren();
});

it("pauses and resumes the active scene without remounting it", async () => {
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
      html: '<main><div data-media="backdrop"><video></video></div></main>',
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
  const video = surface.shadowRoot!.querySelector("video")!;
  let playing = true;
  const pause = vi.fn(() => {
    playing = false;
  });
  const play = vi.fn(() => {
    playing = true;
    return Promise.resolve();
  });
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => !playing,
  });
  Object.defineProperty(video, "pause", { configurable: true, value: pause });
  Object.defineProperty(video, "play", { configurable: true, value: play });

  host.setPlayerPaused(true);
  expect(pause).toHaveBeenCalledOnce();
  expect(video.paused).toBe(true);

  host.setPlayerPaused(false);
  await Promise.resolve();
  expect(play).toHaveBeenCalledOnce();
  expect(video.paused).toBe(false);
  expect(
    document.querySelector('[data-playable-surface="start"]'),
  ).toBe(surface);
});
