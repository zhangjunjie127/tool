export interface PlayableSubtitleCue {
  assetId?: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export type PlayableGameLanguage = "zh-CN" | "en-US";
export type PlayableDisplayMode = "windowed" | "fullscreen";
export type PlayableResolution = "auto" | "1280x720" | "1920x1080" | "2560x1440";

export interface PlayableGameSettings {
  videoVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  uiSoundEnabled: boolean;
  uiSoundVolume: number;
  brightness: number;
  displayMode: PlayableDisplayMode;
  resolution: PlayableResolution;
  subtitlesEnabled: boolean;
  subtitleFontSize: number;
  subtitleCues: PlayableSubtitleCue[];
  messageHints: boolean;
  language: PlayableGameLanguage;
}

export const DEFAULT_PLAYABLE_GAME_SETTINGS: Readonly<PlayableGameSettings> = {
  videoVolume: 0.8,
  musicEnabled: true,
  musicVolume: 0.7,
  uiSoundEnabled: true,
  uiSoundVolume: 0.8,
  brightness: 100,
  displayMode: "fullscreen",
  resolution: "auto",
  subtitlesEnabled: true,
  subtitleFontSize: 100,
  subtitleCues: [],
  messageHints: true,
  language: "zh-CN",
};

export type PlayableGameSettingKey = keyof PlayableGameSettings;
export type PlayableGameSettingValue =
  PlayableGameSettings[PlayableGameSettingKey];

export interface PlayableSettingsService {
  get(): Readonly<PlayableGameSettings>;
  get<K extends PlayableGameSettingKey>(
    key: K,
  ): Readonly<PlayableGameSettings>[K];
  set<K extends PlayableGameSettingKey>(
    key: K,
    value: PlayableGameSettings[K],
  ): void;
  patch(values: Partial<PlayableGameSettings>): void;
  save(): Promise<void>;
  reset(): void;
  discard(): void;
  hasUnsavedChanges(): boolean;
  subscribe(
    listener: (settings: Readonly<PlayableGameSettings>) => void,
  ): () => void;
}

export interface PlayableTranscriptionProvider {
  transcribe(input: {
    assetId: string;
    language: PlayableGameLanguage;
    signal: AbortSignal;
  }): Promise<PlayableSubtitleCue[]>;
}

export interface PlayableTranscriptionService {
  readonly available: boolean;
  transcribe(
    assetId: string,
    language?: PlayableGameLanguage,
  ): Promise<PlayableSubtitleCue[]>;
}

export function createPlayableSettingsService(
  initial?: unknown,
  persist: (settings: Readonly<PlayableGameSettings>) => Promise<void> =
    async () => {},
): PlayableSettingsService {
  let current = normalizePlayableGameSettings(initial);
  let saved = cloneSettings(current);
  const listeners = new Set<
    (settings: Readonly<PlayableGameSettings>) => void
  >();

  const publish = () => {
    const snapshot = cloneSettings(current);
    for (const listener of listeners) listener(snapshot);
  };

  return {
    get: ((key?: PlayableGameSettingKey) =>
      key === undefined
        ? cloneSettings(current)
        : structuredClone(current[key])) as PlayableSettingsService["get"],
    set(key, value) {
      current = normalizePlayableGameSettings({ ...current, [key]: value });
      publish();
    },
    patch(values) {
      current = normalizePlayableGameSettings({ ...current, ...values });
      publish();
    },
    async save() {
      const snapshot = cloneSettings(current);
      await persist(snapshot);
      saved = snapshot;
      publish();
    },
    reset() {
      current = cloneSettings(DEFAULT_PLAYABLE_GAME_SETTINGS);
      publish();
    },
    discard() {
      current = cloneSettings(saved);
      publish();
    },
    hasUnsavedChanges: () => !sameSettings(current, saved),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function normalizePlayableGameSettings(
  value: unknown,
): PlayableGameSettings {
  const input = isRecord(value) ? value : {};
  const defaults = DEFAULT_PLAYABLE_GAME_SETTINGS;
  return {
    videoVolume: boundedNumber(input.videoVolume, defaults.videoVolume, 0, 1),
    musicEnabled: booleanValue(input.musicEnabled, defaults.musicEnabled),
    musicVolume: boundedNumber(input.musicVolume, defaults.musicVolume, 0, 1),
    uiSoundEnabled: booleanValue(input.uiSoundEnabled, defaults.uiSoundEnabled),
    uiSoundVolume: boundedNumber(
      input.uiSoundVolume,
      defaults.uiSoundVolume,
      0,
      1,
    ),
    brightness: boundedNumber(input.brightness, defaults.brightness, 50, 150),
    displayMode:
      input.displayMode === "windowed" || input.displayMode === "fullscreen"
        ? input.displayMode
        : defaults.displayMode,
    resolution:
      input.resolution === "1280x720" ||
      input.resolution === "1920x1080" ||
      input.resolution === "2560x1440" ||
      input.resolution === "auto"
        ? input.resolution
        : defaults.resolution,
    subtitlesEnabled: booleanValue(
      input.subtitlesEnabled,
      defaults.subtitlesEnabled,
    ),
    subtitleFontSize: boundedNumber(
      input.subtitleFontSize,
      defaults.subtitleFontSize,
      75,
      200,
    ),
    subtitleCues: normalizeSubtitleCues(input.subtitleCues),
    messageHints: booleanValue(input.messageHints, defaults.messageHints),
    language:
      input.language === "en-US" || input.language === "zh-CN"
        ? input.language
        : defaults.language,
  };
}

export function isPlayableGameSettings(
  value: unknown,
): value is PlayableGameSettings {
  if (!isRecord(value)) return false;
  return (
    isBoundedNumber(value.videoVolume, 0, 1) &&
    typeof value.musicEnabled === "boolean" &&
    isBoundedNumber(value.musicVolume, 0, 1) &&
    typeof value.uiSoundEnabled === "boolean" &&
    isBoundedNumber(value.uiSoundVolume, 0, 1) &&
    isBoundedNumber(value.brightness, 50, 150) &&
    (value.displayMode === "windowed" || value.displayMode === "fullscreen") &&
    (value.resolution === "auto" ||
      value.resolution === "1280x720" ||
      value.resolution === "1920x1080" ||
      value.resolution === "2560x1440") &&
    typeof value.subtitlesEnabled === "boolean" &&
    isBoundedNumber(value.subtitleFontSize, 75, 200) &&
    isPlayableSubtitleCues(value.subtitleCues) &&
    typeof value.messageHints === "boolean" &&
    (value.language === "zh-CN" || value.language === "en-US")
  );
}

function isBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isPlayableSubtitleCues(
  value: unknown,
): value is PlayableSubtitleCue[] {
  return (
    Array.isArray(value) &&
    value.length <= 2000 &&
    value.every(
      (cue) =>
        isRecord(cue) &&
        (cue.assetId === undefined ||
          (typeof cue.assetId === "string" &&
            cue.assetId.length > 0 &&
            cue.assetId.length <= 128)) &&
        typeof cue.startSeconds === "number" &&
        Number.isFinite(cue.startSeconds) &&
        cue.startSeconds >= 0 &&
        cue.startSeconds <= 86_400 &&
        typeof cue.endSeconds === "number" &&
        Number.isFinite(cue.endSeconds) &&
        cue.endSeconds > cue.startSeconds &&
        cue.endSeconds <= 86_400 &&
        typeof cue.text === "string" &&
        cue.text.length <= 2000,
    )
  );
}

function normalizeSubtitleCues(value: unknown): PlayableSubtitleCue[] {
  if (!isPlayableSubtitleCues(value)) return [];
  return value.map((cue) => ({ ...cue }));
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cloneSettings(
  settings: Readonly<PlayableGameSettings>,
): PlayableGameSettings {
  return structuredClone(settings);
}

function sameSettings(
  left: Readonly<PlayableGameSettings>,
  right: Readonly<PlayableGameSettings>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
