import { describe, expect, it } from "vitest";
import {
  defaultPlayableReturnButton,
  normalizePlayableReturnButton,
  normalizePlayableReturnButtonPosition,
} from "../src/shared/playable-return-button.js";

describe("Playable return button placement", () => {
  const viewport = { width: 1280, height: 720 };

  it("defaults in the upper-right corner, clear of the settings button", () => {
    expect(defaultPlayableReturnButton(viewport)).toEqual({
      x: 1247 / 1280,
      y: 33 / 720,
      size: 42,
    });
  });

  it("clamps dragged centers using the actual button size", () => {
    expect(
      normalizePlayableReturnButton({ x: -1, y: 2, size: 64 }, viewport),
    ).toEqual({
      x: 32 / 1280,
      y: 1 - 32 / 720,
      size: 64,
    });
  });

  it("keeps the displayed center fixed when the button size changes", () => {
    expect(
      normalizePlayableReturnButtonPosition(
        { x: 0.12, y: 0.24, size: 96 },
        viewport,
      ),
    ).toEqual({ x: 0.12, y: 0.24 });
  });

  it("uses the default position and size for invalid values", () => {
    expect(
      normalizePlayableReturnButton(
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, size: Number.NaN },
        viewport,
      ),
    ).toEqual(defaultPlayableReturnButton(viewport));
  });

  it("clamps the size to its supported range", () => {
    expect(normalizePlayableReturnButton({ size: 1000 }, viewport).size).toBe(
      128,
    );
    expect(normalizePlayableReturnButton({ size: 1 }, viewport).size).toBe(24);
  });
});
