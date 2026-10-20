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
}

export interface PlayableAffectionConfig {
  characters: PlayableAffectionCharacter[];
  choices: PlayableAffectionChoice[];
}

export function readPlayableAffectionConfig(html: string): PlayableAffectionConfig | undefined {
  const match = html.match(/<script\b[^>]*data-affection-config[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return undefined;
  try {
    const value: unknown = JSON.parse(match[1]!);
    if (
      !value ||
      typeof value !== "object" ||
      !("characters" in value) ||
      !("choices" in value) ||
      !Array.isArray(value.characters) ||
      !Array.isArray(value.choices) ||
      !value.characters.every((character) =>
        character &&
        typeof character === "object" &&
        "id" in character &&
        typeof character.id === "string" &&
        "name" in character &&
        typeof character.name === "string" &&
        "initial" in character &&
        typeof character.initial === "number",
      ) ||
      !value.choices.every((choice) =>
        choice &&
        typeof choice === "object" &&
        "id" in choice &&
        typeof choice.id === "string" &&
        "label" in choice &&
        typeof choice.label === "string" &&
        "characterId" in choice &&
        typeof choice.characterId === "string" &&
        "delta" in choice &&
        typeof choice.delta === "number" &&
        "threshold" in choice &&
        typeof choice.threshold === "number" &&
        "successSignal" in choice &&
        typeof choice.successSignal === "string" &&
        "fallbackSignal" in choice &&
        typeof choice.fallbackSignal === "string",
      )
    ) return undefined;
    return value as PlayableAffectionConfig;
  } catch {
    return undefined;
  }
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
