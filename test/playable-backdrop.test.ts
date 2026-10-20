import { describe, expect, it } from "vitest";
import { PLAYABLE_PRESETS } from "../src/daemon/playable-presets.js";
import {
  clearPlayableBackdrop,
  playableBackdrop,
  playableBackdropAsset,
  playableBackdropLoops,
  playablePictureInPictureVideoLoops,
  setPlayableBackdrop,
  setPlayableBackdropLoop,
  setPlayablePictureInPictureVideoLoop,
} from "../src/shared/playable-backdrop.js";

describe("setPlayableBackdrop", () => {
  it("sets the background of every Template", () => {
    for (const { id } of PLAYABLE_PRESETS) {
      const { html } = PLAYABLE_PRESETS.find((preset) => preset.id === id)!.source("Opening");
      expect(playableBackdrop(html)).toBe("missing");
      const edited = setPlayableBackdrop(html, "opening", "video")!;
      expect(edited).toMatch(/<div class="backdrop[^"]*" data-media="backdrop" data-asset="opening" data-type="video">/);
      expect(playableBackdrop(edited)).toBe("set");
      // Everything but the background tag stays as it was.
      expect(edited.replace(/<div class="backdrop[^>]*>/, "")).toBe(html.replace(/<div class="backdrop[^>]*>/, ""));
    }
  });

  it("replaces the Asset it showed before", () => {
    const html = `<main><div data-type='video' class="backdrop" data-asset="old" data-media='backdrop'/></main>`;
    expect(setPlayableBackdrop(html, "still", "image")).toBe(
      `<main><div class="backdrop" data-media='backdrop' data-asset="still" data-type="image"/></main>`,
    );
  });

  it("leaves HTML without a single background alone", () => {
    expect(playableBackdrop("<main><h1>Title</h1></main>")).toBeUndefined();
    expect(setPlayableBackdrop("<main></main>", "a", "image")).toBeUndefined();
    const two = '<div data-media="backdrop"></div><div data-media="backdrop"></div>';
    expect(setPlayableBackdrop(two, "a", "image")).toBeUndefined();
  });
});

describe("clearPlayableBackdrop", () => {
  it("takes the Asset off every Template's background", () => {
    for (const { source } of PLAYABLE_PRESETS) {
      const { html } = source("Opening");
      const cleared = clearPlayableBackdrop(setPlayableBackdrop(html, "opening", "video")!)!;
      expect(cleared).toBe(html);
      expect(playableBackdrop(cleared)).toBe("missing");
    }
  });

  it("keeps the background tag's other attributes", () => {
    const html = `<main><div data-type='video' class="backdrop" data-asset="old" data-media='backdrop'/></main>`;
    expect(clearPlayableBackdrop(html)).toBe(`<main><div class="backdrop" data-media='backdrop'/></main>`);
  });

  it("leaves HTML without a single background alone", () => {
    expect(clearPlayableBackdrop("<main></main>")).toBeUndefined();
    expect(clearPlayableBackdrop('<div data-media="backdrop"></div><div data-media="backdrop"></div>')).toBeUndefined();
  });
});

describe("playableBackdropAsset", () => {
  it("reads the exact media asset used by the runtime background", () => {
    expect(playableBackdropAsset('<main><div class="backdrop" data-media="backdrop" data-asset="opening" data-type="video"></div></main>')).toEqual({ assetId: "opening", type: "video" });
    expect(playableBackdropAsset('<main><div data-media="backdrop" data-asset="still" data-type="image"></div></main>')).toEqual({ assetId: "still", type: "image" });
  });

  it("ignores missing or unsupported background metadata", () => {
    expect(playableBackdropAsset('<main><div data-media="backdrop" data-asset="opening"></div></main>')).toBeUndefined();
    expect(playableBackdropAsset('<main><div data-media="backdrop" data-asset="model" data-type="model"></div></main>')).toBeUndefined();
  });
});

describe("background video loop preference", () => {
  it("defaults to single playback and stores the choice on this Node's backdrop", () => {
    const html =
      '<main><div class="backdrop" data-media="backdrop" data-asset="opening" data-type="video"></div></main>';
    const looping = setPlayableBackdropLoop(html, true)!;
    expect(looping).toContain('data-loop="true"');
    expect(playableBackdropLoops(looping)).toBe(true);
    expect(playableBackdropLoops(html)).toBe(false);
    expect(playableBackdropLoops(setPlayableBackdropLoop(looping, false)!)).toBe(
      false,
    );
  });

  it("preserves the preference when changing or removing the media asset", () => {
    const html =
      '<main><div class="backdrop" data-media="backdrop" data-asset="opening" data-type="video" data-loop="true"></div></main>';
    expect(playableBackdropLoops(setPlayableBackdrop(html, "next", "video")!))
      .toBe(true);
    expect(playableBackdropLoops(clearPlayableBackdrop(html)!)).toBe(true);
  });

  it("does not alter other Nodes when a loop preference is set", () => {
    const html =
      '<main><div data-media="backdrop"></div><div data-media="backdrop"></div></main>';
    expect(setPlayableBackdropLoop(html, true)).toBeUndefined();
  });
});

describe("picture-in-picture video loop preference", () => {
  it("defaults to loop and stores the setting on the Node", () => {
    const html =
      '<main><video id="putenggame-media-one" autoplay muted loop playsinline></video></main>';
    expect(playablePictureInPictureVideoLoops(html)).toBe(true);
    const once = setPlayablePictureInPictureVideoLoop(html, false)!;
    expect(once).toContain('data-picture-in-picture-video-loop="false"');
    expect(once).not.toMatch(/<video[^>]*\sloop(?:\s|>)/);
    expect(playablePictureInPictureVideoLoops(once)).toBe(false);
    const looping = setPlayablePictureInPictureVideoLoop(once, true)!;
    expect(looping).toMatch(/<video[^>]*\sloop(?:\s|>)/);
    expect(playablePictureInPictureVideoLoops(looping)).toBe(true);
  });

  it("updates only editor-inserted videos and preserves ordinary videos", () => {
    const html =
      '<main><video id="story-video" loop></video><video id="putenggame-media-one" loop></video><video id="putenggame-media-two"></video></main>';
    const once = setPlayablePictureInPictureVideoLoop(html, false)!;
    expect(once).toContain('<video id="story-video" loop>');
    expect(once).not.toContain('<video id="putenggame-media-one" loop>');
    expect(once).not.toContain('<video id="putenggame-media-two" loop>');
    expect(playablePictureInPictureVideoLoops(once)).toBe(false);
  });
});
