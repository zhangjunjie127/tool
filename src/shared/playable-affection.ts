export interface PlayableAffectionCharacter {
  id: string;
  name: string;
  initial: number;
}

export interface PlayableAffectionChoice {
  id: string;
  label: string;
  characterId: string;
  delta: number;
  threshold: number;
  successSignal: string;
  fallbackSignal: string;
  condition?: {
    characterId: string;
    operator: ">=" | ">" | "=" | "<" | "<=";
    value: number;
  };
}

export interface PlayableAffectionEffect {
  id: string;
  characterId: string;
  delta: number;
  trigger: "scene-enter" | "scene-end";
  onceKey?: string;
}

export interface PlayableAffectionConfig {
  characters: PlayableAffectionCharacter[];
  choices: PlayableAffectionChoice[];
  effects?: PlayableAffectionEffect[];
}

/** Stable project-state key for a character discovered in screenplay text. */
export function affectionCharacterId(name: string): string {
  const normalizedName = name.trim();
  const slug = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
  const codePointFallback = Array.from(normalizedName)
    .map((character) => character.codePointAt(0)!.toString(36))
    .join("_");
  return `affection_${(slug || codePointFallback || "character").slice(0, 80)}`;
}

export function readPlayableAffectionConfig(html: string): PlayableAffectionConfig | undefined {
  const match = html.match(/<script\b[^>]*data-affection-config[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return undefined;
  try {
    const value: unknown = JSON.parse(match[1]!);
    if (!isRecord(value) || !Array.isArray(value.characters) || !Array.isArray(value.choices)) return undefined;
    const effects = value.effects;
    if (
      !value.characters.every(isAffectionCharacter) ||
      !value.choices.every(isAffectionChoice) ||
      (effects !== undefined && (!Array.isArray(effects) || !effects.every(isAffectionEffect)))
    ) return undefined;
    return value as unknown as PlayableAffectionConfig;
  } catch {
    return undefined;
  }
}

function isAffectionCharacter(value: unknown): value is PlayableAffectionCharacter {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.initial === "number" &&
    Number.isFinite(value.initial);
}

function isAffectionChoice(value: unknown): value is PlayableAffectionChoice {
  if (!isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.characterId !== "string" ||
    typeof value.delta !== "number" ||
    !Number.isFinite(value.delta) ||
    typeof value.threshold !== "number" ||
    !Number.isFinite(value.threshold) ||
    typeof value.successSignal !== "string" ||
    typeof value.fallbackSignal !== "string") return false;
  return value.condition === undefined || isAffectionCondition(value.condition);
}

function isAffectionCondition(value: unknown): value is NonNullable<PlayableAffectionChoice["condition"]> {
  return isRecord(value) &&
    typeof value.characterId === "string" &&
    [">=", ">", "=", "<", "<="].includes(String(value.operator)) &&
    typeof value.value === "number" &&
    Number.isFinite(value.value);
}

function isAffectionEffect(value: unknown): value is PlayableAffectionEffect {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.characterId === "string" &&
    typeof value.delta === "number" &&
    Number.isFinite(value.delta) &&
    (value.trigger === "scene-enter" || value.trigger === "scene-end") &&
    (value.onceKey === undefined || typeof value.onceKey === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function writePlayableAffectionConfig(html: string, config: PlayableAffectionConfig): string | undefined {
  const safeJson = JSON.stringify(config).replace(/</g, "\\u003c");
  const updated = html.replace(
    /(<script\b[^>]*data-affection-config[^>]*>)[\s\S]*?(<\/script>)/i,
    (_match, open: string, close: string) => `${open}${safeJson}${close}`,
  );
  return updated === html ? undefined : updated;
}

export function affectionSignalIds(config: PlayableAffectionConfig): Set<string> {
  return new Set(config.choices.flatMap(({ successSignal, fallbackSignal }) => [successSignal, fallbackSignal]));
}
