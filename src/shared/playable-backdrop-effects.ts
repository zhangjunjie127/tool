export interface PlayableBackdropEffects {
  vignette: boolean;
  grain: boolean;
}

export const DEFAULT_PLAYABLE_BACKDROP_EFFECTS: PlayableBackdropEffects = {
  vignette: true,
  grain: true,
};

export const PLAYABLE_BACKDROP_VIGNETTE_VARIABLE =
  "--putenggame-backdrop-vignette";
export const PLAYABLE_BACKDROP_GRAIN_VARIABLE =
  "--putenggame-backdrop-grain";
const VIGNETTE_SOURCE_VARIABLE = `${PLAYABLE_BACKDROP_VIGNETTE_VARIABLE}-source`;
const GRAIN_SOURCE_VARIABLE = `${PLAYABLE_BACKDROP_GRAIN_VARIABLE}-source`;

/** Rewrites only the two standard effect layers, leaving other backgrounds intact. */
export function preparePlayableBackdropCss(
  css: string,
  effects: PlayableBackdropEffects = DEFAULT_PLAYABLE_BACKDROP_EFFECTS,
): string {
  const rule = css.match(/\.backdrop:{1,2}after\s*\{([^}]*)\}/);
  const body = rule?.[1];
  const declaration = body ? findBackgroundDeclaration(body) : undefined;
  const background = declaration?.value;
  if (!rule || !body || !declaration || !background) return css;

  const layers = splitBackgroundLayers(background);
  const vignette = layers.find((layer) => /^radial-gradient\(/i.test(layer));
  const grain = layers.find((layer) => /feTurbulence|data:image\/svg\+xml/i.test(layer));
  if (!vignette && !grain) return css;
  const declarations = [
    `${VIGNETTE_SOURCE_VARIABLE}: ${vignette ?? "none"}`,
    `${PLAYABLE_BACKDROP_VIGNETTE_VARIABLE}: ${effects.vignette ? `var(${VIGNETTE_SOURCE_VARIABLE})` : "none"}`,
    `${GRAIN_SOURCE_VARIABLE}: ${grain ?? "none"}`,
    `${PLAYABLE_BACKDROP_GRAIN_VARIABLE}: ${effects.grain ? `var(${GRAIN_SOURCE_VARIABLE})` : "none"}`,
  ];
  const replacement = `background: ${layers.map((layer) => {
    if (layer === vignette) return `var(${PLAYABLE_BACKDROP_VIGNETTE_VARIABLE})`;
    if (layer === grain) return `var(${PLAYABLE_BACKDROP_GRAIN_VARIABLE})`;
    return layer;
  }).join(", ")};`;
  const nextBody = `${body.slice(0, declaration.start)}${replacement}${body.slice(declaration.end)}`;
  return `${css.replace(rule[0], `.backdrop::after {${nextBody}}`)}\n:host {\n  ${declarations.join(";\n  ")};\n}\n`;
}

function findBackgroundDeclaration(
  body: string,
): { start: number; end: number; value: string } | undefined {
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index] ?? ";";
    if (quote) {
      if (char === quote && body[index - 1] !== "\\") quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === ";" && depth === 0) {
      const declaration = body.slice(start, index);
      const property = declaration.match(/^\s*background\s*:\s*([\s\S]*)$/i);
      if (property) {
        const leading = declaration.search(/\S/);
        return {
          start: start + leading,
          end: index + (body[index] === ";" ? 1 : 0),
          value: property[1]!.trim(),
        };
      }
      start = index + 1;
    }
  }
  return undefined;
}

function splitBackgroundLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers.filter(Boolean);
}
