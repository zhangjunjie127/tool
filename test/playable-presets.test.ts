import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { addPlayableNode } from "../src/daemon/playable-add-node.js";
import {
  createNodeCodebase,
  createPlayableStarterCodebase,
  readNodeCodebase,
} from "../src/daemon/playable-codebase.js";
import { validatePlayableProject } from "../src/daemon/playable-project.js";
import { PLAYABLE_PRESETS, PLAYABLE_PRESET_IDS, playablePreset } from "../src/daemon/playable-presets.js";
import { PLAYABLE_PROJECT_STYLE_FILES } from "../src/daemon/playable-style.js";
import { playableBackdrop } from "../src/shared/playable-backdrop.js";
import type { NodeGraph, PlayableNode, PlayableNodeContext } from "../src/shared/playable-nodes.js";
import { MemoryPlayableSaveStore, NodeRuntime } from "../src/shared/playable-runtime.js";
import { createStarterCodebaseWithScene } from "./playable-fixture.js";

/** A project with one Blank Scene, `start`, unless it should be new and empty. */
async function createWorkspace(name: string, empty = false): Promise<string> {
  const workspacePath = await mkdtemp(path.join(tmpdir(), `putenggame-${name}-`));
  await createNodeCodebase(
    workspacePath,
    empty
      ? createPlayableStarterCodebase("Presets", { width: 1280, height: 720 })
      : createStarterCodebaseWithScene("Presets", { width: 1280, height: 720 }),
  );
  return workspacePath;
}

describe("Playable Presets", () => {
  it("describes every Preset with starter source that imports the Project Style", () => {
    expect(PLAYABLE_PRESETS.map((preset) => preset.id)).toEqual([...PLAYABLE_PRESET_IDS]);
    for (const preset of PLAYABLE_PRESETS) {
      const source = preset.source("Ash Club");
      expect(preset.brief.length).toBeGreaterThan(20);
      expect(preset.summary.length).toBeGreaterThan(10);
      expect(preset.summary.length).toBeLessThan(60);
      expect(source.css).toContain('@import "../../shared/style/components.css";');
      expect(source.javascript).toContain("mount");
      // Every Template has one background the editor can set.
      expect(playableBackdrop(source.html)).toBe("missing");
      // Declared Signals are the ones the starter source emits, from either file.
      for (const signal of preset.signals) {
        expect(`${source.html}${source.javascript}`).toContain(signal.id);
      }
    }
    expect(playablePreset("nope")).toBeUndefined();
    expect(playablePreset("game-settings")).toBeUndefined();
  });

  it("retains thumbnail assets for each built-in scene preset", async () => {
    for (const id of PLAYABLE_PRESET_IDS) {
      await access(path.join(import.meta.dirname, "../src/renderer/assets/templates", `${id}.webp`));
    }
  });

  it("escapes the title in starter HTML", () => {
    expect(playablePreset("ending")!.source('<script>"x"').html).toContain(
      "&lt;script&gt;&quot;x&quot;",
    );
  });

});

/** Just enough DOM for playScene: elements with children, attributes, and listeners. */
class FakeElement {
  children: FakeElement[] = [];
  parentElement?: FakeElement;
  listeners = new Map<
    string,
    (event?: { currentTarget: FakeElement; target?: { closest?: (selector: string) => unknown } }) => unknown
  >();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  [key: string]: unknown;
  constructor(readonly tagName: string, readonly attributes: Record<string, string> = {}) {}
  append(...children: FakeElement[]) {
    for (const child of children) child.parentElement = this;
    this.children.push(...children);
  }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector === '[data-media="backdrop"]' && child.attributes["data-media"] === "backdrop") return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  addEventListener(type: string, listener: (event?: { currentTarget: FakeElement; target?: { closest?: (selector: string) => unknown } }) => unknown) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  closest(selector: string) {
    return this.attributes.interactive === "true" &&
      selector.includes(this.tagName.toLowerCase())
      ? this
      : null;
  }
  click(target: { closest?: (selector: string) => unknown } = this) {
    return this.listeners.get("click")?.({ currentTarget: this, target });
  }
  remove() { this.removed = true; }
  focus() {}
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}

/** Mounts a Scene whose background has the given attributes, as the editor writes them. */
async function mountScene(attributes: Record<string, string>) {
  const { playScene } = await loadSceneModule();
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document;
  const root = new FakeElement("root");
  const scene = new FakeElement("main");
  const backdrop = new FakeElement("div", { "data-media": "backdrop", ...attributes });
  scene.append(backdrop);
  root.append(scene);
  const emitted: string[] = [];
  const context = {
    root,
    assets: { url: (id: string) => `blob:${id}` },
    navigation: { emit: async (signal: string) => { emitted.push(signal); } },
  };
  try {
    const cleanup = playScene(context, { signal: "next" }) as () => void;
    return {
      scene,
      backdrop,
      emitted,
      cleanup,
      click: (target?: FakeElement) =>
        scene.listeners.get("click")!({ currentTarget: scene, target: target ?? scene }),
    };
  } finally {
    globalThis.document = previous;
  }
}

async function loadSceneModule() {
  const directory = await mkdtemp(path.join(tmpdir(), "putenggame-scene-module-"));
  try {
    const file = path.join(directory, "components.mjs");
    await writeFile(file, PLAYABLE_PROJECT_STYLE_FILES["shared/style/components.js"]!);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("playScene", () => {
  it("plays a background video and only advances after a single-play video ends", async () => {
    const { scene, backdrop, emitted, click, cleanup } = await mountScene({ "data-asset": "opening", "data-type": "video" });
    const video = backdrop.children[0]!;
    expect(video).toMatchObject({ tagName: "video", src: "blob:opening" });
    expect(video.loop).toBe(false);
    expect(scene.children).toEqual([backdrop]);
    click();
    expect(emitted).toEqual([]);
    video.listeners.get("ended")!();
    click();
    expect(emitted).toEqual(["next"]);
    cleanup();
    expect(video.paused).toBe(true);
    expect(video.removed).toBe(true);
    expect(scene.listeners.size).toBe(0);
  });

  it("loops a background video when the Node enables looping", async () => {
    const { backdrop, emitted, click, cleanup } = await mountScene({
      "data-asset": "opening",
      "data-type": "video",
      "data-loop": "true",
    });
    const video = backdrop.children[0]!;
    expect(video.loop).toBe(true);
    click();
    expect(emitted).toEqual(["next"]);
    cleanup();
  });

  it("does not let a button click bubble into the scene-level continue action", async () => {
    const { backdrop, emitted, click } = await mountScene({
      "data-asset": "opening",
      "data-type": "video",
      "data-loop": "true",
    });
    click(new FakeElement("button", { interactive: "true" }));
    expect(emitted).toEqual([]);
    backdrop.children[0]!.listeners.get("ended")!();
    expect(emitted).toEqual(["next"]);
  });

  it("shows a background image the player clicks past", async () => {
    const { backdrop, emitted, click } = await mountScene({ "data-asset": "still", "data-type": "image" });
    expect(backdrop.children[0]).toMatchObject({ tagName: "img", src: "blob:still" });
    click();
    expect(emitted).toEqual(["next"]);
  });

  it("shows nothing over an empty background", async () => {
    const { scene, backdrop } = await mountScene({});
    expect(backdrop.children).toEqual([]);
    expect(scene.children).toEqual([backdrop]);
  });

  it("does not add cinematic letterbox bars over the Scene", () => {
    const css = PLAYABLE_PROJECT_STYLE_FILES["shared/style/components.css"]!;
    expect(css).not.toContain(".has-backdrop::before");
    expect(css).not.toContain(".has-backdrop::after");
  });
});

/** Just enough of a button for the Main menu: its data attributes and its click listener. */
class FakeButton {
  readonly dataset: Record<string, string> = {};
  listener?: (event: { currentTarget: FakeButton }) => unknown;
  constructor(attributes: string) {
    for (const [, name, value] of attributes.matchAll(/data-([a-z-]+)(?:="([^"]*)")?/g)) {
      this.dataset[name!.replace(/-(.)/g, (_, letter: string) => letter.toUpperCase())] = value ?? "";
    }
  }
  setAttribute() {}
  querySelector() { return { remove() {} }; }
  addEventListener(_type: string, listener: FakeButton["listener"]) { this.listener = listener; }
  removeEventListener() { this.listener = undefined; }
  click() { return this.listener?.({ currentTarget: this }); }
}

/** The Main menu's node.js, beside the Project Style module it imports. */
async function loadMainMenuModule(javascript: string): Promise<{ mount: (context: unknown) => () => void }> {
  const directory = await mkdtemp(path.join(tmpdir(), "putenggame-menu-module-"));
  try {
    await mkdir(path.join(directory, "nodes/menu"), { recursive: true });
    await mkdir(path.join(directory, "shared/style"), { recursive: true });
    await writeFile(path.join(directory, "package.json"), '{ "type": "module" }');
    await writeFile(path.join(directory, "shared/style/components.js"), PLAYABLE_PROJECT_STYLE_FILES["shared/style/components.js"]!);
    const file = path.join(directory, "nodes/menu/node.js");
    await writeFile(file, javascript);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Main menu Template", () => {
  it("mounts when the optional Continue button has been removed", async () => {
    const source = playablePreset("main-menu")!.source("Ash Club");
    const { mount } = await loadMainMenuModule(source.javascript);
    const root = {
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const context = {
      root,
      assets: { url: () => "" },
      session: { hasSave: () => false, continue: () => {} },
      navigation: { connected: () => true, emit: () => {} },
    } as unknown as PlayableNodeContext;

    const cleanup = mount(context);
    expect(cleanup).toBeTypeOf("function");
    cleanup();
  });

  it("makes each menu accent an independently selectable element", () => {
    const source = playablePreset("main-menu")!.source("Ash Club");
    expect(source.html.match(/class="menu-indicator"/g)).toHaveLength(3);
    expect(source.html.match(/data-putenggame-selectable/g)).toHaveLength(3);
    expect(PLAYABLE_PROJECT_STYLE_FILES["shared/style/components.css"]).toContain(
      ".menu li:is(:hover, :focus-within) .menu-indicator",
    );
    expect(PLAYABLE_PROJECT_STYLE_FILES["shared/style/components.css"]).not.toContain(
      ".menu .action::before",
    );
  });

  it("starts a new game with the starting Variables after the player goes Home", async () => {
    const preset = playablePreset("main-menu")!;
    const source = preset.source("Ash Club");
    const { mount } = await loadMainMenuModule(source.javascript);
    const scene = (id: string, signals: PlayableNode["signals"]): PlayableNode => ({
      id,
      title: id,
      source: { html: `nodes/${id}/index.html`, css: `nodes/${id}/style.css`, javascript: `nodes/${id}/node.js` },
      assets: [],
      signals,
    });
    const graph: NodeGraph = {
      version: 1,
      title: "Ash Club",
      viewport: { width: 1280, height: 720 },
      entryNodeId: "menu",
      initialState: { trust: 0 },
      assets: {},
      nodes: [scene("menu", preset.signals), scene("chapter", [{ id: "home", label: "Home", role: "navigation" }])],
      edges: [
        { id: "menu-start", source: { nodeId: "menu", signal: "start" }, targetNodeId: "chapter", mode: "replace" },
        { id: "chapter-home", source: { nodeId: "chapter", signal: "home" }, targetNodeId: "menu", mode: "replace" },
      ],
    };
    let buttons: FakeButton[] = [];
    let chapter: Omit<PlayableNodeContext, "root"> | undefined;
    const runtime = new NodeRuntime({
      graph,
      compiled: {
        version: 1,
        nodes: Object.fromEntries(graph.nodes.map(({ id }) => [id, { id, html: "", css: "", javascript: "", inputs: [] }])),
      },
      graphSignature: "menu-v1",
      surfaceHost: {
        async mountNode(surface, context) {
          if (surface.id !== "menu") {
            chapter = context;
            return { destroy() {} };
          }
          // The buttons the Template's HTML declares.
          buttons = [...source.html.matchAll(/<button([^>]*)>/g)].map(([, attributes]) => new FakeButton(attributes!));
          const root = {
            querySelector: (selector: string) => selector === "[data-continue]" ? buttons.find((button) => "continue" in button.dataset) : null,
            querySelectorAll: () => buttons.filter((button) => "signal" in button.dataset),
          };
          return { cleanup: mount({ ...context, root }), destroy() {} };
        },
      },
      saveStore: new MemoryPlayableSaveStore(),
      assetUrls: {},
    });
    const start = () => buttons.find((button) => button.dataset.signal === "start")!.click();
    await runtime.start();

    await start();
    await chapter!.state.set("trust", 3);
    await chapter!.navigation.emit("home");
    expect(runtime.snapshot()).toMatchObject({ currentNodeId: "menu", state: { trust: 3 } });
    await start();

    expect(runtime.snapshot()).toMatchObject({ currentNodeId: "chapter", state: { trust: 0 } });
  });
});

it("lets the QTE Template keep playing instead of emitting a missed-action failure when enabled", () => {
  const qte = playablePreset("qte")!.source("Timed choice");
  expect(qte.javascript).toContain('context.navigation.fail(signal)');
  expect(qte.javascript).toContain('context.navigation.emit(signal)');
});

describe("Affection Template", () => {
  it("changes the declared score and emits the threshold branch", async () => {
    const source = playablePreset("affection")!.source("Relationship");
    const directory = await mkdtemp(path.join(tmpdir(), "putenggame-affection-module-"));
    const previousDocument = globalThis.document;
    try {
      await mkdir(path.join(directory, "nodes/relationship"), { recursive: true });
      await mkdir(path.join(directory, "shared/style"), { recursive: true });
      await writeFile(path.join(directory, "package.json"), '{ "type": "module" }');
      await writeFile(
        path.join(directory, "shared/style/components.js"),
        'export function showBackdrop() { return { cleanup() {} }; }',
      );
      const file = path.join(directory, "nodes/relationship/node.js");
      await writeFile(file, source.javascript);
      const { mount } = await import(pathToFileURL(file).href) as {
        mount: (context: never) => () => void;
      };
      const configText = source.html.match(/data-affection-config>(.*?)<\/script>/)?.[1]!;
      const config = new FakeElement("script");
      config.textContent = configText;
      const roster = new FakeElement("div");
      const choices = new FakeElement("div");
      const root = {
        querySelector: (selector: string) => ({
          "[data-affection-config]": config,
          "[data-roster]": roster,
          "[data-choices]": choices,
        })[selector],
      };
      globalThis.document = {
        createElement: (tag: string) => new FakeElement(tag),
      } as unknown as Document;
      const state: Record<string, number> = { affection_lan: 0 };
      const listeners = new Set<() => void>();
      const emitted: string[] = [];
      const cleanup = mount({
        root,
        state: {
          get: (key: string) => state[key],
          set: async (key: string, value: number) => {
            state[key] = value;
            listeners.forEach((listener) => listener());
          },
          subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        navigation: { emit: async (signal: string) => { emitted.push(signal); } },
      } as never);

      await choices.children[0]!.click();
      expect(state.affection_lan).toBe(2);
      expect(emitted).toEqual(["closer"]);
      cleanup();
    } finally {
      globalThis.document = previousDocument;
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("addPlayableNode", () => {
  it("writes the Preset source, Signals, and canvas position", async () => {
    const workspacePath = await createWorkspace("add-node");

    const result = await addPlayableNode(workspacePath, {
      preset: "choice",
      id: "carriage",
      title: "The carriage",
    });

    expect(result).toMatchObject({
      id: "carriage",
      title: "The carriage",
      preset: "choice",
      files: ["nodes/carriage/index.html", "nodes/carriage/style.css", "nodes/carriage/node.js"],
      signals: ["option-a", "option-b"],
    });
    const codebase = await readNodeCodebase(workspacePath);
    expect(codebase.graph.nodes.map((node) => node.id)).toEqual(["start", "carriage"]);
    expect(codebase.graph.nodes[1]).toMatchObject({
      title: "The carriage",
      assets: [],
      signals: [{ id: "option-a" }, { id: "option-b" }],
      source: { html: "nodes/carriage/index.html" },
    });
    expect(codebase.editorLayout.nodes.carriage).toEqual({ x: 80, y: 180 });
    const starterHtml = await readFile(
      path.join(workspacePath, "nodes/carriage/index.html"),
      "utf8",
    );
    expect(starterHtml).toContain("The carriage");
    expect(starterHtml).toContain('data-putenggame-no-input-mode="continue"');
    // The new Node compiles alongside the rest of the project.
    const validation = await validatePlayableProject(workspacePath, "draft");
    expect(validation.issues).toEqual([]);
  });

  it("keeps a menu and a Story map off the Story map, and compiles the Story map", async () => {
    const workspacePath = await createWorkspace("add-story-map");

    await addPlayableNode(workspacePath, { preset: "main-menu", id: "menu" });
    await addPlayableNode(workspacePath, { preset: "story-map", id: "map" });

    const nodes = (await readNodeCodebase(workspacePath)).graph.nodes;
    expect(nodes.find((node) => node.id === "start")?.story).toBeUndefined();
    expect(nodes.find((node) => node.id === "menu")?.story).toEqual({ hidden: true });
    expect(nodes.find((node) => node.id === "map")?.story).toEqual({ hidden: true });
    expect((await validatePlayableProject(workspacePath, "draft")).issues).toEqual([]);
  });

  it("adds the affection Template's persistent character Variables and a playable branch scene", async () => {
    const workspacePath = await createWorkspace("affection-preset");
    const result = await addPlayableNode(workspacePath, { preset: "affection", id: "relationship" });
    const { graph } = await readNodeCodebase(workspacePath);
    const node = graph.nodes.find((candidate) => candidate.id === result.id)!;

    expect(graph.initialState.affection_lan).toBe(0);
    expect(graph.variables?.affection_lan).toContain("affection");
    expect(node.signals.map(({ id }) => id)).toEqual(["closer", "distant", "reassure", "guarded"]);
    expect((await readFile(path.join(workspacePath, node.source.html), "utf8"))).toContain("data-affection-config");
    expect((await validatePlayableProject(workspacePath, "draft")).issues).toEqual([]);
  });

  it("gives a Main menu a Story map Exit that waits to be connected", async () => {
    const workspacePath = await createWorkspace("menu-story-map");

    await addPlayableNode(workspacePath, { preset: "main-menu", id: "menu" });

    const { graph } = await readNodeCodebase(workspacePath);
    expect(graph.nodes.find((node) => node.id === "menu")?.signals).toContainEqual({ id: "story-map", label: "Story map", role: "navigation" });
    expect(graph.edges.some((edge) => edge.source.nodeId === "menu")).toBe(false);
  });

  it("names the Node in order and honours an explicit position", async () => {
    const workspacePath = await createWorkspace("add-node-defaults");

    const result = await addPlayableNode(workspacePath, {
      preset: "ending",
      id: "home",
      position: { x: 900, y: 60 },
    });

    expect(result).toMatchObject({ title: "Node 2", signals: [] });
    const codebase = await readNodeCodebase(workspacePath);
    expect(codebase.editorLayout.nodes.home).toEqual({ x: 900, y: 60 });
  });

  it("makes the first Node of an empty project its Start", async () => {
    const workspacePath = await createWorkspace("add-node-empty", true);
    expect((await validatePlayableProject(workspacePath, "draft")).issues).toEqual([]);

    await addPlayableNode(workspacePath, { preset: "main-menu", id: "menu" });

    const next = await readNodeCodebase(workspacePath);
    expect(next.graph.entryNodeId).toBe("menu");
    expect((await validatePlayableProject(workspacePath, "draft")).issues).toEqual([]);
  });

  it("rejects an unknown Preset, a bad ID, and a duplicate Node", async () => {
    const workspacePath = await createWorkspace("add-node-errors");

    await expect(addPlayableNode(workspacePath, { preset: "epilogue", id: "a" }))
      .rejects.toThrow(/Unknown Preset "epilogue"/);
    await expect(addPlayableNode(workspacePath, { preset: "blank", id: "../escape" }))
      .rejects.toThrow(/Invalid Node ID/);
    await expect(addPlayableNode(workspacePath, { preset: "blank", id: "start" }))
      .rejects.toThrow(/already exists/);
  });
});
