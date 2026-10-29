import { describe, expect, it } from "vitest";
import {
  insertPlayableElementCopies,
  insertPlayableText,
  offsetOf,
  parsePlayableSourceLocation,
  playableSourceLocationByCssPath,
  removePlayableElement,
  removePlayableElementByCssPath,
  removePlayableTextPart,
  replacePlayableElementText,
} from "../src/shared/playable-text-edit.js";
import { setPlayableElementTranslate } from "../src/shared/playable-move.js";

const html = [
  "<main>",
  '  <h1 class="title">Night Train</h1>',
  '  <button data-signal="start" title="a > b">',
  "    Board the train",
  "  </button>",
  "  <p>Tea &amp; biscuits</p>",
  "  <div><span>Nested</span></div>",
  "</main>",
].join("\n");

describe("parsePlayableSourceLocation", () => {
  it("reads file, line, and column", () => {
    expect(parsePlayableSourceLocation("nodes/menu/index.html:12:3")).toEqual({
      file: "nodes/menu/index.html",
      line: 12,
      column: 3,
    });
    expect(
      parsePlayableSourceLocation("nodes/menu/index.html"),
    ).toBeUndefined();
    expect(parsePlayableSourceLocation("a.html:0:1")).toBeUndefined();
  });
});

describe("replacePlayableElementText", () => {
  it("clears a button's direct label while preserving its nested markup", () => {
    expect(
      replacePlayableElementText(
        '<button data-signal="next">Choose <small>1</small></button>',
        { line: 1, column: 1 },
        "Choose",
        "",
      ),
    ).toBe('<button data-signal="next"> <small>1</small></button>');
  });

  it("clears a button label when the preview text differs from its source text", () => {
    expect(
      replacePlayableElementText(
        '<button data-signal="next"><span>Continue</span></button>',
        { line: 1, column: 1 },
        "继续",
        "",
      ),
    ).toBe('<button data-signal="next"><span></span></button>');
  });

  it("adds a label to a button after its text has been cleared", () => {
    const cleared = replacePlayableElementText(
      '<button aria-label="Continue" data-signal="next">Continue</button>',
      { line: 1, column: 1 },
      "Continue",
      "",
    )!;
    expect(
      replacePlayableElementText(
        cleared,
        { line: 1, column: 1 },
        "",
        "Resume",
      ),
    ).toBe('<button aria-label="Continue" data-signal="next">Resume</button>');
  });

  it("edits text nested inside a button without changing sibling labels", () => {
    expect(
      replacePlayableElementText(
        '<button>Continue <small>No save yet</small></button>',
        { line: 1, column: 1 },
        "No save yet",
        "Saved",
      ),
    ).toBe('<button>Continue <small>Saved</small></button>');
  });

  it("replaces the text of a text-only element", () => {
    expect(
      replacePlayableElementText(
        html,
        { line: 2, column: 3 },
        "Night Train",
        "Day Train",
      ),
    ).toContain('<h1 class="title">Day Train</h1>');
  });

  it("keeps surrounding whitespace and reads past quoted >", () => {
    const next = replacePlayableElementText(
      html,
      { line: 3, column: 3 },
      "Board the train",
      "Get on",
    );
    expect(next).toContain(
      '<button data-signal="start" title="a > b">\n    Get on\n  </button>',
    );
  });

  it("matches decoded entities and escapes the new text", () => {
    const next = replacePlayableElementText(
      html,
      { line: 6, column: 3 },
      "Tea & biscuits",
      "Tea < coffee & cake",
    );
    expect(next).toContain("<p>Tea &lt; coffee &amp; cake</p>");
  });

  it("changes only direct text while preserving nested template elements", () => {
    const source =
      '<button>Continue <small>No save yet</small></button>';
    expect(
      replacePlayableElementText(
        source,
        { line: 1, column: 1 },
        "Continue",
        "Resume",
      ),
    ).toBe('<button>Resume <small>No save yet</small></button>');
  });

  it("refuses stale text, nested elements, and a location that is not a tag", () => {
    expect(
      replacePlayableElementText(
        html,
        { line: 2, column: 3 },
        "Old title",
        "New",
      ),
    ).toBeUndefined();
    expect(
      replacePlayableElementText(html, { line: 7, column: 3 }, "Nested", "New"),
    ).toBeUndefined();
    expect(
      replacePlayableElementText(
        html,
        { line: 4, column: 5 },
        "Board the train",
        "New",
      ),
    ).toBeUndefined();
    expect(
      replacePlayableElementText(
        html,
        { line: 40, column: 1 },
        "Night Train",
        "New",
      ),
    ).toBeUndefined();
  });

  it("changes nothing else", () => {
    const next = replacePlayableElementText(
      html,
      { line: 2, column: 3 },
      "Night Train",
      "Day Train",
    )!;
    expect(next.replace("Day Train", "Night Train")).toBe(html);
  });
});

describe("insertPlayableText", () => {
  it("inserts escaped, positioned text and reports its source location", () => {
    const inserted = insertPlayableText("<main>\n  <p>Existing</p>\n</main>", {
      id: "putenggame-text-123-1",
      text: "New < caption",
      x: 12.345,
      y: 67.891,
    })!;
    expect(inserted.html).toContain(
      '<p id="putenggame-text-123-1" style="position:absolute;left:12.35cqw;top:67.89cqh;margin:0">New &lt; caption</p>',
    );
    expect(
      parsePlayableSourceLocation(
        `nodes/test/index.html:${inserted.line}:${inserted.column}`,
      ),
    ).toEqual({
      file: "nodes/test/index.html",
      line: 3,
      column: 1,
    });
  });

  it("rejects invalid positions, duplicate IDs, and missing text", () => {
    const edit = {
      id: "putenggame-text-123-1",
      text: "Caption",
      x: 0,
      y: 0,
    };
    expect(
      insertPlayableText("<main></main>", { ...edit, x: 101 }),
    ).toBeUndefined();
    expect(
      insertPlayableText(
        '<main><p id="putenggame-text-123-1"></p></main>',
        edit,
      ),
    ).toBeUndefined();
    expect(
      insertPlayableText("<main></main>", { ...edit, text: " " }),
    ).toBeUndefined();
  });
});

describe("insertPlayableElementCopies", () => {
  it("duplicates nested markup and returns source locations for every new element", () => {
    const before = [
      "<main>",
      '  <button id="choice-a" data-signal="option-a" style="--putenggame-appear-at: 4s">',
      "    <span>Choose</span>",
      "  </button>",
      "</main>",
    ].join("\n");
    const inserted = insertPlayableElementCopies(
      before,
      "nodes/scene/index.html",
      [
        {
          location: { line: 2, column: 3 },
          tag: "button",
          html: '<button id="putenggame-copy-1" data-signal="option-a" style="--putenggame-appear-at: 4s"><span id="putenggame-copy-2">Choose</span></button>',
          ids: ["putenggame-copy-1", "putenggame-copy-2"],
        },
      ],
    )!;

    expect(inserted.html).toContain(
      '<button id="putenggame-copy-1" data-signal="option-a" style="--putenggame-appear-at: 4s"><span id="putenggame-copy-2">Choose</span></button>',
    );
    for (const id of ["putenggame-copy-1", "putenggame-copy-2"]) {
      const location = parsePlayableSourceLocation(inserted.sources[id]!);
      expect(location?.file).toBe("nodes/scene/index.html");
      expect(
        inserted.html.slice(
          offsetOf(inserted.html, location!.line, location!.column)!,
        ),
      ).toMatch(new RegExp(`^<\\w+[^>]*id="${id}"`));
    }
  });

  it("rejects stale source positions and reused generated IDs", () => {
    const copy = {
      location: { line: 20, column: 1 },
      tag: "button",
      html: '<button id="putenggame-copy-stale"></button>',
      ids: ["putenggame-copy-stale"],
    };
    expect(
      insertPlayableElementCopies(
        "<main><button>Go</button></main>",
        "nodes/a/index.html",
        [copy],
      ),
    ).toBeUndefined();
    expect(
      insertPlayableElementCopies(
        '<main><button id="putenggame-copy-stale"></button></main>',
        "nodes/a/index.html",
        [{ ...copy, location: { line: 1, column: 7 } }],
      ),
    ).toBeUndefined();
  });
});

describe("removePlayableElement", () => {
  it("removes a paired element and its nested same-tag content", () => {
    const next = removePlayableElement(
      "<main>\n  <div><div>Nested</div></div>\n  <p>Keep</p>\n</main>",
      { line: 2, column: 3 },
      "div",
    );
    expect(next).toBe("<main>\n  \n  <p>Keep</p>\n</main>");
  });

  it("removes void elements and rejects stale locations", () => {
    expect(
      removePlayableElement(
        '<main>\n  <img src="a.png" />\n</main>',
        { line: 2, column: 3 },
        "img",
      ),
    ).toBe("<main>\n  \n</main>");
    expect(
      removePlayableElement(
        "<main><p>Keep</p></main>",
        { line: 4, column: 1 },
        "p",
      ),
    ).toBeUndefined();
  });

  it("uses a stable element ID when a preview source location is stale", () => {
    const source =
      '<main><button id="first">Keep</button><button id="selected">Remove</button><button id="last">Keep</button></main>';

    expect(
      removePlayableElementByCssPath(
        source,
        "button#selected",
        "button",
      ),
    ).toBe(
      '<main><button id="first">Keep</button><button id="last">Keep</button></main>',
    );
    expect(
      removePlayableElementByCssPath(source, "button#missing", "button"),
    ).toBeUndefined();
  });

  it("resolves a moved element from its stable ID after earlier source edits", () => {
    const source = [
      "<main>",
      '  <button id="first">Keep</button>',
      '  <button id="inserted">New element</button>',
      '  <button id="selected">Move</button>',
      "</main>",
    ].join("\n");

    const location = playableSourceLocationByCssPath(
      source,
      "button#selected",
      "button",
    );
    expect(location).toEqual({ line: 4, column: 3 });
    expect(
      setPlayableElementTranslate(
        source,
        location!,
        "button",
        { x: 8, y: -3 },
      ),
    ).toBe(
      [
        "<main>",
        '  <button id="first">Keep</button>',
        '  <button id="inserted">New element</button>',
        '  <button style="translate: 8cqw -3cqh" id="selected">Move</button>',
        "</main>",
      ].join("\n"),
    );
  });
});

describe("removePlayableTextPart", () => {
  it("removes nested button text while preserving the button and other labels", () => {
    expect(
      removePlayableTextPart(
        '<button data-signal="continue">Continue <small>No save yet</small></button>',
        { line: 1, column: 1 },
        "button",
        "No save yet",
      ),
    ).toBe(
      '<button data-signal="continue">Continue <small></small></button>',
    );
  });

  it("removes button text when its pick points to an annotated ancestor", () => {
    const source = '<main><section><button data-signal="next"><span>开始</span></button></section></main>';
    expect(
      removePlayableTextPart(
        source,
        { line: 1, column: 1 },
        "button",
        "开始",
      ),
    ).toBe(
      '<main><section><button data-signal="next"><span></span></button></section></main>',
    );
  });

  it("removes translated button text using its original source wording", () => {
    expect(
      removePlayableTextPart(
        '<button data-signal="start">Start</button>',
        { line: 1, column: 1 },
        "button",
        "开始",
        "Start",
      ),
    ).toBe('<button data-signal="start"></button>');
  });

  it("rejects stale text instead of changing the source", () => {
    const source = "<button>Continue</button>";
    expect(
      removePlayableTextPart(
        source,
        { line: 1, column: 1 },
        "button",
        "No save yet",
      ),
    ).toBeUndefined();
  });
});
