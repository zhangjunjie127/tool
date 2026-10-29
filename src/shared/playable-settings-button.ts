export interface PlayableSettingsButton {
  /** Button center in normalized game-viewport coordinates. */
  x: number;
  y: number;
  iconAssetId?: string;
}

export const PLAYABLE_SETTINGS_BUTTON_SIZE = 42;

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
