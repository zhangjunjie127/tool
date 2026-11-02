import {
  MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
  MIN_PLAYABLE_FUNCTION_BUTTON_SIZE,
  normalizePlayableFunctionButtonSize,
  PLAYABLE_FUNCTION_BUTTON_SIZE,
} from "./playable-function-button.js";

export interface PlayableSettingsButton {
  /** Button center in normalized game-viewport coordinates. */
  x: number;
  y: number;
  /** Button size in the game's reference-resolution pixels. */
  size?: number;
  iconAssetId?: string;
}

export const PLAYABLE_SETTINGS_BUTTON_SIZE = PLAYABLE_FUNCTION_BUTTON_SIZE;
export const MIN_PLAYABLE_SETTINGS_BUTTON_SIZE =
  MIN_PLAYABLE_FUNCTION_BUTTON_SIZE;
export const MAX_PLAYABLE_SETTINGS_BUTTON_SIZE =
  MAX_PLAYABLE_FUNCTION_BUTTON_SIZE;

export function normalizePlayableSettingsButtonSize(value: number): number {
  return normalizePlayableFunctionButtonSize(value);
}

export function defaultPlayableSettingsButtonPosition(viewport: {
  width: number;
  height: number;
}): { x: number; y: number } {
  const offset = PLAYABLE_SETTINGS_BUTTON_SIZE / 2 + 12;
  return {
    x: Math.min(1, offset / viewport.width),
    y: Math.min(1, offset / viewport.height),
  };
}

export function normalizePlayableSettingsButtonPosition(
  value: { x: number; y: number } | undefined,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const fallback = defaultPlayableSettingsButtonPosition(viewport);
  const halfWidth = PLAYABLE_SETTINGS_BUTTON_SIZE / (2 * viewport.width);
  const halfHeight = PLAYABLE_SETTINGS_BUTTON_SIZE / (2 * viewport.height);
  const clamp = (
    coordinate: number | undefined,
    minimum: number,
    fallbackValue: number,
  ) =>
    Math.min(
      1 - minimum,
      Math.max(
        minimum,
        typeof coordinate === "number" && Number.isFinite(coordinate)
          ? coordinate
          : fallbackValue,
      ),
    );

  return {
    x: clamp(value?.x, halfWidth, fallback.x),
    y: clamp(value?.y, halfHeight, fallback.y),
  };
}
