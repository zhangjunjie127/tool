import { describe, expect, it, vi } from "vitest";
import { setPlayableOriginalText } from "../src/shared/playable-text-source.js";
import { Window } from "happy-dom";
import {
  describePlayableSourceTarget,
  describePlayableAppearanceTarget,
  describePlayablePick,
  playableCssPath,
  playableTextPickWithSource,
  type PickableElement,
  type PlayablePickResult,
} from "../src/shared/playable-picker.js";
import {
  annotatePlayableSourceLocations,
  PLAYABLE_SOURCE_ATTRIBUTE,
} from "../src/shared/playable-source-locations.js";
import {
  isPlayableFrameMessage,
  isPlayableHostMessage,
  type PlayableElementCopy,
} from "../src/shared/playable-player-protocol.js";
import { DocumentPlayableSurfaceHost } from "../src/shared/playable-sandbox.js";
import { translateSandboxTextNodes } from "../src/renderer/playable-sandbox-language.js";

describe("annotatePlayableSourceLocations", () => {
  it("annotates start tags with one-based line and column", () => {
    const html = [
      '<main class="menu">',
      "  <button>Start</button>",
      "</main>",
    ].join("\n");

    expect(annotatePlayableSourceLocations(html, "nodes/menu/index.html")).toBe(
      [
        '<main data-putenggame-source="nodes/menu/index.html:1:1" class="menu">',
        '  <button data-putenggame-source="nodes/menu/index.html:2:3">Start</button>',
        "</main>",
      ].join("\n"),
    );
  });

  it("leaves comments, end tags, and raw text content untouched", () => {
    const html = [
      "<!-- <p>comment</p> -->",
      "<style>a > b { content: '<div>'; }</style>",
      "<script>if (1 < 2) document.querySelector('p');</script>",
      "<textarea><span>literal</span></textarea>",
      '<p data-value="a>b">1 < 2</p>',
    ].join("\n");

    const annotated = annotatePlayableSourceLocations(html, "index.html");

    expect(annotated).toContain("<!-- <p>comment</p> -->");
    expect(annotated).toContain("a > b { content: '<div>'; }");
    expect(annotated).toContain("if (1 < 2) document.querySelector('p');");
    expect(annotated).toContain(
      '<textarea data-putenggame-source="index.html:4:1"><span>literal</span></textarea>',
    );
    expect(annotated).toContain(
      '<p data-putenggame-source="index.html:5:1" data-value="a>b">',
    );
    // style, script, textarea, and p only.
    expect(annotated.match(/data-putenggame-source/g)).toHaveLength(4);
  });

  it("keeps an existing attribute and self-closing tags", () => {
    const html =
      '<img src="a.png" /><b data-putenggame-source="other:1:1">x</b>';

    expect(annotatePlayableSourceLocations(html, "index.html")).toBe(
      '<img data-putenggame-source="index.html:1:1" src="a.png" /><b data-putenggame-source="other:1:1">x</b>',
    );
  });
});

describe("describePlayablePick", () => {
  it("describes the picked element with its Node, source, and CSS path", () => {
    const surface = element("div", { "data-playable-surface": "menu" });
    const list = element(
      "ul",
      { [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/menu/index.html:2:3" },
      surface,
    );
    const first = element("li", {}, list);
    const second = element(
      "li",
      { [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/menu/index.html:4:5" },
      list,
      "  Open the\n archive  ",
    );
    expect(list.children).toEqual([first, second]);

    expect(describePlayablePick([second, list, surface, {}])).toEqual({
      nodeId: "menu",
      source: "nodes/menu/index.html:4:5",
      cssPath: "ul > li:nth-of-type(2)",
      tag: "li",
      text: "Open the archive",
      box: { x: 0, y: 0, width: 0, height: 0 },
    });
  });

  it("falls back to the nearest annotated ancestor and stops the path at an ID", () => {
    const surface = element("div", { "data-playable-surface": "shell" });
    const anchored = element(
      "section",
      { id: "cases", [PLAYABLE_SOURCE_ATTRIBUTE]: "shell/index.html:3:1" },
      surface,
    );
    const created = element("span", {}, anchored);

    expect(describePlayablePick([created, anchored, surface])).toMatchObject({
      nodeId: "shell",
      source: "shell/index.html:3:1",
      cssPath: "section#cases > span",
    });
  });

  it("names the Signal of the nearest data-signal element", () => {
    const surface = element("div", { "data-playable-surface": "menu" });
    const button = element("button", { "data-signal": "start" }, surface);
    const label = element("span", {}, button, "Start");

    expect(describePlayablePick([label, button, surface])).toMatchObject({
      signal: "start",
      tag: "span",
    });
    expect(describePlayablePick([surface.children[0]!, surface])?.signal).toBe(
      "start",
    );
    expect(
      describePlayablePick([element("p", {}, surface), surface])?.signal,
    ).toBeUndefined();
  });

  it("marks images, videos, and data-media slots as media", () => {
    const surface = element("div", { "data-playable-surface": "menu" });
    const backdrop = element("div", { "data-media": "backdrop" }, surface);
    const image = element("img", {}, surface);
    const text = element("p", {}, surface);

    expect(describePlayablePick([backdrop, surface])).toMatchObject({
      media: true,
      mediaSlot: "backdrop",
    });
    expect(describePlayablePick([image, surface])).toMatchObject({
      media: true,
    });
    expect(describePlayablePick([image, surface])?.mediaSlot).toBeUndefined();
    expect(describePlayablePick([text, surface])?.media).toBeUndefined();
  });

  it("ignores a path without a surface and a click on the surface itself", () => {
    const surface = element("div", { "data-playable-surface": "menu" });

    expect(describePlayablePick([surface, {}])).toBeUndefined();
    expect(describePlayablePick([element("p"), {}])).toBeUndefined();
    expect(describePlayablePick([])).toBeUndefined();
  });

  it("returns an unannotated element without a source", () => {
    const surface = element("div", { "data-playable-surface": "menu" });
    const created = element("p", {}, surface);

    const pick = describePlayablePick([created, surface]);

    expect(pick?.source).toBeUndefined();
    expect(playableCssPath(created)).toBe("p");
  });
});

describe("playableTextPickWithSource", () => {
  it("updates a pick made while a new text element was still saving", () => {
    const pick: PlayablePickResult = {
      nodeId: "scene",
      cssPath: "p#putenggame-text-1-1",
      tag: "p",
      text: "请问请问",
      box: { x: 1, y: 2, width: 40, height: 20 },
    };

    expect(
      playableTextPickWithSource(pick, {
        id: "putenggame-text-1-1",
        nodeId: "scene",
        source: "nodes/scene/index.html:8:1",
      }),
    ).toMatchObject({
      nodeId: "scene",
      cssPath: "p#putenggame-text-1-1",
      source: "nodes/scene/index.html:8:1",
    });
  });
});

describe("describePlayableSourceTarget", () => {
  it("uses the source-backed button when its label child is clicked", () => {
    const surface = element("div", { "data-playable-surface": "choice" });
    const button = element(
      "button",
      {
        [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/choice/index.html:5:5",
        "data-signal": "option-a",
      },
      surface,
    );
    const label = element("span", {}, button, "I had no choice.");

    expect(
      describePlayableSourceTarget([label, button, surface])?.pick,
    ).toMatchObject({
      source: "nodes/choice/index.html:5:5",
      tag: "button",
      signal: "option-a",
    });
  });
});

describe("describePlayableAppearanceTarget", () => {
  it("supports source-backed text and images but skips videos", () => {
    const surface = element("div", { "data-playable-surface": "scene" });
    const text = element(
      "p",
      { [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/scene/index.html:2:1" },
      surface,
      "Caption",
    );
    const image = element(
      "img",
      {
        class: "rise",
        [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/scene/index.html:3:1",
      },
      surface,
    );
    const video = element(
      "video",
      { [PLAYABLE_SOURCE_ATTRIBUTE]: "nodes/scene/index.html:4:1" },
      surface,
    );

    expect(
      describePlayableAppearanceTarget([text, surface])?.pick,
    ).toMatchObject({ tag: "p", source: "nodes/scene/index.html:2:1" });
    expect(
      describePlayableAppearanceTarget([image, surface])?.pick,
    ).toMatchObject({ tag: "img", source: "nodes/scene/index.html:3:1" });
    expect(describePlayableAppearanceTarget([video, surface])).toBeUndefined();
  });
});

describe("pick protocol messages", () => {
  it("validates context menu and selection delete messages from the preview", () => {
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:context-menu",
        instanceId: "preview",
        x: 40,
        y: 60,
        viewportWidth: 640,
        viewportHeight: 360,
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:context-menu",
        instanceId: "preview",
        x: -1,
        y: 60,
        viewportWidth: 640,
        viewportHeight: 360,
      }),
    ).toBe(false);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:delete-selection",
        instanceId: "preview",
      }),
    ).toBe(true);
  });

  it("accepts valid undo/redo commands from the preview frame", () => {
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:history-command",
        instanceId: "preview",
        command: "undo",
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:history-command",
        instanceId: "preview",
        command: "clear",
      }),
    ).toBe(false);
  });

  it("accepts pick messages in both directions", () => {
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:text-selected",
        instanceId: "a",
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:pick-start",
        instanceId: "a",
        tool: "text",
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:pick-start",
        instanceId: "a",
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:pick-start",
        instanceId: "a",
        tool: "draw",
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:pick-cancel",
        instanceId: "a",
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:element-clipboard",
        instanceId: "a",
        action: "paste",
        sequence: 1,
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:element-clipboard",
        instanceId: "a",
        action: "paste",
        sequence: 1.5,
      }),
    ).toBe(false);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:picked",
        instanceId: "a",
        pick: { nodeId: "menu" },
        additive: true,
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:picked",
        instanceId: "a",
        pick: { nodeId: "menu" },
      }),
    ).toBe(false);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:text-edited",
        instanceId: "a",
        edit: {
          pick: { nodeId: "menu" },
          before: "Start",
          after: "Begin",
          inPlace: true,
        },
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:text-edited",
        instanceId: "a",
        edit: { pick: { nodeId: "menu" }, before: "Start", after: "Begin" },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:pick-start",
        instanceId: "a",
        tool: "move",
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:delete-element",
        instanceId: "a",
        pick: { nodeId: "menu", cssPath: "button" },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:delete-element",
        instanceId: "a",
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:text-style",
        instanceId: "a",
        command: {
          sequence: 1,
          pick: {
            nodeId: "menu",
            cssPath: "p#caption",
            tag: "p",
            source: "nodes/menu/index.html:1:1",
          },
          property: "fontSize",
          value: "24px",
        },
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:seen",
        instanceId: "a",
        seen: { version: 1, nodes: {}, edges: {} },
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:seen",
        instanceId: "a",
        seen: [],
      }),
    ).toBe(false);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:moved",
        instanceId: "a",
        move: {
          pick: { nodeId: "menu" },
          translate: { x: 2.5, y: -1 },
          inPlace: true,
        },
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:moved",
        instanceId: "a",
        move: {
          pick: { nodeId: "menu" },
          translate: { x: "2.5cqw", y: 0 },
          inPlace: true,
        },
      }),
    ).toBe(false);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:pick-cancelled",
        instanceId: "a",
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:picked",
        instanceId: "a",
      }),
    ).toBe(false);
  });

  it("rejects an init message with a non-object preview", () => {
    const init = {
      kind: "putenggame:playable:init",
      instanceId: "a",
      definition: {},
      assets: {},
    };

    expect(isPlayableHostMessage(init)).toBe(true);
    expect(
      isPlayableHostMessage({ ...init, preview: { policy: "report" } }),
    ).toBe(true);
    expect(isPlayableHostMessage({ ...init, preview: "report" })).toBe(false);
  });
});

describe("DocumentPlayableSurfaceHost click selection", () => {
  it("waits without advancing failure navigation until a configured control is operated", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    let mountedContext:
      | import("../src/shared/playable-nodes.js").PlayableNodeContext
      | undefined;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async (
        context: import("../src/shared/playable-nodes.js").PlayableNodeContext,
      ) => {
        mountedContext = context;
      },
    }));
    const fail = vi.fn(async () => {});
    await host.mountNode(
      {
        id: "wait",
        html: '<main data-putenggame-no-input-mode="wait"><button data-signal="go">Go</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {
        assets: { url: () => "" },
        state: {} as never,
        session: {} as never,
        story: {} as never,
        lifecycle: { signal: new AbortController().signal },
        navigation: {
          emit: async () => {},
          fail,
          back: async () => {},
          connected: () => true,
        },
      },
    );

    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="wait"]',
    )!;
    const stage = surface.shadowRoot!.querySelector("main")!;
    const button = stage.querySelector("button")!;
    expect(stage.hasAttribute("data-putenggame-awaiting-input")).toBe(true);
    await mountedContext!.navigation.fail("timeout");
    expect(fail).not.toHaveBeenCalled();

    stage.dispatchEvent(
      new window.Event("pointerdown", { bubbles: true }) as unknown as Event,
    );
    expect(stage.hasAttribute("data-putenggame-awaiting-input")).toBe(true);
    button.dispatchEvent(
      new window.Event("pointerdown", {
        bubbles: true,
        composed: true,
      }) as unknown as Event,
    );
    expect(stage.hasAttribute("data-putenggame-awaiting-input")).toBe(false);
    await mountedContext!.navigation.fail("timeout");
    expect(fail).toHaveBeenCalledWith("timeout");
    host.destroy();
    window.close();
  });

  it("suppresses only failure navigation while continue-without-input is enabled", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    let mountedContext:
      | import("../src/shared/playable-nodes.js").PlayableNodeContext
      | undefined;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async (
        context: import("../src/shared/playable-nodes.js").PlayableNodeContext,
      ) => {
        mountedContext = context;
      },
    }));
    const emit = vi.fn(async () => {});
    const fail = vi.fn(async () => {});
    await host.mountNode(
      {
        id: "qte",
        html: '<main data-putenggame-continue-without-input="true"></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {
        assets: { url: () => "" },
        state: {} as never,
        session: {} as never,
        story: {} as never,
        lifecycle: { signal: new AbortController().signal },
        navigation: {
          emit,
          fail,
          back: async () => {},
          connected: () => true,
        },
      },
    );

    await mountedContext!.navigation.fail("fail");
    await mountedContext!.navigation.emit("success");
    expect(fail).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("success");

    host.controlMedia({
      command: "continue-without-input",
      nodeId: "qte",
      enabled: false,
    });
    await mountedContext!.navigation.fail("fail");
    expect(fail).toHaveBeenCalledWith("fail");

    host.destroy();
    window.close();
  });

  it("inserts a live button preset and emits its declared Signal", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    const emit = vi.fn(async () => {});
    await host.mountNode(
      {
        id: "start",
        html: '<main class="stage"></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {
        assets: { url: () => "" },
        state: {} as never,
        session: {} as never,
        story: {} as never,
        lifecycle: { signal: new AbortController().signal },
        navigation: { emit, back: async () => {}, connected: () => false },
      } as never,
    );

    host.controlMedia({
      command: "insert-button-preset",
      nodeId: "start",
      id: "putenggame-button-new",
      source: "nodes/start/index.html:1:1",
      signal: "button-1",
      label: "新按钮",
      assetId: "base-image",
      asset: { contentType: "image/png", bytes: new Uint8Array([1]).buffer },
      pressedAssetId: "pressed-image",
      pressedAsset: {
        contentType: "image/png",
        bytes: new Uint8Array([3]).buffer,
      },
      motion: {
        kind: "progress-bar",
        mode: "visual",
        duration: 5,
        barAssetId: "progress-image",
        feedback: "hover-press",
      },
      barAsset: {
        contentType: "image/png",
        bytes: new Uint8Array([2]).buffer,
      },
    });
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="start"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLElement>(
      "button[data-putenggame-button-preset]",
    )!;
    expect(button.textContent).toBe("新按钮");
    expect(button.getAttribute("data-putenggame-motion")).toBe(
      "progress-bar",
    );
    expect(button.getAttribute("data-putenggame-button-asset")).toBe(
      "base-image",
    );
    expect(button.getAttribute("data-putenggame-button-pressed-asset")).toBe(
      "pressed-image",
    );
    expect(button.querySelector("[data-putenggame-button-asset-image] img")).not
      .toBeNull();
    expect(
      button.querySelector("[data-putenggame-button-pressed-image] img"),
    ).not.toBeNull();
    expect(
      button.querySelector("[data-putenggame-motion-bar]"),
    ).not.toBeNull();
    expect(button.style.transition).toContain("transform");
    button.click();

    expect(emit).toHaveBeenCalledWith("button-1");
    host.destroy();
    window.close();
  });

  it("selects the whole button when clicking its explicitly selectable decoration", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "menu",
        html: [
          '<main data-putenggame-source="nodes/menu/index.html:1:1">',
          '<button data-putenggame-source="nodes/menu/index.html:2:1" data-signal="start">Start</button>',
          '<span data-putenggame-source="nodes/menu/index.html:3:1" data-putenggame-selectable class="menu-indicator"></span>',
          "</main>",
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="menu"]',
    )!;
    const indicator =
      surface.shadowRoot!.querySelector<HTMLElement>(".menu-indicator")!;
    const button = surface.shadowRoot!.querySelector<HTMLElement>("button")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 640,
        height: 360,
      }),
    });
    Object.defineProperty(indicator, "getBoundingClientRect", {
      value: () => ({
        x: 20,
        y: 20,
        left: 20,
        top: 20,
        right: 20,
        bottom: 20,
        width: 0,
        height: 0,
      }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 10,
        left: 0,
        top: 10,
        right: 120,
        bottom: 50,
        width: 120,
        height: 40,
      }),
    });
    const onPick = vi.fn();
    const onDelete = vi.fn();
    const onDeleteSelection = vi.fn();
    const onContextMenu = vi.fn();
    host.startPicking("select", {
      onPick,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete,
      onDeleteSelection,
      onContextMenu,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, { button: 0, pointerId: 1, clientX: 22, clientY: 20 });
    button.dispatchEvent(down);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 22, clientY: 20 });
    root.dispatchEvent(up);
    const click = new Event("click", { bubbles: true, composed: true });
    Object.assign(click, {
      clientX: 22,
      clientY: 20,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    button.dispatchEvent(click);

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "button",
        source: "nodes/menu/index.html:2:1",
        cssPath: "main > button",
      }),
      false,
    );
    expect(onDelete).not.toHaveBeenCalled();
    button.dispatchEvent(
      new window.MouseEvent("contextmenu", {
        bubbles: true,
        composed: true,
        button: 2,
        clientX: 22,
        clientY: 20,
      }) as unknown as Event,
    );
    expect(onContextMenu).toHaveBeenCalledWith({
      x: 22,
      y: 20,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "Backspace",
      }) as unknown as Event,
    );
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "Delete",
      }) as unknown as Event,
    );
    expect(onDeleteSelection).toHaveBeenCalledTimes(2);
    expect(onDelete).not.toHaveBeenCalled();

    host.destroy();
    window.close();
  });

  it("selects the whole button from its text and deletes the whole button", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button data-signal="next" data-putenggame-source="nodes/choice/index.html:1:7">Choose <small>Start</small></button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLButtonElement>(
      "button",
    )!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({ x: 100, y: 100, width: 240, height: 64 }),
    });
    const onPick = vi.fn();
    const onDelete = vi.fn();
    host.startPicking("select", {
      onPick,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });
    const label = button.querySelector<HTMLElement>(
      "small [data-putenggame-button-label]",
    )!;
    const labelText = label.firstChild as Text;
    setPlayableOriginalText(labelText, "Start");
    labelText.nodeValue = "开始";
    Object.defineProperty(label, "getBoundingClientRect", {
      value: () => ({ x: 140, y: 120, width: 80, height: 24 }),
    });

    label.dispatchEvent(
      new Event("click", { bubbles: true, composed: true }),
    );
    const outline = root.querySelector<HTMLElement>(
      '[data-playable-pick-outline="true"]',
    )!;
    expect(outline.style.left).toBe("100px");
    expect(outline.style.width).toBe("240px");
    expect(onPick.mock.calls.at(-1)?.[0]).toMatchObject({
      tag: "button",
      signal: "next",
      text: "Choose 开始",
      source: "nodes/choice/index.html:1:7",
    });

    const remove = new Event("keydown", { bubbles: true, composed: true });
    Object.assign(remove, { key: "Delete", ctrlKey: false, metaKey: false });
    label.dispatchEvent(remove);
    expect(onDelete).toHaveBeenCalledWith({
      pick: expect.objectContaining({
        tag: "button",
        signal: "next",
        text: "Choose 开始",
      }),
      inPlace: true,
    });
    expect(button.isConnected).toBe(false);

    host.destroy();
    window.close();
  });

  it("picks a small text item beneath a non-selectable overlapping container", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "ending",
        html: [
          '<main data-putenggame-source="nodes/ending/index.html:1:1">',
          '<p data-putenggame-source="nodes/ending/index.html:2:1">结局</p>',
          '<div data-putenggame-source="nodes/ending/index.html:3:1" class="sealed">',
          '<h1 data-putenggame-source="nodes/ending/index.html:4:1">Ending</h1>',
          "</div></main>",
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="ending"]',
    )!;
    const overlay = surface.shadowRoot!.querySelector<HTMLElement>(".sealed")!;
    const caption = surface.shadowRoot!.querySelector<HTMLElement>("p")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 640,
        height: 360,
      }),
    });
    Object.defineProperty(caption, "getBoundingClientRect", {
      value: () => ({
        x: 20,
        y: 20,
        left: 20,
        top: 20,
        right: 70,
        bottom: 36,
        width: 50,
        height: 16,
      }),
    });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 120,
        bottom: 120,
        width: 120,
        height: 120,
      }),
    });
    Object.defineProperty(
      surface.shadowRoot!.querySelector<HTMLElement>("h1")!,
      "getBoundingClientRect",
      {
        value: () => ({
          x: 80,
          y: 80,
          left: 80,
          top: 80,
          right: 110,
          bottom: 100,
          width: 30,
          height: 20,
        }),
      },
    );

    const onPick = vi.fn();
    host.startPicking("select", {
      onPick,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });
    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, {
      button: 0,
      pointerId: 1,
      clientX: 30,
      clientY: 26,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    overlay.dispatchEvent(down);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 30, clientY: 26 });
    root.dispatchEvent(up);
    const click = new Event("click", { bubbles: true, composed: true });
    Object.assign(click, { clientX: 30, clientY: 26 });
    root.dispatchEvent(click);

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]![0]).toMatchObject({
      tag: "p",
      text: "结局",
      source: "nodes/ending/index.html:2:1",
    });
    expect(
      root.querySelector<HTMLElement>('[data-playable-pick-outline="true"]')
        ?.style.top,
    ).toBe("20px");

    host.stopPicking();
    const onMove = vi.fn();
    host.startPicking("move", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });
    const moveDown = new Event("pointerdown", {
      bubbles: true,
      composed: true,
    });
    Object.assign(moveDown, {
      button: 0,
      pointerId: 2,
      clientX: 30,
      clientY: 26,
    });
    overlay.dispatchEvent(moveDown);
    const move = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(move, { pointerId: 2, clientX: 45, clientY: 36 });
    root.dispatchEvent(move);
    const moveUp = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(moveUp, {
      button: 0,
      pointerId: 2,
      clientX: 45,
      clientY: 36,
    });
    root.dispatchEvent(moveUp);

    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0]![0].pick).toMatchObject({
      tag: "p",
      text: "结局",
      source: "nodes/ending/index.html:2:1",
    });
    host.destroy();
    window.close();
  });

  it("adds new text on a double-clicked blank area and keeps it source-editable", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main data-putenggame-source="nodes/choice/index.html:1:1"><div data-media="backdrop"></div></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const main = surface.shadowRoot!.querySelector<HTMLElement>("main")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        width: 640,
        height: 360,
        left: 0,
        top: 0,
      }),
    });
    const onTextCreate = vi.fn();
    host.startPicking("text", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const doubleClick = new Event("dblclick", {
      bubbles: true,
      composed: true,
    });
    Object.assign(doubleClick, { clientX: 128, clientY: 90 });
    main.dispatchEvent(doubleClick);
    const input = main.querySelector<HTMLElement>(
      '[contenteditable="plaintext-only"]',
    )!;
    expect(input).toBeDefined();
    expect(input.style.position).toBe("absolute");

    input.textContent = "New caption";
    const enter = new Event("keydown", { bubbles: true, composed: true });
    Object.assign(enter, { key: "Enter", shiftKey: false });
    input.dispatchEvent(enter);
    expect(onTextCreate).toHaveBeenCalledWith({
      id: input.id,
      nodeId: "choice",
      text: "New caption",
      x: 20,
      y: 25,
    });
    host.setTextSource(input.id, "nodes/choice/index.html:1:82");
    expect(input.getAttribute("data-putenggame-source")).toBe(
      "nodes/choice/index.html:1:82",
    );
    host.destroy();
    window.close();
  });

  it("keeps confirmed text and its selection until another preview target is clicked", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main data-putenggame-source="nodes/choice/index.html:1:1"><p id="dynamic">Original</p><button id="styled" data-putenggame-source="nodes/choice/index.html:1:38">Styled <small>Hint</small></button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const main = surface.shadowRoot!.querySelector<HTMLElement>("main")!;
    const text = main.querySelector<HTMLElement>("#styled")!;
    translateSandboxTextNodes(
      text,
      (value) =>
        value.trim() === "Styled"
          ? `已翻译文字${value.endsWith(" ") ? " " : ""}`
          : value,
      new WeakMap(),
    );
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        width: 640,
        height: 360,
        left: 0,
        top: 0,
      }),
    });
    const onTextSelect = vi.fn();
    const onTextEdit = vi.fn();
    host.startPicking("text", {
      onPick: () => undefined,
      onTextSelect,
      onInteractionSelect: () => undefined,
      onTextEdit,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    text.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
    const editor = text.querySelector<HTMLElement>('[contenteditable="plaintext-only"]')!;
    editor.textContent = "Edited";
    editor.dispatchEvent(new Event("blur"));

    expect(onTextEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        before: "已翻译文字",
        after: "Edited",
        sourceBefore: "Styled",
        inPlace: true,
      }),
    );
    expect(text.textContent).toBe("Edited Hint");
    expect(text.querySelector("small")?.textContent).toBe("Hint");
    expect(
      document.querySelector<HTMLElement>('[data-playable-pick-outline="true"]')
        ?.style.display,
    ).toBe("block");

    surface.dispatchEvent(
      new Event("click", { bubbles: true, composed: true }),
    );
    expect(onTextSelect).toHaveBeenLastCalledWith(undefined);
    expect(
      document.querySelector<HTMLElement>('[data-playable-pick-outline="true"]')
        ?.style.display,
    ).toBe("none");
    const styled = main.querySelector<HTMLElement>("#styled")!;
    const stylePick = {
      nodeId: "choice",
      source: "nodes/choice/index.html:1:38",
      cssPath: "button#styled",
      tag: "button",
      text: "Styled Hint",
      box: { x: 0, y: 0, width: 100, height: 20 },
    };
    styled.dispatchEvent(
      new Event("click", { bubbles: true, composed: true }),
    );
    host.updateTextStyle({
      sequence: 1,
      pick: stylePick,
      property: "fontFamily",
      value: "Arial",
    });
    host.updateTextStyle({
      sequence: 2,
      pick: stylePick,
      property: "fontSize",
      value: "24px",
    });
    expect(styled.style.fontFamily).toBe("Arial");
    expect(styled.style.fontSize).toBe("24px");
    expect(onTextSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pick: expect.objectContaining({
          nodeId: "choice",
          cssPath: "button#styled > span",
          source: "nodes/choice/index.html:1:38",
          tag: "span",
        }),
      }),
    );
    expect(
      document.querySelector<HTMLElement>('[data-playable-pick-outline="true"]')
        ?.style.display,
    ).toBe("block");
    host.destroy();
    window.close();
  });

  it("prefers source text over a generated button-label wrapper in text mode", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button data-putenggame-source="nodes/choice/index.html:1:1"><h1 data-putenggame-source="nodes/choice/index.html:1:8">Large <span data-putenggame-button-label>label</span></h1></button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const heading = surface.shadowRoot!.querySelector<HTMLElement>("h1")!;
    const label = heading.querySelector<HTMLElement>(
      "[data-putenggame-button-label]",
    )!;
    const onTextSelect = vi.fn();
    host.startPicking("text", {
      onPick: () => undefined,
      onTextSelect,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    label.dispatchEvent(new Event("click", { bubbles: true, composed: true }));

    expect(onTextSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        pick: expect.objectContaining({
          source: "nodes/choice/index.html:1:8",
          tag: "h1",
        }),
      }),
    );
    host.destroy();
    window.close();
  });

  it("updates an element's appearance timing without rebuilding its video", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: [
          '<main><div data-media="backdrop"><video src="backdrop.mp4"></video></div>',
          '<button data-putenggame-source="nodes/choice/index.html:2:1">Choice</button>',
          '<button data-putenggame-source="nodes/choice/index.html:3:1">Next</button></main>',
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const video = surface.shadowRoot!.querySelector<HTMLVideoElement>("video")!;
    const button =
      surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    const secondButton =
      surface.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")[1]!;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 42,
    });
    const animations = [
      { animationName: "rise", currentTime: 0 },
      { animationName: "rise-up", currentTime: 0 },
    ];
    Object.defineProperty(button, "getAnimations", {
      configurable: true,
      value: () => animations,
    });

    host.updateAppearanceTiming([
      {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:2:1",
          cssPath: "main > button:nth-of-type(1)",
          tag: "button",
          text: "Choice",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        delaySeconds: 80,
        endSeconds: 90,
      },
      {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:3:1",
          cssPath: "main > button:nth-of-type(2)",
          tag: "button",
          text: "Next",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        delaySeconds: 80,
        endSeconds: 90,
      },
    ]);

    expect(surface.shadowRoot!.querySelector<HTMLButtonElement>("button")).toBe(
      button,
    );
    expect(
      surface.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")[1],
    ).toBe(secondButton);
    expect(button.style.getPropertyValue("--delay")).toBe("0s");
    expect(secondButton.style.getPropertyValue("--delay")).toBe("0s");
    expect(button.style.getPropertyValue("--putenggame-appear-at")).toBe("80s");
    expect(secondButton.style.getPropertyValue("--putenggame-appear-at")).toBe(
      "80s",
    );
    expect(button.style.getPropertyValue("--putenggame-disappear-at")).toBe(
      "90s",
    );
    expect(
      secondButton.style.getPropertyValue("--putenggame-disappear-at"),
    ).toBe("90s");
    expect(button.classList.contains("rise")).toBe(true);
    expect(secondButton.classList.contains("rise")).toBe(true);
    expect(animations.map(({ currentTime }) => currentTime)).toEqual([0, 0]);
    expect(video.currentTime).toBe(42);
  });

  it("keeps preview timeline controls fixed to the background video", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "scene",
        html: '<main><div data-media="backdrop"><video id="backdrop"></video></div><video id="foreground"></video></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="scene"]',
    )!;
    const backdrop =
      surface.shadowRoot!.querySelector<HTMLVideoElement>("#backdrop")!;
    const foreground =
      surface.shadowRoot!.querySelector<HTMLVideoElement>("#foreground")!;
    Object.defineProperty(backdrop, "currentTime", {
      configurable: true,
      writable: true,
      value: 2,
    });
    Object.defineProperty(foreground, "currentTime", {
      configurable: true,
      writable: true,
      value: 7,
    });
    const states: { currentTime: number; duration: number; paused: boolean }[] =
      [];
    host.setMediaStateListener((state) => states.push(state));

    host.controlMedia({ command: "seek", time: 5 });
    foreground.dispatchEvent(new window.Event("timeupdate") as unknown as Event);

    expect(backdrop.currentTime).toBe(5);
    expect(foreground.currentTime).toBe(7);
    expect(states.at(-1)?.currentTime).toBe(5);
    host.destroy();
    window.close();
  });

  it("keeps overlays visible after video end unless they have a disappearance time", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: [
          '<main><div data-media="backdrop"><video src="backdrop.mp4"></video></div>',
          '<button data-putenggame-source="nodes/choice/index.html:2:1">Choice</button>',
          '<img data-putenggame-source="nodes/choice/index.html:3:1" src="overlay.png">',
          '<p data-putenggame-source="nodes/choice/index.html:4:1">Untimed</p></main>',
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const video = surface.shadowRoot!.querySelector<HTMLVideoElement>("video")!;
    const button =
      surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    const image = surface.shadowRoot!.querySelector<HTMLImageElement>("img")!;
    const untimed =
      surface.shadowRoot!.querySelector<HTMLParagraphElement>("p")!;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 12,
    });

    host.updateAppearanceTiming([
      {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:2:1",
          cssPath: "main > button",
          tag: "button",
          text: "Choice",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        delaySeconds: 5,
        endSeconds: 9,
      },
      {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:3:1",
          cssPath: "main > img",
          tag: "img",
          text: "",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        delaySeconds: 5,
      },
    ]);

    const timeUpdate = (time: number) => {
      video.currentTime = time;
      video.dispatchEvent(new window.Event("timeupdate") as unknown as Event);
    };
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(true);
    expect(image.hasAttribute("data-playable-timing-hidden")).toBe(true);
    timeUpdate(5);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    expect(image.hasAttribute("data-playable-timing-hidden")).toBe(false);
    timeUpdate(9);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(true);
    expect(image.hasAttribute("data-playable-timing-hidden")).toBe(false);
    timeUpdate(6);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    timeUpdate(9);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(true);
    host.updateAppearanceTiming([
      {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:2:1",
          cssPath: "main > button",
          tag: "button",
          text: "Choice",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        delaySeconds: 5,
      },
    ]);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    timeUpdate(10);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    timeUpdate(12);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    expect(image.hasAttribute("data-playable-timing-hidden")).toBe(false);
    expect(untimed.hasAttribute("data-playable-timing-hidden")).toBe(false);
    Object.defineProperty(video, "ended", { configurable: true, value: true });
    video.dispatchEvent(new window.Event("ended") as unknown as Event);
    expect(button.hasAttribute("data-playable-timing-hidden")).toBe(false);
    expect(image.hasAttribute("data-playable-timing-hidden")).toBe(false);
    expect(untimed.hasAttribute("data-playable-timing-hidden")).toBe(false);
  });

  it("keeps a click selectable when pointer capture retargets the click to the root", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<button data-putenggame-source="nodes/choice/index.html:1:1">Choice</button>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button =
      surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 720, height: 1280 }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({ x: 10, y: 20, width: 200, height: 40 }),
    });
    const picks: string[] = [];
    host.startPicking("select", {
      onPick: (pick) => picks.push(pick.cssPath),
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    button.dispatchEvent(down);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 20, clientY: 30 });
    root.dispatchEvent(up);
    root.dispatchEvent(new Event("click", { bubbles: true, composed: true }));

    expect(picks).toEqual(["button"]);
    expect(
      document.querySelector<HTMLElement>('[data-playable-pick-outline="true"]')
        ?.style.display,
    ).toBe("block");
  });

  it("moves only the individual source-backed item inside a group container", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: [
          '<main data-putenggame-source="nodes/choice/index.html:1:1">',
          '<div id="group" data-putenggame-source="nodes/choice/index.html:2:1">',
          '<h1 id="title" data-putenggame-source="nodes/choice/index.html:3:1">Title</h1>',
          '<img id="picture" data-putenggame-source="nodes/choice/index.html:4:1">',
          '<button id="action" data-signal="next" data-putenggame-source="nodes/choice/index.html:5:1">Next</button>',
          "</div></main>",
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const group = surface.shadowRoot!.getElementById("group")!;
    const title = surface.shadowRoot!.getElementById("title")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360, left: 0, top: 0 }),
    });
    const onMove = vi.fn();
    host.startPicking("move", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const drag = (target: HTMLElement, pointerId: number) => {
      const down = new Event("pointerdown", { bubbles: true, composed: true });
      Object.assign(down, {
        button: 0,
        pointerId,
        clientX: 10,
        clientY: 10,
      });
      target.dispatchEvent(down);
      const move = new Event("pointermove", { bubbles: true, composed: true });
      Object.assign(move, { pointerId, clientX: 30, clientY: 30 });
      root.dispatchEvent(move);
      const up = new Event("pointerup", { bubbles: true, composed: true });
      Object.assign(up, { button: 0, pointerId, clientX: 30, clientY: 30 });
      root.dispatchEvent(up);
    };

    drag(group, 1);
    expect(onMove).not.toHaveBeenCalled();
    drag(title, 2);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0]![0].pick.cssPath).toBe("h1#title");

    host.destroy();
    window.close();
  });

  it("copies and pastes selected scene elements in place with fresh source IDs", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button id="choice-a" data-signal="option-a" data-putenggame-source="nodes/choice/index.html:1:7"><span data-putenggame-source="nodes/choice/index.html:1:74">Choose</span></button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button =
      surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 640, height: 360, left: 0, top: 0 }),
    });
    const onPasteElements = vi.fn(async (copies: PlayableElementCopy[]) =>
      Object.fromEntries(
        copies.flatMap((copy) =>
          copy.ids.map((id, index) => [
            id,
            `nodes/choice/index.html:${index + 2}:1`,
          ]),
        ),
      ),
    );
    const onPick = vi.fn();
    host.startPicking("select", {
      onPick,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements,
      onCancel: () => undefined,
    });

    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    button.dispatchEvent(down);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 20, clientY: 30 });
    root.dispatchEvent(up);
    root.dispatchEvent(new Event("click", { bubbles: true, composed: true }));

    const copy = new Event("keydown", { bubbles: true, composed: true });
    Object.assign(copy, { key: "c", ctrlKey: true, metaKey: false });
    button.dispatchEvent(copy);
    await host.pastePickedElements();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const buttons = surface.shadowRoot!.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(onPasteElements).toHaveBeenCalledOnce();
    expect(onPasteElements.mock.calls[0]![0][0]!.previewHtml).toContain(
      'id="putenggame-copy-',
    );
    expect(buttons[1]!.id).toMatch(/^putenggame-copy-/);
    expect(buttons[1]!.getAttribute("data-signal")).toBe("option-a");
    expect(buttons[1]!.getAttribute("data-putenggame-source")).toBe(
      "nodes/choice/index.html:2:1",
    );
    expect(buttons[1]!.style.translate).not.toContain("calc(");
    expect(
      buttons[1]!.querySelector("span")!.getAttribute("data-putenggame-source"),
    ).toBe("nodes/choice/index.html:3:1");

    buttons[1]!.style.translate =
      "calc(2cqw + 0px) calc(2cqh + 0px)";
    const onMove = vi.fn();
    host.startPicking("move", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements,
      onCancel: () => undefined,
    });
    const moveDown = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(moveDown, {
      button: 0,
      pointerId: 2,
      clientX: 20,
      clientY: 30,
    });
    buttons[1]!.dispatchEvent(moveDown);
    const move = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(move, { pointerId: 2, clientX: 40, clientY: 50 });
    root.dispatchEvent(move);
    const moveUp = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(moveUp, { button: 0, pointerId: 2, clientX: 40, clientY: 50 });
    root.dispatchEvent(moveUp);

    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0]![0]).toMatchObject({
      inPlace: true,
      translate: { x: 5.13, y: 7.56 },
    });
    expect(buttons[1]!.style.translate).not.toContain("calc(");

    host.destroy();
    window.close();
  });

  it("shows boxes for frame-selected buttons, text, images, foreground video, and QTE", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: [
          '<main data-putenggame-source="nodes/choice/index.html:1:1">',
          '<div data-media="backdrop" data-putenggame-source="nodes/choice/index.html:2:1"></div>',
          '<button data-signal="option-a" data-putenggame-source="nodes/choice/index.html:3:1"><kbd data-putenggame-source="nodes/choice/index.html:3:8">1</kbd>Choice</button>',
          '<p data-putenggame-source="nodes/choice/index.html:4:1">Caption</p>',
          '<img data-putenggame-source="nodes/choice/index.html:5:1">',
          '<video data-putenggame-source="nodes/choice/index.html:6:1"></video>',
          '<div data-qte="tap" data-putenggame-source="nodes/choice/index.html:7:1"><span data-putenggame-source="nodes/choice/index.html:7:10">Tap</span></div>',
          "</main>",
        ].join(""),
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const elements = {
      backdrop: surface.shadowRoot!.querySelector<HTMLElement>(
        '[data-media="backdrop"]',
      )!,
      button: surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!,
      label: surface.shadowRoot!.querySelector<HTMLElement>("kbd")!,
      text: surface.shadowRoot!.querySelector<HTMLElement>("p")!,
      image: surface.shadowRoot!.querySelector<HTMLImageElement>("img")!,
      video: surface.shadowRoot!.querySelector<HTMLVideoElement>("video")!,
      qte: surface.shadowRoot!.querySelector<HTMLElement>("[data-qte]")!,
    };
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 720, height: 1280 }),
    });
    for (const [name, element] of Object.entries(elements)) {
      const boxes: Record<
        string,
        { x: number; y: number; width: number; height: number }
      > = {
        backdrop: { x: 0, y: 0, width: 720, height: 1280 },
        button: { x: 100, y: 100, width: 220, height: 50 },
        label: { x: 110, y: 115, width: 24, height: 20 },
        text: { x: 100, y: 200, width: 200, height: 30 },
        image: { x: 100, y: 300, width: 180, height: 100 },
        video: { x: 100, y: 420, width: 240, height: 120 },
        qte: { x: 100, y: 580, width: 160, height: 48 },
      };
      Object.defineProperty(element, "getBoundingClientRect", {
        value: () => boxes[name],
      });
    }
    const picks: string[] = [];
    host.startPicking("select", {
      onPick: (pick) => picks.push(pick.cssPath),
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, {
      button: 0,
      pointerId: 1,
      clientX: 90,
      clientY: 90,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    root.dispatchEvent(down);
    const move = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(move, { pointerId: 1, clientX: 380, clientY: 650 });
    root.dispatchEvent(move);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 380, clientY: 650 });
    root.dispatchEvent(up);

    expect(picks).toEqual([
      "main > button",
      "main > p",
      "main > img",
      "main > video",
      "main > div:nth-of-type(2)",
    ]);
    expect(
      document.querySelectorAll("[data-playable-pick-outline]").length,
    ).toBe(5);
  });

  it("refreshes a selected button outline when its replacement image is resized", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button data-putenggame-source="nodes/choice/index.html:1:7" data-putenggame-button-asset="button-image">Choice</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      { assets: { url: () => "/button-image.png" } } as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    let box = { x: 100, y: 120, width: 100, height: 40 };
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 720, height: 1280 }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => box,
    });
    host.startPicking("select", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = new Event("pointerdown", { bubbles: true, composed: true });
    Object.assign(down, {
      button: 0,
      pointerId: 1,
      clientX: 110,
      clientY: 130,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
    button.dispatchEvent(down);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 110, clientY: 130 });
    button.dispatchEvent(up);
    const click = new Event("click", { bubbles: true, composed: true });
    Object.assign(click, { clientX: 110, clientY: 130 });
    button.dispatchEvent(click);

    const outline = root.querySelector<HTMLElement>(
      '[data-playable-pick-outline="true"]',
    )!;
    expect(outline.style.width).toBe("100px");
    box = { x: 50, y: 100, width: 200, height: 40 };
    host.controlMedia({
      command: "button-asset-scale",
      nodeId: "choice",
      cssPath: "main > button",
      source: "nodes/choice/index.html:1:7",
      scaleX: 200,
      scaleY: 100,
    });

    expect(button.style.scale).toBe("2 1");
    expect(outline.style.left).toBe("50px");
    expect(outline.style.width).toBe("200px");

    host.destroy();
    window.close();
  });

  it("frames the visible contained button asset instead of its stretched button box", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button style="width: 1000px; height: 100px" data-putenggame-source="nodes/choice/index.html:1:7" data-putenggame-button-asset="button-image">Choice</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      { assets: { url: () => "/button-image.png" } } as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    const image = button.querySelector<HTMLImageElement>(
      "[data-putenggame-button-asset-image] img",
    )!;
    Object.defineProperty(image, "naturalWidth", { value: 400 });
    Object.defineProperty(image, "naturalHeight", { value: 80 });
    Object.defineProperty(image, "getBoundingClientRect", {
      value: () => ({
        x: 100,
        y: 100,
        left: 100,
        top: 100,
        right: 1100,
        bottom: 200,
        width: 1000,
        height: 100,
      }),
    });
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 1280, height: 720 }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({
        x: 100,
        y: 100,
        left: 100,
        top: 100,
        right: 1100,
        bottom: 200,
        width: 1000,
        height: 100,
      }),
    });
    const onPick = vi.fn();
    host.startPicking("select", {
      onPick,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    button.dispatchEvent(
      new Event("click", { bubbles: true, composed: true }),
    );

    const outline = root.querySelector<HTMLElement>(
      '[data-playable-pick-outline="true"]',
    )!;
    expect(onPick.mock.calls.at(-1)?.[0]).toMatchObject({
      cssPath: "main > button",
      tag: "button",
      box: { x: 350, y: 100, width: 500, height: 100 },
    });
    expect(outline.style.left).toBe("350px");
    expect(outline.style.width).toBe("500px");
    expect(outline.style.height).toBe("100px");

    host.destroy();
    window.close();
  });

  it("resizes smoothly from a large corner handle around the center", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<style>button { transform-origin: bottom right !important }</style><main><button style="scale: 1.5" data-putenggame-button-asset-scale-x="150" data-putenggame-button-asset="button-image" data-putenggame-source="nodes/choice/index.html:1:7">Choice</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      { assets: { url: () => "/button-image.png" } } as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLButtonElement>(
      "button",
    )!;
    const image = button.querySelector<HTMLImageElement>(
      "[data-putenggame-button-asset-image] img",
    )!;
    Object.defineProperty(image, "naturalWidth", { value: 100 });
    Object.defineProperty(image, "naturalHeight", { value: 100 });
    Object.defineProperty(image, "getBoundingClientRect", {
      value: () => ({
        x: 130,
        y: 90,
        left: 130,
        top: 90,
        right: 230,
        bottom: 190,
        width: 100,
        height: 100,
      }),
    });
    const center = { x: 180, y: 140 };
    const elementCenter = { x: 150, y: 150 };
    const box = () => {
      const [scaleX = "1.5", scaleY = scaleX] = button.style.scale.split(/\s+/);
      const width = 100 * (Number(scaleX) / 1.5);
      const height = 100 * (Number(scaleY) / 1.5);
      return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      };
    };
    const elementBox = () =>
      button.style.transformOrigin === "80% 40%"
        ? box()
        : {
            x: elementCenter.x - 50,
            y: elementCenter.y - 50,
            width: 100,
            height: 100,
          };
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 720, height: 1280 }),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: elementBox,
    });
    const onTransform = vi.fn();
    host.startPicking("select", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = (target: HTMLElement, pointerId: number, x: number, y: number) => {
      const event = new Event("pointerdown", { bubbles: true, composed: true });
      Object.assign(event, { button: 0, pointerId, clientX: x, clientY: y });
      target.dispatchEvent(event);
    };
    down(button, 1, 120, 120);
    const up = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(up, { button: 0, pointerId: 1, clientX: 120, clientY: 120 });
    root.dispatchEvent(up);
    const click = new Event("click", { bubbles: true, composed: true });
    Object.assign(click, { clientX: 120, clientY: 120 });
    button.dispatchEvent(click);

    const handle = root.querySelector<HTMLElement>(
      '[data-playable-transform-handle="se"]',
    )!;
    expect(handle.style.width).toBe("28px");
    expect((handle.firstElementChild as HTMLElement).style.width).toBe("12px");
    down(handle, 2, 222, 182);
    expect(button.style.getPropertyPriority("transform-origin")).toBe(
      "important",
    );
    const initialBox = box();
    const move = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(move, { pointerId: 2, clientX: 222, clientY: 182 });
    root.dispatchEvent(move);
    expect(button.style.scale).toBe("2.25 1.5");

    const grow = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(grow, { pointerId: 2, clientX: 264, clientY: 224 });
    root.dispatchEvent(grow);
    const resizedBox = box();
    expect(resizedBox.x + resizedBox.width / 2).toBe(center.x);
    expect(resizedBox.y + resizedBox.height / 2).toBe(center.y);
    expect(initialBox.x - resizedBox.x).toBe(
      resizedBox.x + resizedBox.width - (initialBox.x + initialBox.width),
    );
    expect(initialBox.y - resizedBox.y).toBe(
      resizedBox.y + resizedBox.height - (initialBox.y + initialBox.height),
    );

    const resizeUp = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(resizeUp, {
      button: 0,
      pointerId: 2,
      clientX: 264,
      clientY: 224,
    });
    root.dispatchEvent(resizeUp);

    expect(onTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        transform: { scale: 3, rotation: 0, originX: 100, originY: 100 },
        inPlace: true,
      }),
    );
    expect(button.style.scale).toBe("4.5 3");
    expect(button.style.getPropertyValue("transform-origin")).toBe(
      "100% 100%",
    );
    expect(button.style.getPropertyPriority("transform-origin")).toBe(
      "important",
    );
    expect(
      root.querySelector<HTMLElement>("[data-playable-pick-marquee]")?.style
        .display,
    ).toBe("none");

    host.destroy();
    window.close();
  });

  it("keeps the visible center fixed when the element uses translate(-50%)", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main><button style="left: 50%; top: 50%; transform: translate(-50%, -50%); scale: 1.5; transform-origin: 100% 100% !important" data-putenggame-source="nodes/choice/index.html:1:7">Choice</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const root = document.querySelector<HTMLElement>(
      '[data-playable-sandbox="true"]',
    )!;
    const surface = document.querySelector<HTMLElement>(
      '[data-playable-surface="choice"]',
    )!;
    const button = surface.shadowRoot!.querySelector<HTMLButtonElement>(
      "button",
    )!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 720, height: 1280 }),
    });
    Object.defineProperty(button, "offsetWidth", { value: 100 });
    Object.defineProperty(button, "offsetHeight", { value: 100 });
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => {
        const scale = Number.parseFloat(button.style.scale) || 1.5;
        const [originX = "50%", originY = "50%"] =
          button.style.transformOrigin.split(/\s+/);
        const originXPx = (Number.parseFloat(originX) / 100) * 100;
        const originYPx = (Number.parseFloat(originY) / 100) * 100;
        const centerX = 200 + (1 - scale) * originXPx;
        const centerY = 150 + (1 - scale) * originYPx;
        const width = 100 * scale;
        const height = 100 * scale;
        return {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
        };
      },
    });
    const onTransform = vi.fn();
    host.startPicking("select", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onCancel: () => undefined,
    });

    const down = (target: HTMLElement, pointerId: number, x: number, y: number) => {
      const event = new Event("pointerdown", { bubbles: true, composed: true });
      Object.assign(event, { button: 0, pointerId, clientX: x, clientY: y });
      target.dispatchEvent(event);
    };
    down(button, 1, 150, 100);
    const selectUp = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(selectUp, {
      button: 0,
      pointerId: 1,
      clientX: 150,
      clientY: 100,
    });
    root.dispatchEvent(selectUp);
    const click = new Event("click", { bubbles: true, composed: true });
    Object.assign(click, { clientX: 150, clientY: 100 });
    button.dispatchEvent(click);

    const handle = root.querySelector<HTMLElement>(
      '[data-playable-transform-handle="se"]',
    )!;
    down(handle, 2, 225, 175);
    const grow = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(grow, { pointerId: 2, clientX: 300, clientY: 250 });
    root.dispatchEvent(grow);

    const resized = button.getBoundingClientRect();
    expect(resized.x + resized.width / 2).toBeCloseTo(150);
    expect(resized.y + resized.height / 2).toBeCloseTo(100);
    expect(button.style.transformOrigin).toBe("25% 25%");

    const shrink = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(shrink, { pointerId: 2, clientX: 262.5, clientY: 212.5 });
    root.dispatchEvent(shrink);
    const shrunk = button.getBoundingClientRect();
    expect(shrunk.x + shrunk.width / 2).toBeCloseTo(150);
    expect(shrunk.y + shrunk.height / 2).toBeCloseTo(100);

    const regrow = new Event("pointermove", { bubbles: true, composed: true });
    Object.assign(regrow, { pointerId: 2, clientX: 300, clientY: 250 });
    root.dispatchEvent(regrow);
    const regrown = button.getBoundingClientRect();
    expect(regrown.x + regrown.width / 2).toBeCloseTo(150);
    expect(regrown.y + regrown.height / 2).toBeCloseTo(100);

    const resizeUp = new Event("pointerup", { bubbles: true, composed: true });
    Object.assign(resizeUp, {
      button: 0,
      pointerId: 2,
      clientX: 300,
      clientY: 250,
    });
    root.dispatchEvent(resizeUp);
    expect(onTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        transform: { scale: 3, rotation: 0, originX: 25, originY: 25 },
        inPlace: true,
      }),
    );

    host.destroy();
    window.close();
  });

  it("routes undo and redo shortcuts pressed in the scene preview to its editor", async () => {
    const window = new Window();
    Object.defineProperty(window, "top", { value: {} });
    Object.defineProperty(window, "origin", { value: "null" });
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      ShadowRoot: window.ShadowRoot,
      Event: window.Event,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    const document = window.document as unknown as Document;
    const host = new DocumentPlayableSurfaceHost(document, async () => ({
      mount: async () => undefined,
    }));
    await host.mountNode(
      {
        id: "choice",
        html: '<main data-putenggame-source="nodes/choice/index.html:1:1"><button data-putenggame-source="nodes/choice/index.html:1:73">Choice</button></main>',
        css: "",
        javascript: "",
        inputs: [],
      },
      {} as never,
    );
    const onHistoryCommand = vi.fn();
    host.startPicking("select", {
      onPick: () => undefined,
      onTextSelect: () => undefined,
      onInteractionSelect: () => undefined,
      onTextEdit: () => undefined,
      onTextCreate: () => undefined,
      onMove: () => undefined,
      onTransform: () => undefined,
      onDelete: () => undefined,
      onPasteElements: async () => undefined,
      onHistoryCommand,
      onCancel: () => undefined,
    });

    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "z",
        ctrlKey: true,
      }) as unknown as Event,
    );
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      }) as unknown as Event,
    );
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "y",
        ctrlKey: true,
      }) as unknown as Event,
    );

    expect(onHistoryCommand.mock.calls).toEqual([
      ["undo"],
      ["redo"],
      ["redo"],
    ]);
    host.destroy();
    window.close();
  });
});

interface FakeElement extends PickableElement {
  children: FakeElement[];
}

function element(
  tag: string,
  attributes: Record<string, string> = {},
  parent?: FakeElement,
  text = "",
): FakeElement {
  const node: FakeElement = {
    tagName: tag.toUpperCase(),
    id: attributes.id ?? "",
    parentElement: parent ?? null,
    textContent: text,
    children: [],
    getAttribute: (name) => attributes[name] ?? null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
  parent?.children.push(node);
  return node;
}
