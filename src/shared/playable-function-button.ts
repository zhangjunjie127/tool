export const PLAYABLE_FUNCTION_BUTTON_SIZE = 42;
export const MIN_PLAYABLE_FUNCTION_BUTTON_SIZE = 24;
export const MAX_PLAYABLE_FUNCTION_BUTTON_SIZE = 128;

export function normalizePlayableFunctionButtonSize(value: number): number {
  return Number.isFinite(value)
    ? Math.min(
        MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
        Math.max(MIN_PLAYABLE_FUNCTION_BUTTON_SIZE, value),
      )
    : PLAYABLE_FUNCTION_BUTTON_SIZE;
}
