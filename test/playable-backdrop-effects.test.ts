import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYABLE_BACKDROP_EFFECTS,
  preparePlayableBackdropCss,
} from "../src/shared/playable-backdrop-effects.js";

const css = `.has-backdrop::after{content:"";height:4cqw;background:#000}
.backdrop::after{content:"";background:radial-gradient(ellipse at center,transparent 45%,#000 100%),url("data:image/svg+xml;utf8,<svg><filter><feTurbulence/></filter></svg>"),linear-gradient(#111,#222)}`;

describe("playable backdrop effects", () => {
  it("keeps both effects enabled by default and preserves letterbox and other layers", () => {
    const prepared = preparePlayableBackdropCss(css);

    expect(DEFAULT_PLAYABLE_BACKDROP_EFFECTS).toEqual({
      vignette: true,
      grain: true,
    });
    expect(prepared).toContain(".has-backdrop::after{content:\"\";height:4cqw;background:#000}");
    expect(prepared).toContain("var(--putenggame-backdrop-vignette)");
    expect(prepared).toContain("var(--putenggame-backdrop-grain)");
    expect(prepared).toContain("linear-gradient(#111,#222)");
    expect(prepared).toContain("--putenggame-backdrop-vignette-source: radial-gradient");
  });

  it("can disable each effect without changing the remaining background", () => {
    const prepared = preparePlayableBackdropCss(css, {
      vignette: false,
      grain: true,
    });

    expect(prepared).toContain("--putenggame-backdrop-vignette: none");
    expect(prepared).toContain("--putenggame-backdrop-grain: var(--putenggame-backdrop-grain-source)");
    expect(prepared).toContain("linear-gradient(#111,#222)");
    expect(prepared).not.toContain("height:4cqw;background:var(--putenggame");
  });

  it("handles minified selectors and declarations", () => {
    const prepared = preparePlayableBackdropCss(
      `.backdrop:after{content:"";background:radial-gradient(circle,transparent,#000),url("data:image/svg+xml;utf8,<svg><feTurbulence/></svg>")}`,
      { vignette: true, grain: false },
    );

    expect(prepared).toContain("--putenggame-backdrop-vignette: var(--putenggame-backdrop-vignette-source)");
    expect(prepared).toContain("--putenggame-backdrop-grain: none");
  });
});
