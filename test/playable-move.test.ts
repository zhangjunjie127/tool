import { describe, expect, it } from "vitest";
import {
  playableCenteredScaleFactor,
  playableTransformOriginCorrection,
  parsePlayableTranslate,
  playableTranslateValue,
  setPlayableElementDelay,
  setPlayableElementTiming,
  setPlayableElementStyle,
  setPlayableElementTransform,
  setPlayableElementTranslate,
} from "../src/shared/playable-move.js";
import { playableMoveRequest } from "../src/shared/playable-chat-context.js";

describe("playableCenteredScaleFactor", () => {
  const center = { x: 200, y: 120 };

  it.each([
    ["top-left", { x: 100, y: 80 }, { x: 130, y: 92 }],
    ["top-right", { x: 300, y: 80 }, { x: 270, y: 92 }],
    ["bottom-left", { x: 100, y: 160 }, { x: 130, y: 148 }],
    ["bottom-right", { x: 300, y: 160 }, { x: 270, y: 148 }],
  ])(
    "shrinks toward the fixed center when dragging %s",
    (_, start, current) => {
      expect(playableCenteredScaleFactor(center, start, current)).toBeCloseTo(
        0.7,
      );
      expect(
        playableCenteredScaleFactor(center, start, {
          x: center.x + (current.x - center.x) * 2,
          y: center.y + (current.y - center.y) * 2,
        }),
      ).toBeCloseTo(1.4);
    },
  );

  it.each([
    ["top-left", { x: 100, y: 80 }, { x: 50, y: 60 }],
    ["top-right", { x: 300, y: 80 }, { x: 350, y: 60 }],
    ["bottom-left", { x: 100, y: 160 }, { x: 50, y: 180 }],
    ["bottom-right", { x: 300, y: 160 }, { x: 350, y: 180 }],
  ])(
    "scales outward from the fixed center when dragging %s",
    (_, start, current) => {
      expect(playableCenteredScaleFactor(center, start, current)).toBeCloseTo(
        1.5,
      );
    },
  );
});

describe("playableTransformOriginCorrection", () => {
  it("compensates for center drift caused by a transform after scale", () => {
    expect(
      playableTransformOriginCorrection(
        { x: 50, y: 50 },
        { width: 100, height: 100 },
        { x: 3, y: 3 },
        0,
        { a: 1, b: 0, c: 0, d: 1 },
        { x: 50, y: 50 },
      ),
    ).toEqual({ x: 25, y: 25 });
  });
});

const html = [
  '<main class="stage">',
  '  <h1 class="title rise" style="--delay: 0.15s">Night Train</h1>',
  '  <p class="tagline">Shanghai, 1937</p>',
  "  <button data-signal=\"start\" title='a > b' style='translate: 1cqw 2cqh; color: red'>Board</button>",
  '  <img src="a.png" alt="" />',
  '  <hr style="translate: 4cqw 0">',
  "</main>",
].join("\n");

describe("setPlayableElementTranslate", () => {
  it("adds translate to an existing style and keeps its other declarations", () => {
    expect(
      setPlayableElementTranslate(html, { line: 2, column: 3 }, "h1", {
        x: 3.5,
        y: -2,
      }),
    ).toContain(
      '<h1 class="title rise" style="--delay: 0.15s; translate: 3.5cqw -2cqh">Night Train</h1>',
    );
  });

  it("adds a style attribute when the element has none", () => {
    expect(
      setPlayableElementTranslate(html, { line: 3, column: 3 }, "p", {
        x: 0,
        y: 10,
      }),
    ).toContain(
      '<p style="translate: 0 10cqh" class="tagline">Shanghai, 1937</p>',
    );
    expect(
      setPlayableElementTranslate(html, { line: 5, column: 3 }, "img", {
        x: 1,
        y: 1,
      }),
    ).toContain('<img style="translate: 1cqw 1cqh" src="a.png" alt="" />');
  });

  it("replaces an earlier translate, reads past quoted >, and keeps the quote style", () => {
    expect(
      setPlayableElementTranslate(html, { line: 4, column: 3 }, "button", {
        x: -1.234,
        y: 0.005,
      }),
    ).toContain(
      "<button data-signal=\"start\" title='a > b' style='color: red; translate: -1.23cqw 0.01cqh'>Board</button>",
    );
  });

  it("fills a style attribute that has no value", () => {
    expect(
      setPlayableElementTranslate(
        '<p style class="x">Hi</p>',
        { line: 1, column: 1 },
        "p",
        { x: 1, y: 0 },
      ),
    ).toBe('<p style="translate: 1cqw 0" class="x">Hi</p>');
  });

  it("removes the declaration, and the attribute when nothing else is left", () => {
    expect(
      setPlayableElementTranslate(html, { line: 4, column: 3 }, "button", {
        x: 0,
        y: 0,
      }),
    ).toContain(
      "<button data-signal=\"start\" title='a > b' style='color: red'>Board</button>",
    );
    expect(
      setPlayableElementTranslate(html, { line: 6, column: 3 }, "hr", {
        x: 0.001,
        y: 0,
      }),
    ).toContain("  <hr>\n");
    expect(
      setPlayableElementTranslate(html, { line: 3, column: 3 }, "p", {
        x: 0,
        y: 0,
      }),
    ).toBe(html);
  });

  it("refuses another tag and a location that is not a tag", () => {
    expect(
      setPlayableElementTranslate(html, { line: 2, column: 3 }, "p", {
        x: 1,
        y: 1,
      }),
    ).toBeUndefined();
    expect(
      setPlayableElementTranslate(html, { line: 2, column: 5 }, "h1", {
        x: 1,
        y: 1,
      }),
    ).toBeUndefined();
    expect(
      setPlayableElementTranslate(html, { line: 40, column: 1 }, "h1", {
        x: 1,
        y: 1,
      }),
    ).toBeUndefined();
  });

  it("changes nothing else", () => {
    const next = setPlayableElementTranslate(
      html,
      { line: 2, column: 3 },
      "h1",
      { x: 1, y: 1 },
    )!;
    expect(next.replace("; translate: 1cqw 1cqh", "")).toBe(html);
  });
});

describe("setPlayableElementStyle", () => {
  it("adds and replaces font declarations without removing other styles", () => {
    expect(
      setPlayableElementStyle(
        html,
        { line: 2, column: 3 },
        "h1",
        "font-family",
        "Microsoft YaHei",
      ),
    ).toContain('style="--delay: 0.15s; font-family: Microsoft YaHei"');
    expect(
      setPlayableElementStyle(
        html,
        { line: 4, column: 3 },
        "button",
        "font-size",
        "24px",
      ),
    ).toContain("style='translate: 1cqw 2cqh; color: red; font-size: 24px'");
  });

  it("refuses a stale location or a different tag", () => {
    expect(
      setPlayableElementStyle(
        html,
        { line: 2, column: 3 },
        "p",
        "font-size",
        "20px",
      ),
    ).toBeUndefined();
    expect(
      setPlayableElementStyle(
        html,
        { line: 40, column: 1 },
        "h1",
        "font-size",
        "20px",
      ),
    ).toBeUndefined();
  });
});

describe("setPlayableElementDelay", () => {
  const location = { line: 1, column: 1 };

  it("adds the entrance class and delay when the element has no class", () => {
    expect(
      setPlayableElementDelay(
        '<button data-signal="next">Next</button>',
        location,
        "button",
        1.25,
      ),
    ).toContain(
      '<button style="--delay: 1.3s" class="rise" data-signal="next">Next</button>',
    );
  });

  it("keeps an existing entrance class and replaces its delay", () => {
    expect(
      setPlayableElementDelay(
        '<button class="choice rise" style="--delay: 0.5s">Next</button>',
        location,
        "button",
        2,
      ),
    ).toBe('<button class="choice rise" style="--delay: 2s">Next</button>');
  });

  it("rejects delays outside the supported range", () => {
    expect(
      setPlayableElementDelay(
        "<button>Next</button>",
        location,
        "button",
        -0.1,
      ),
    ).toBeUndefined();
    expect(
      setPlayableElementDelay(
        "<button>Next</button>",
        location,
        "button",
        3600.1,
      ),
    ).toBeUndefined();
  });
});

describe("setPlayableElementTiming", () => {
  it("persists a visible interval without disturbing other styles", () => {
    expect(
      setPlayableElementTiming(
        '<button class="choice" style="color: red">Next</button>',
        { line: 1, column: 1 },
        "button",
        5,
        9,
      ),
    ).toBe(
      '<button class="choice rise" style="color: red; --delay: 5s; --putenggame-appear-at: 5s; --putenggame-disappear-at: 9s">Next</button>',
    );
  });

  it("clears disappearance time while keeping appearance time", () => {
    expect(
      setPlayableElementTiming(
        '<button class="choice rise" style="--delay: 5s; --putenggame-appear-at: 5s; --putenggame-disappear-at: 9s">Next</button>',
        { line: 1, column: 1 },
        "button",
        5,
      ),
    ).toBe(
      '<button class="choice rise" style="--delay: 5s; --putenggame-appear-at: 5s">Next</button>',
    );
  });

  it("rejects a disappearance time at or before appearance", () => {
    expect(
      setPlayableElementTiming(
        "<button>Next</button>",
        { line: 1, column: 1 },
        "button",
        5,
        5,
      ),
    ).toBeUndefined();
  });
});

describe("setPlayableElementTransform", () => {
  it("writes scale and rotation without removing existing styles", () => {
    const next = setPlayableElementTransform(
      '<img class="hero" style="opacity: 0.8" src="hero.png" />',
      { line: 1, column: 1 },
      "img",
      { scale: 1.235, rotation: 12.34 },
    );
    expect(next).toContain(
      'style="opacity: 0.8; scale: 1.24; transform-origin: 50% 50% !important; rotate: 12.3deg"',
    );
  });

  it("persists the visual selection center as the transform origin", () => {
    const next = setPlayableElementTransform(
      "<button>Choice</button>",
      { line: 1, column: 1 },
      "button",
      { scale: 1.5, rotation: 0, originX: 80, originY: 40 },
    );
    expect(next).toContain("transform-origin: 80% 40% !important");
  });

  it("refuses invalid transform values", () => {
    expect(
      setPlayableElementTransform(
        "<div>Box</div>",
        { line: 1, column: 1 },
        "div",
        { scale: 0, rotation: 0 },
      ),
    ).toBeUndefined();
  });
});

describe("parsePlayableTranslate", () => {
  const size = { width: 1000, height: 500 };

  it("reads cqw and cqh offsets, pixels, and no offset", () => {
    expect(parsePlayableTranslate("", size)).toEqual({ x: 0, y: 0 });
    expect(parsePlayableTranslate("none", size)).toEqual({ x: 0, y: 0 });
    expect(parsePlayableTranslate("3.5cqw -2cqh", size)).toEqual({
      x: 3.5,
      y: -2,
    });
    expect(parsePlayableTranslate("4cqw", size)).toEqual({ x: 4, y: 0 });
    expect(parsePlayableTranslate("0 .5cqh", size)).toEqual({ x: 0, y: 0.5 });
    expect(parsePlayableTranslate("100px 50px", size)).toEqual({
      x: 10,
      y: 10,
    });
    expect(
      parsePlayableTranslate("calc(2cqw + 14.4px) calc(2cqh + 25.6px)", size),
    ).toEqual({ x: 3.44, y: 7.12 });
    const calcWithNegativeOffsets = parsePlayableTranslate(
      "calc(0cqw - 297.025px) calc(0cqh + 521.888px)",
      size,
    );
    expect(calcWithNegativeOffsets?.x).toBeCloseTo(-29.7025);
    expect(calcWithNegativeOffsets?.y).toBeCloseTo(104.3776);
  });

  it("refuses offsets a move cannot keep", () => {
    expect(parsePlayableTranslate("-50% 0", size)).toBeUndefined();
    expect(parsePlayableTranslate("1cqh 1cqw", size)).toBeUndefined();
    expect(parsePlayableTranslate("1cqw 1cqh 2px", size)).toBeUndefined();
    expect(
      parsePlayableTranslate("calc(1cqw + 2px * 2) 0", size),
    ).toBeUndefined();
    expect(parsePlayableTranslate("5 0", size)).toBeUndefined();
  });
});

describe("playableTranslateValue", () => {
  it("rounds to hundredths and drops a zero offset", () => {
    expect(playableTranslateValue({ x: 1.236, y: -0.001 })).toBe("1.24cqw 0");
    expect(playableTranslateValue({ x: 0.004, y: -0.004 })).toBeUndefined();
  });
});

describe("playableMoveRequest", () => {
  it("asks the Agent for the offset, or to remove it", () => {
    expect(playableMoveRequest({ x: 2, y: -3 })).toContain(
      "`translate: 2cqw -3cqh`",
    );
    expect(playableMoveRequest({ x: 0, y: 0 })).toContain("Remove its offset");
  });
});
