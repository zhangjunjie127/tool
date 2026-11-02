import { describe, expect, it } from "vitest";
import {
  defaultPlayableSettingsButtonPosition,
  normalizePlayableSettingsButtonSize,
  normalizePlayableSettingsButtonPosition,
} from "../src/shared/playable-settings-button.js";

describe("Playable game settings button placement", () => {
  const viewport = { width: 1280, height: 720 };

  it("defaults inside the upper-left corner of the game viewport", () => {
    expect(defaultPlayableSettingsButtonPosition(viewport)).toEqual({
      x: 33 / 1280,
      y: 33 / 720,
    });
  });

  it("clamps the button center so its full hit target stays inside the viewport", () => {
    expect(
      normalizePlayableSettingsButtonPosition(
        { x: -1, y: 2 },
        viewport,
      ),
    ).toEqual({
      x: 21 / 1280,
      y: 1 - 21 / 720,
    });
  });

  it("uses the default location for non-finite coordinates", () => {
    expect(
      normalizePlayableSettingsButtonPosition(
        { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        viewport,
      ),
    ).toEqual(defaultPlayableSettingsButtonPosition(viewport));
  });

  it("normalizes the shared function-button size range", () => {
    expect(normalizePlayableSettingsButtonSize(96)).toBe(96);
    expect(normalizePlayableSettingsButtonSize(1000)).toBe(128);
    expect(normalizePlayableSettingsButtonSize(1)).toBe(24);
  });
});
