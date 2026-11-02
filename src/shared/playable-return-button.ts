import {
  MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
  MIN_PLAYABLE_FUNCTION_BUTTON_SIZE,
  normalizePlayableFunctionButtonSize,
  PLAYABLE_FUNCTION_BUTTON_SIZE,
} from "./playable-function-button.js";

export interface PlayableReturnButton {
  /** Button center in normalized game-viewport coordinates. */
  x: number;
  y: number;
  /** Button size in the game's reference-resolution pixels. */
  size: number;
  iconAssetId?: string;
}

export const PLAYABLE_RETURN_BUTTON_SIZE = PLAYABLE_FUNCTION_BUTTON_SIZE;
export const MIN_PLAYABLE_RETURN_BUTTON_SIZE =
  MIN_PLAYABLE_FUNCTION_BUTTON_SIZE;
export const MAX_PLAYABLE_RETURN_BUTTON_SIZE =
  MAX_PLAYABLE_FUNCTION_BUTTON_SIZE;

export function defaultPlayableReturnButton(viewport: {
  width: number;
  height: number;
}): Pick<PlayableReturnButton, "x" | "y" | "size"> {
  const offset = PLAYABLE_RETURN_BUTTON_SIZE / 2 + 12;
  return {
    x: Math.max(0, (viewport.width - offset) / viewport.width),
    y: Math.min(1, offset / viewport.height),
    size: PLAYABLE_RETURN_BUTTON_SIZE,
  };
}

export function normalizePlayableReturnButton(
  value: Partial<PlayableReturnButton> | undefined,
  viewport: { width: number; height: number },
): Pick<PlayableReturnButton, "x" | "y" | "size"> {
  const defaults = defaultPlayableReturnButton(viewport);
  const size = normalizePlayableFunctionButtonSize(
    value?.size ?? defaults.size,
  );
  const halfWidth = size / (2 * viewport.width);
  const halfHeight = size / (2 * viewport.height);
  const clamp = (
    coordinate: number | undefined,
    minimum: number,
    fallback: number,
  ) =>
    Math.min(
      1 - minimum,
      Math.max(
        minimum,
        typeof coordinate === "number" && Number.isFinite(coordinate)
          ? coordinate
          : fallback,
      ),
    );

  return {
    x: clamp(value?.x, halfWidth, defaults.x),
    y: clamp(value?.y, halfHeight, defaults.y),
    size,
  };
}

export function normalizePlayableReturnButtonPosition(
  value: Partial<PlayableReturnButton> | undefined,
  viewport: { width: number; height: number },
): Pick<PlayableReturnButton, "x" | "y"> {
  const defaults = defaultPlayableReturnButton(viewport);
  const halfWidth = PLAYABLE_RETURN_BUTTON_SIZE / (2 * viewport.width);
  const halfHeight = PLAYABLE_RETURN_BUTTON_SIZE / (2 * viewport.height);
  const clamp = (
    coordinate: number | undefined,
    minimum: number,
    fallback: number,
  ) =>
    Math.min(
      1 - minimum,
      Math.max(
        minimum,
        typeof coordinate === "number" && Number.isFinite(coordinate)
          ? coordinate
          : fallback,
      ),
    );

  return {
    x: clamp(value?.x, halfWidth, defaults.x),
    y: clamp(value?.y, halfHeight, defaults.y),
  };
}
