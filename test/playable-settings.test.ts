import { describe, expect, it } from "vitest";
import {
  createPlayableSettingsService,
  DEFAULT_PLAYABLE_GAME_SETTINGS,
  isPlayableGameSettings,
  normalizePlayableGameSettings,
} from "../src/shared/playable-settings.js";

describe("Playable player settings", () => {
  it("normalizes persisted values without accepting out-of-range settings", () => {
    expect(
      normalizePlayableGameSettings({
        videoVolume: 2,
        brightness: 20,
        displayMode: "unsupported",
        subtitleFontSize: 250,
        subtitleCues: [{ startSeconds: 4, endSeconds: 2, text: "bad cue" }],
      }),
    ).toMatchObject({
      videoVolume: 1,
      brightness: 50,
      displayMode: DEFAULT_PLAYABLE_GAME_SETTINGS.displayMode,
      subtitleFontSize: 200,
      subtitleCues: [],
    });
    expect(
      isPlayableGameSettings({
        ...DEFAULT_PLAYABLE_GAME_SETTINGS,
        videoVolume: 1.2,
      }),
    ).toBe(false);
    expect(
      isPlayableGameSettings({
        ...DEFAULT_PLAYABLE_GAME_SETTINGS,
        subtitleCues: [
          { startSeconds: 4, endSeconds: 2, text: "bad cue" },
        ],
      }),
    ).toBe(false);
  });

  it("keeps draft changes separate from save, reset, and discard", async () => {
    const writes: number[] = [];
    const settings = createPlayableSettingsService(
      { videoVolume: 0.4 },
      async (snapshot) => {
        writes.push(snapshot.videoVolume);
      },
    );

    settings.set("videoVolume", 0.25);
    expect(settings.get("videoVolume")).toBe(0.25);
    expect(settings.hasUnsavedChanges()).toBe(true);
    expect(writes).toEqual([]);

    await settings.save();
    expect(settings.hasUnsavedChanges()).toBe(false);
    expect(writes).toEqual([0.25]);

    settings.reset();
    expect(settings.get("videoVolume")).toBe(
      DEFAULT_PLAYABLE_GAME_SETTINGS.videoVolume,
    );
    expect(settings.hasUnsavedChanges()).toBe(true);

    settings.discard();
    expect(settings.get("videoVolume")).toBe(0.25);
    expect(settings.hasUnsavedChanges()).toBe(false);
  });

  it("publishes isolated snapshots and leaves a failed save dirty", async () => {
    const settings = createPlayableSettingsService(undefined, async () => {
      throw new Error("storage full");
    });
    let observed = 0;
    const unsubscribe = settings.subscribe((snapshot) => {
      observed = snapshot.brightness;
      snapshot.subtitleCues.push({
        startSeconds: 0,
        endSeconds: 1,
        text: "listener mutation",
      });
    });

    settings.set("brightness", 125);
    expect(observed).toBe(125);
    expect(settings.get("subtitleCues")).toEqual([]);
    await expect(settings.save()).rejects.toThrow("storage full");
    expect(settings.hasUnsavedChanges()).toBe(true);
    unsubscribe();
  });
});
