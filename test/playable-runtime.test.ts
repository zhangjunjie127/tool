import { describe, expect, it } from "vitest";
import type {
  CompiledNodeGraph,
  CompiledPlayableSurface,
} from "../src/shared/playable-compiled.js";
import type { NodeGraph, PlayableNodeContext } from "../src/shared/playable-nodes.js";
import {
  MemoryPlayableSaveStore,
  MemoryPlayableSeenStore,
  NodeRuntime,
  type NodeRuntimeOptions,
  type PlayableMountedSurface,
  type PlayableSave,
  type PlayableSaveStore,
  type PlayableSeenStore,
  type PlayableSurfaceHost,
} from "../src/shared/playable-runtime.js";
import type { PlayableSeen } from "../src/shared/playable-story-map.js";
import { createPlayableSettingsService } from "../src/shared/playable-settings.js";
import { createNodeGraphFixture } from "./playable-fixture.js";

type NodeContext = Omit<PlayableNodeContext, "root">;

class FakeSurfaceHost implements PlayableSurfaceHost {
  readonly events: string[] = [];
  readonly nodeContexts: Array<{ id: string; context: NodeContext }> = [];
  readonly videoEndedCallbacks: Array<() => void> = [];
  onMountNode?: (
    surface: CompiledPlayableSurface,
    context: NodeContext,
  ) => void | Promise<void>;
  nodeCleanup?: (id: string, context: NodeContext) => void | Promise<void>;
  nodeDestroy?: (id: string) => void | Promise<void>;

  async mountNode(
    surface: CompiledPlayableSurface,
    context: NodeContext,
    onBackdropVideoEnded?: () => void,
  ): Promise<PlayableMountedSurface> {
    this.events.push(`mount:${surface.id}`);
    this.nodeContexts.push({ id: surface.id, context });
    if (onBackdropVideoEnded)
      this.videoEndedCallbacks.push(onBackdropVideoEnded);
    await this.onMountNode?.(surface, context);
    return {
      cleanup: () => {
        this.events.push(`cleanup:${surface.id}`);
        return this.nodeCleanup?.(surface.id, context);
      },
      destroy: () => {
        this.events.push(`destroy:${surface.id}`);
        return this.nodeDestroy?.(surface.id);
      },
    };
  }
}

describe("Node Runtime", () => {
  it("shares the global font with every mounted Scene", async () => {
    const graph = createNodeGraphFixture();
    graph.globalFontFamily = "Example UI";
    const { runtime, host } = createRuntime({ graph });

    await runtime.start();
    expect(nodeContext(host, "menu").globalFontFamily).toBe("Example UI");
    await nodeContext(host, "menu").navigation.emit("start");
    expect(nodeContext(host, "lobby").globalFontFamily).toBe("Example UI");
  });

  it("shares saved player preferences across nodes without adding them to story State", async () => {
    let persistedBrightness = 0;
    const settings = createPlayableSettingsService(undefined, async (value) => {
      persistedBrightness = value.brightness;
    });
    const { runtime, host } = createRuntime({ settings });

    await runtime.start();
    const menu = nodeContext(host, "menu");
    menu.settings!.set("brightness", 125);
    await menu.navigation.emit("start");
    const lobby = nodeContext(host, "lobby");

    expect(lobby.settings!.get("brightness")).toBe(125);
    await lobby.settings!.save();
    expect(persistedBrightness).toBe(125);
    expect(runtime.snapshot().state).toEqual({
      hasKey: false,
      clues: [],
      profile: { name: "" },
    });

    await runtime.dispose();
  });

  it("exposes only declared video Assets to the optional subtitle provider", async () => {
    const graph = createNodeGraphFixture();
    graph.assets.opening = {
      type: "video",
      source: { kind: "workspace", path: "assets/opening.mp4" },
    };
    graph.nodes[0]!.assets.push("opening");
    const requests: string[] = [];
    const { runtime, host } = createRuntime({
      graph,
      transcriptionProvider: {
        async transcribe({ assetId }) {
          requests.push(assetId);
          return [{ startSeconds: 0, endSeconds: 2, text: "Hello" }];
        },
      },
    });

    await runtime.start();
    const transcription = nodeContext(host, "menu").transcription!;
    expect(transcription.available).toBe(true);
    await expect(transcription.transcribe("theme")).rejects.toThrow(
      "declared video Asset",
    );
    await expect(transcription.transcribe("opening")).resolves.toEqual([
      { startSeconds: 0, endSeconds: 2, text: "Hello" },
    ]);
    expect(requests).toEqual(["opening"]);

    await runtime.dispose();
  });

  it("waits for the background video to end before taking a single configured Exit", async () => {
    const graph = createNodeGraphFixture();
    const menu = graph.nodes.find((node) => node.id === "menu")!;
    menu.signals = [{ id: "start", label: "Start" }];
    menu.videoEndAutoAdvance = true;
    graph.edges = graph.edges.filter(
      (edge) => edge.source.nodeId !== "menu" || edge.source.signal === "start",
    );
    const compiled = createCompiledGraph();
    compiled.nodes.menu!.html =
      '<main><div data-media="backdrop" data-asset="opening" data-type="video"></div></main>';
    const { runtime, host } = createRuntime({ graph, compiled });

    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");
    await nodeContext(host, "menu").navigation.fail("start");

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      recentSignals: [],
    });
    expect(host.events).toEqual(["mount:menu"]);

    host.videoEndedCallbacks[0]!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "lobby",
      recentSignals: [
        expect.objectContaining({
          nodeId: "menu",
          signal: "start",
          targetNodeId: "lobby",
        }),
      ],
    });
    expect(host.events.filter((event) => event === "mount:lobby")).toHaveLength(1);
    await runtime.dispose();
  });

  it("keeps immediate navigation when video-end auto-advance is not enabled", async () => {
    const graph = createNodeGraphFixture();
    const menu = graph.nodes.find((node) => node.id === "menu")!;
    menu.signals = [{ id: "start", label: "Start" }];
    graph.edges = graph.edges.filter(
      (edge) => edge.source.nodeId !== "menu" || edge.source.signal === "start",
    );
    const compiled = createCompiledGraph();
    compiled.nodes.menu!.html =
      '<main><div data-media="backdrop" data-asset="opening" data-type="video"></div></main>';
    const { runtime, host } = createRuntime({ graph, compiled });

    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");

    expect(runtime.snapshot().currentNodeId).toBe("lobby");
    expect(host.videoEndedCallbacks).toHaveLength(0);
    await runtime.dispose();
  });

  it("loads each Scene's declared Assets before mounting it", async () => {
    const loaded: string[][] = [];
    const { runtime, host } = createRuntime({
      ensureAssets: async (ids) => {
        loaded.push([...ids]);
      },
    });

    await runtime.start();

    expect(loaded).toEqual([["background"]]);
    expect(host.events).toEqual(["mount:menu"]);

    await nodeContext(host, "menu").navigation.emit("start");

    expect(loaded).toEqual([["background"], ["theme"]]);
    expect(host.events).toEqual([
      "mount:menu",
      "mount:lobby",
      "cleanup:menu",
      "destroy:menu",
    ]);
    await runtime.dispose();
  });

  it("routes a failure through its declared Exit by default", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();

    await nodeContext(host, "menu").navigation.fail("start");

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "lobby",
      recentSignals: [
        expect.objectContaining({
          nodeId: "menu",
          signal: "start",
          targetNodeId: "lobby",
        }),
      ],
    });
  });

  it("mounts the Entry Node and replaces the current Node", async () => {
    const { runtime, host } = createRuntime();

    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");

    expect(host.events).toEqual([
      "mount:menu",
      "mount:lobby",
      "cleanup:menu",
      "destroy:menu",
    ]);
    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "lobby",
      backStack: [],
      recentSignals: [
        expect.objectContaining({
          nodeId: "menu",
          signal: "start",
          targetNodeId: "lobby",
        }),
      ],
      save: { present: true, savedAt: expect.any(String) },
    });
  });

  it("supports push and back", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();

    await nodeContext(host, "menu").navigation.emit("inspect");
    expect(runtime.snapshot().backStack).toEqual(["menu"]);
    await nodeContext(host, "archive").navigation.back();

    expect(runtime.snapshot()).toMatchObject({ currentNodeId: "menu", backStack: [] });
    expect(host.nodeContexts.map(({ id }) => id)).toEqual(["menu", "archive", "menu"]);
  });

  it("returns to the entry Scene without resetting shared State", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();
    await nodeContext(host, "menu").state.set("hasKey", true);
    await nodeContext(host, "menu").navigation.emit("start");

    await runtime.returnToEntry();

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      backStack: [],
      state: { hasKey: true },
    });
    expect(host.nodeContexts.map(({ id }) => id)).toEqual([
      "menu",
      "lobby",
      "menu",
    ]);
  });

  it("opens the entry Scene's connected Story Map route from any Scene", async () => {
    const graph = createNodeGraphFixture();
    graph.nodes[0]!.signals.push({
      id: "story-map",
      label: "Story map",
      role: "navigation",
    });
    graph.nodes.push({
      id: "map",
      title: "Story map",
      source: {
        html: "nodes/map/index.html",
        css: "nodes/map/style.css",
        javascript: "nodes/map/node.js",
      },
      assets: [],
      signals: [],
    });
    graph.edges.push({
      id: "open-story-map",
      source: { nodeId: "menu", signal: "story-map" },
      targetNodeId: "map",
      mode: "replace",
    });
    const compiled = createCompiledGraph();
    compiled.nodes.map = {
      id: "map",
      html: "",
      css: "",
      javascript: "export function mount() {}",
      inputs: [],
    };
    const { runtime, host } = createRuntime({ graph, compiled });
    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");

    await runtime.openStoryMap();

    expect(runtime.snapshot().currentNodeId).toBe("map");
    expect(host.nodeContexts.map(({ id }) => id)).toEqual([
      "menu",
      "lobby",
      "map",
    ]);
  });

  it("routes a shared component's Signal as the Signal of the Scene that shows it", async () => {
    const { runtime, host } = createRuntime({ startNodeId: "lobby" });
    await runtime.start();

    // The shared top bar emits through the lobby's own context.
    await nodeContext(host, "lobby").navigation.emit("archive");
    await expect(nodeContext(host, "archive").navigation.emit("archive")).rejects.toMatchObject({
      code: "unknown-signal",
    });
    await nodeContext(host, "archive").navigation.emit("home");

    const snapshot = runtime.snapshot();
    expect(snapshot.currentNodeId).toBe("menu");
    expect(snapshot.recentSignals).toEqual([
      expect.objectContaining({ nodeId: "lobby", signal: "archive", targetNodeId: "archive" }),
      expect.objectContaining({ nodeId: "archive", signal: "home", targetNodeId: "menu" }),
    ]);
    expect(snapshot.errors).toEqual([
      expect.objectContaining({ nodeId: "archive", code: "unknown-signal" }),
    ]);
  });

  it("aborts lifecycle before cleanup and invalidates an exited context", async () => {
    const { runtime, host } = createRuntime();
    const cleanupSignals: boolean[] = [];
    host.nodeCleanup = (_id, context) => {
      cleanupSignals.push(context.lifecycle.signal.aborted);
    };
    await runtime.start();
    const menu = nodeContext(host, "menu");

    await menu.navigation.emit("start");

    expect(cleanupSignals).toEqual([true]);
    await expect(menu.state.set("hasKey", true)).rejects.toMatchObject({
      code: "stale-surface",
    });
  });

  it("rejects navigation while a surface is mounting", async () => {
    const host = new FakeSurfaceHost();
    let nodeNavigation: Promise<void> | undefined;
    host.onMountNode = (_surface, context) => {
      nodeNavigation = context.navigation.emit("start");
    };
    const { runtime } = createRuntime({ host });

    await runtime.start();

    await expect(nodeNavigation).rejects.toMatchObject({
      code: "navigation-in-progress",
    });
    expect(runtime.snapshot().currentNodeId).toBe("menu");
  });

  it("rejects a second navigation from a Node that is already leaving", async () => {
    const host = new FakeSurfaceHost();
    let releaseArchive!: () => void;
    const archiveMounted = new Promise<void>((resolve) => {
      releaseArchive = resolve;
    });
    host.onMountNode = async (surface) => {
      if (surface.id === "archive") await archiveMounted;
    };
    const { runtime } = createRuntime({ host });
    await runtime.start();

    const menu = nodeContext(host, "menu");
    const first = menu.navigation.emit("inspect");
    await expect(
      menu.navigation.emit("start"),
    ).rejects.toMatchObject({ code: "navigation-in-progress" });
    releaseArchive();
    await first;
  });

  it("rejects concurrent starts before save loading finishes", async () => {
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const { runtime } = createRuntime({
      saveStore: {
        async load() {
          await loadGate;
          return undefined;
        },
        async save() {},
      },
    });

    const first = runtime.start();
    await expect(runtime.start()).rejects.toMatchObject({
      code: "already-started",
    });
    releaseLoad();
    await first;
  });

  it("cancels startup cleanly when disposed during save loading", async () => {
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const { runtime, host } = createRuntime({
      saveStore: {
        async load() {
          await loadGate;
          return undefined;
        },
        async save() {},
      },
    });

    const start = runtime.start();
    const disposal = runtime.dispose();
    releaseLoad();

    await expect(start).rejects.toMatchObject({ code: "disposed" });
    await disposal;
    expect(host.events).toEqual([]);
    expect(runtime.snapshot()).toMatchObject({ status: "disposed" });
  });

  it("disposes a Node that finishes mounting after disposal begins", async () => {
    const host = new FakeSurfaceHost();
    let releaseArchive!: () => void;
    let archiveStarted!: () => void;
    const archiveGate = new Promise<void>((resolve) => {
      releaseArchive = resolve;
    });
    const mountingArchive = new Promise<void>((resolve) => {
      archiveStarted = resolve;
    });
    host.onMountNode = async (surface) => {
      if (surface.id !== "archive") return;
      archiveStarted();
      await archiveGate;
    };
    const { runtime } = createRuntime({ host });
    await runtime.start();

    const navigation = nodeContext(host, "menu").navigation.emit("inspect");
    await mountingArchive;
    const disposal = runtime.dispose();
    releaseArchive();

    await expect(navigation).rejects.toMatchObject({ code: "disposed" });
    await disposal;
    expect(host.events).toEqual([
      "mount:menu",
      "mount:archive",
      "cleanup:archive",
      "destroy:archive",
      "cleanup:menu",
      "destroy:menu",
    ]);
  });

  it("keeps the current Node when a navigation target cannot mount", async () => {
    const host = new FakeSurfaceHost();
    host.onMountNode = (surface) => {
      if (surface.id === "archive") throw new Error("archive mount failed");
    };
    const { runtime } = createRuntime({ host });
    await runtime.start();
    await expect(nodeContext(host, "menu").navigation.emit("inspect")).rejects.toThrow(
      "archive mount failed",
    );

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      status: "running",
    });
    expect(host.events).toEqual([
      "mount:menu",
      "mount:archive",
    ]);
    expect(() => nodeContext(host, "menu").state.get()).not.toThrow();
  });

  it("fails cleanly when continue restores State but its saved Node cannot mount", async () => {
    const host = new FakeSurfaceHost();
    host.onMountNode = (surface) => {
      if (surface.id === "archive") throw new Error("saved Node failed");
    };
    const saved = createSave({
      currentNodeId: "archive",
      state: { hasKey: true, clues: ["ledger"], profile: { name: "Ada" } },
    });
    const { runtime } = createRuntime({
      host,
      saveStore: new MemoryPlayableSaveStore(saved),
    });
    await runtime.start();

    await expect(nodeContext(host, "menu").session.continue()).rejects.toThrow(
      "saved Node failed",
    );

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      state: saved.state,
      status: "running",
    });
  });

  it("owns cloned State, notifies subscribers, and removes Node listeners on exit", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();
    const menu = nodeContext(host, "menu");
    const received: unknown[] = [];
    menu.state.subscribe((state) => received.push(state));

    const state = menu.state.get();
    (state.profile as { name: string }).name = "mutated outside";
    await menu.state.patch({
      hasKey: true,
      profile: { name: "Ada" },
    });
    await menu.navigation.emit("start");
    await nodeContext(host, "lobby").state.set("hasKey", false);

    expect(received).toEqual([
      expect.objectContaining({ hasKey: true, profile: { name: "Ada" } }),
    ]);
    expect(runtime.snapshot().state).toMatchObject({
      hasKey: false,
      profile: { name: "Ada" },
    });
    expect(() => nodeContext(host, "lobby").state.get("missing")).toThrowError(
      expect.objectContaining({ code: "unknown-state-key" }),
    );
  });

  it("limits each surface to its declared assets", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();

    expect(nodeContext(host, "menu").assets.url("background")).toBe(
      "asset://background",
    );
    expect(() => nodeContext(host, "menu").assets.url("theme")).toThrowError(
      expect.objectContaining({ code: "undeclared-asset" }),
    );
    await nodeContext(host, "menu").navigation.emit("start");
    expect(nodeContext(host, "lobby").assets.url("theme")).toBe("asset://theme");

    const missing = createRuntime({ assetUrls: {} });
    await missing.runtime.start();
    expect(() =>
      nodeContext(missing.host, "menu").assets.url("background"),
    ).toThrowError(expect.objectContaining({ code: "missing-asset-url" }));
  });

  it("checkpoints State and navigation writes in order", async () => {
    const saves: PlayableSave[] = [];
    const releases: Array<() => void> = [];
    const store: PlayableSaveStore = {
      async load() {
        return undefined;
      },
      async save(save) {
        saves.push(structuredClone(save));
        await new Promise<void>((resolve) => releases.push(resolve));
      },
    };
    const { runtime, host } = createRuntime({ saveStore: store });
    await runtime.start();
    const menu = nodeContext(host, "menu");

    const first = menu.state.set("hasKey", true);
    const second = menu.state.set("hasKey", false);
    await Promise.resolve();
    expect(saves).toHaveLength(1);
    releases.shift()!();
    await first;
    await Promise.resolve();
    expect(saves).toHaveLength(2);
    releases.shift()!();
    await second;

    expect(saves.map((save) => save.state.hasKey)).toEqual([true, false]);
  });

  it("continues a compatible save and ignores an incompatible one", async () => {
    const saved = createSave({
      currentNodeId: "archive",
      backStack: ["menu"],
      state: { hasKey: true, clues: ["ledger"], profile: { name: "Ada" } },
    });
    const restored = createRuntime({
      saveStore: new MemoryPlayableSaveStore(saved),
    });
    await restored.runtime.start();
    expect(restored.runtime.snapshot().save.present).toBe(true);

    await nodeContext(restored.host, "menu").session.continue();
    expect(restored.runtime.snapshot()).toMatchObject({
      currentNodeId: "archive",
      backStack: ["menu"],
      state: saved.state,
    });

    const incompatible = createRuntime({
      saveStore: new MemoryPlayableSaveStore({
        ...saved,
        graphSignature: "different",
      }),
    });
    await incompatible.runtime.start();
    expect(incompatible.runtime.snapshot().save).toEqual({ present: false, incompatible: true });
    await expect(
      nodeContext(incompatible.host, "menu").session.continue(),
    ).rejects.toMatchObject({ code: "no-save" });
  });

  it("keeps the save where the player left the story when they go Home", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");
    await nodeContext(host, "lobby").state.set("hasKey", true);

    await nodeContext(host, "lobby").navigation.emit("home");
    expect(runtime.snapshot()).toMatchObject({ currentNodeId: "menu", state: { hasKey: true } });
    await nodeContext(host, "menu").session.continue();

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "lobby",
      backStack: [],
      state: { hasKey: true },
    });
  });

  it("keeps a saved game when the player goes around the game from the menu and Back", async () => {
    const saved = createSave({
      currentNodeId: "lobby",
      state: { hasKey: true, clues: ["ledger"], profile: { name: "Ada" } },
    });
    const saveStore = new MemoryPlayableSaveStore(saved);
    // The archive is a side screen of the menu, as a Story map is.
    const { runtime, host } = createRuntime({ saveStore, graph: createGraphWithArchiveAside() });
    await runtime.start();

    await nodeContext(host, "menu").navigation.emit("inspect");
    await nodeContext(host, "archive").navigation.back();
    expect(await saveStore.load()).toEqual(saved);
    expect(nodeContext(host, "menu").session.hasSave()).toBe(true);
    await nodeContext(host, "menu").session.continue();

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "lobby",
      backStack: [],
      state: saved.state,
    });
  });

  it("offers nothing to continue after only going around the game", async () => {
    const { runtime, host } = createRuntime({ graph: createGraphWithArchiveAside() });
    await runtime.start();

    await nodeContext(host, "menu").navigation.emit("inspect");
    await nodeContext(host, "archive").navigation.back();

    expect(nodeContext(host, "menu").session.hasSave()).toBe(false);
    expect(runtime.snapshot().save).toEqual({ present: false });
  });

  it("checkpoints Back from a step in the story, and Back past where the player left it", async () => {
    const saveStore = new MemoryPlayableSaveStore();
    const { runtime, host } = createRuntime({ saveStore });
    await runtime.start();

    await nodeContext(host, "menu").navigation.emit("inspect");
    await nodeContext(host, "archive").navigation.back();
    expect(await saveStore.load()).toMatchObject({ currentNodeId: "menu", backStack: [] });

    await nodeContext(host, "menu").navigation.emit("inspect");
    await nodeContext(host, "archive").navigation.emit("home");
    expect(await saveStore.load()).toMatchObject({ currentNodeId: "archive", backStack: ["menu"] });
    await nodeContext(host, "menu").navigation.back();

    expect(runtime.snapshot()).toMatchObject({ currentNodeId: "menu", backStack: [] });
    expect(await saveStore.load()).toMatchObject({ currentNodeId: "menu", backStack: [] });
  });

  it("resets in place and restarts at the Entry Node", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();
    const menu = nodeContext(host, "menu");
    await menu.state.set("hasKey", true);
    await menu.navigation.emit("inspect");
    const archive = nodeContext(host, "archive");

    await archive.session.reset();
    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "archive",
      backStack: [],
      state: createNodeGraphFixture().initialState,
    });
    expect(host.nodeContexts.map(({ id }) => id)).toEqual(["menu", "archive"]);

    await archive.session.restart();
    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      backStack: [],
      state: createNodeGraphFixture().initialState,
    });
  });

  it("restarts the editor preview at the Entry Node and resets State", async () => {
    const { runtime, host } = createRuntime({
      policy: "report",
      startNodeId: "archive",
      previewState: { hasKey: true, clues: ["old"], profile: { name: "Player" } },
    });
    await runtime.start();

    await nodeContext(host, "archive").session.restart();

    expect(runtime.snapshot()).toMatchObject({
      currentNodeId: "menu",
      backStack: [],
      state: createNodeGraphFixture().initialState,
      reports: [],
    });
    expect(host.nodeContexts.map(({ id }) => id)).toEqual(["archive", "menu"]);
    await runtime.dispose();
  });

  it("reports listener and cleanup failures without breaking transitions", async () => {
    const errors: unknown[] = [];
    const host = new FakeSurfaceHost();
    host.nodeCleanup = () => {
      throw new Error("cleanup failed");
    };
    host.nodeDestroy = () => {
      throw new Error("destroy failed");
    };
    const { runtime } = createRuntime({
      host,
      onError: (error) => errors.push(error),
    });
    await runtime.start();
    const menu = nodeContext(host, "menu");
    menu.state.subscribe(() => {
      throw new Error("listener failed");
    });

    await menu.state.set("hasKey", true);
    await menu.navigation.emit("start");

    expect(runtime.snapshot().currentNodeId).toBe("lobby");
    expect(errors.map((error) => (error as Error).message)).toEqual([
      "listener failed",
      "cleanup failed",
      "destroy failed",
    ]);
  });

  it("rejects invalid cleanup values and invalid save timestamps", async () => {
    const invalidHost = new FakeSurfaceHost();
    invalidHost.mountNode = async () =>
      ({
        cleanup: "not a function",
        destroy() {},
      }) as unknown as PlayableMountedSurface;
    const invalidMount = createRuntime({ host: invalidHost });
    await expect(invalidMount.runtime.start()).rejects.toMatchObject({
      code: "invalid-cleanup",
    });

    const invalidSave = createRuntime({
      saveStore: new MemoryPlayableSaveStore(
        createSave({ savedAt: "not-a-date" }),
      ),
    });
    await invalidSave.runtime.start();
    expect(invalidSave.runtime.snapshot().save.present).toBe(false);
  });
});


describe("Node Runtime connected Signals", () => {
  it("tells a Node which of its Signals go somewhere", async () => {
    const host = new FakeSurfaceHost();
    const { runtime } = createRuntime({ host });
    await runtime.start();
    const menu = nodeContext(host, "menu");

    expect(menu.navigation.connected("start")).toBe(true);
    expect(menu.navigation.connected("missing")).toBe(false);
    await menu.navigation.emit("start");
    // Another Node's Signal is not this one's, even with an edge.
    expect(nodeContext(host, "lobby").navigation.connected("start")).toBe(false);
    expect(() => menu.navigation.connected("start")).toThrowError(expect.objectContaining({ code: "stale-surface" }));
  });
});

describe("Node Runtime Story Map", () => {
  it("remembers the Nodes entered and edges taken, and maps them", async () => {
    const seenStore = new MemoryPlayableSeenStore();
    const { runtime, host } = createRuntime({ seenStore });
    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");

    const map = nodeContext(host, "lobby").story.map();
    expect(map.nodes.map((node) => [node.id, node.row, node.seen, node.ending])).toEqual([
      ["menu", 0, true, false],
      ["lobby", 1, true, false],
      ["archive", 2, false, true],
    ]);
    expect(map.edges).toEqual([
      { from: "menu", to: "lobby", seen: true },
      { from: "lobby", to: "archive", seen: false },
    ]);
    await runtime.dispose();
    expect(await seenStore.load()).toEqual({
      version: 1,
      nodes: { menu: "2026-09-28T00:00:00.000Z", lobby: "2026-09-28T00:00:00.000Z" },
      edges: { "start-game": "2026-09-28T00:00:00.000Z" },
    });
  });

  it("keeps what was seen when a new game starts", async () => {
    const seenStore = new MemoryPlayableSeenStore(seenRecord(["menu", "lobby", "archive"]));
    const { runtime, host } = createRuntime({ seenStore });
    await runtime.start();
    await nodeContext(host, "menu").session.restart();

    expect(nodeContext(host, "menu").story.map().nodes.every((node) => node.seen)).toBe(true);
  });

  it("shows the whole map in a preview without adding to what was seen", async () => {
    const saved: PlayableSeen[] = [];
    const seenStore: PlayableSeenStore = {
      load: async () => seenRecord(["menu"]),
      save: async (seen) => { saved.push(seen); },
    };
    const { runtime, host } = createRuntime({ seenStore, policy: "report", startNodeId: "lobby" });
    await runtime.start();
    await nodeContext(host, "lobby").navigation.emit("archive");

    const map = nodeContext(host, "lobby").story.map();
    expect(map.nodes.every((node) => node.seen) && map.edges.every((edge) => edge.seen)).toBe(true);
    await runtime.dispose();
    expect(saved).toEqual([]);
  });

  it("plays on when what was seen cannot be read or kept", async () => {
    const errors: unknown[] = [];
    const seenStore: PlayableSeenStore = {
      load: async () => { throw new Error("storage is unavailable"); },
      save: async () => { throw new Error("storage is full"); },
    };
    const { runtime, host } = createRuntime({ seenStore, onError: (error) => errors.push(error) });
    await runtime.start();
    await nodeContext(host, "menu").navigation.emit("start");
    await runtime.dispose();

    expect(runtime.snapshot().errors.map((error) => error.message)).toEqual([
      "storage is unavailable",
      "storage is full",
    ]);
    expect(errors).toHaveLength(2);
  });
});

function seenRecord(nodes: string[]): PlayableSeen {
  return { version: 1, nodes: Object.fromEntries(nodes.map((id) => [id, "2026-09-27T00:00:00.000Z"])), edges: {} };
}

describe("NodeRuntime preview tooling", () => {
  it("registers a newly added button Signal in the running preview", async () => {
    const { runtime, host } = createRuntime({ policy: "report" });
    await runtime.start();

    expect(
      runtime.registerSignal("menu", { id: "button-1", label: "新按钮" }),
    ).toBe(true);
    expect(
      runtime.registerSignal("menu", { id: "button-1", label: "重复" }),
    ).toBe(false);
    await nodeContext(host, "menu").navigation.emit("button-1");

    expect(runtime.snapshot().recentSignals).toEqual([
      expect.objectContaining({ nodeId: "menu", signal: "button-1" }),
    ]);
    await runtime.dispose();
  });

  it("reports Signals under the report policy without leaving the Node", async () => {
    const { runtime, host } = createRuntime({ policy: "report" });
    await runtime.start();

    await nodeContext(host, "menu").navigation.emit("start");
    await nodeContext(host, "menu").navigation.back();
    await nodeContext(host, "menu").navigation.emit("inspect");

    expect(host.events).toEqual(["mount:menu"]);
    const snapshot = runtime.snapshot();
    expect(snapshot).toMatchObject({
      status: "running",
      policy: "report",
      currentNodeId: "menu",
      backStack: [],
    });
    expect(snapshot.recentSignals).toEqual([
      expect.objectContaining({ nodeId: "menu", signal: "start", targetNodeId: "lobby" }),
      expect.objectContaining({ nodeId: "menu", signal: "inspect", targetNodeId: "archive" }),
    ]);
    expect(snapshot.reports).toEqual([
      expect.objectContaining({ kind: "signal", signal: "start", targetNodeId: "lobby" }),
      { kind: "back", nodeId: "menu", at: "2026-09-28T00:00:00.000Z" },
      expect.objectContaining({ kind: "signal", nodeId: "menu", signal: "inspect", edgeId: "inspect-archive", targetNodeId: "archive", mode: "push" }),
    ]);
  });

  it("still rejects undeclared Signals under the report policy and records the error", async () => {
    const { runtime, host } = createRuntime({ policy: "report" });
    await runtime.start();

    await expect(
      nodeContext(host, "menu").navigation.emit("missing"),
    ).rejects.toMatchObject({ code: "unknown-signal" });
    expect(runtime.snapshot().errors).toEqual([
      expect.objectContaining({ nodeId: "menu", code: "unknown-signal" }),
    ]);
  });

  it("starts at a chosen Node with validated preview State", async () => {
    const { runtime, host } = createRuntime({
      startNodeId: "archive",
      previewState: { hasKey: true },
    });
    await runtime.start();

    expect(host.events).toEqual(["mount:archive"]);
    expect(runtime.snapshot().state).toEqual({
      hasKey: true,
      clues: [],
      profile: { name: "" },
    });
    expect(() => createRuntime({ previewState: { unknown: 1 } })).toThrowError(
      expect.objectContaining({ code: "unknown-state-key" }),
    );
    expect(() => createRuntime({ startNodeId: "nowhere" })).toThrowError(
      expect.objectContaining({ code: "unknown-node" }),
    );
  });

  it("records State reads and writes per surface", async () => {
    const { runtime, host } = createRuntime();
    await runtime.start();
    const menu = nodeContext(host, "menu");

    menu.state.get("hasKey");
    await menu.state.patch({ clues: ["ledger"] });

    expect(runtime.snapshot().stateAccess).toEqual({
      menu: { read: ["hasKey"], wrote: ["clues"] },
    });
    expect(() => menu.state.get("missing" as "hasKey")).toThrow();
    expect(runtime.snapshot().errors).toEqual([
      expect.objectContaining({ nodeId: "menu", code: "unknown-state-key" }),
    ]);
  });
});

function createRuntime(
  options: {
    graph?: NodeGraph;
    compiled?: CompiledNodeGraph;
    host?: FakeSurfaceHost;
    saveStore?: PlayableSaveStore;
    seenStore?: PlayableSeenStore;
    assetUrls?: Record<string, string>;
    ensureAssets?: NodeRuntimeOptions["ensureAssets"];
    onError?: (error: unknown) => void;
    policy?: NodeRuntimeOptions["policy"];
    startNodeId?: string;
    previewState?: NodeRuntimeOptions["previewState"];
    settings?: NodeRuntimeOptions["settings"];
    transcriptionProvider?: NodeRuntimeOptions["transcriptionProvider"];
  } = {},
): {
  runtime: NodeRuntime;
  host: FakeSurfaceHost;
} {
  const graph = options.graph ?? createNodeGraphFixture();
  const host = options.host ?? new FakeSurfaceHost();
  return {
    host,
    runtime: new NodeRuntime({
      graph,
      compiled: options.compiled ?? createCompiledGraph(),
      graphSignature: "fixture-v1",
      surfaceHost: host,
      saveStore: options.saveStore ?? new MemoryPlayableSaveStore(),
      ...(options.seenStore ? { seenStore: options.seenStore } : {}),
      assetUrls: options.assetUrls ?? {
        background: "asset://background",
        theme: "asset://theme",
      },
      ensureAssets: options.ensureAssets,
      now: () => new Date("2026-09-28T00:00:00.000Z"),
      onError: options.onError,
      policy: options.policy,
      startNodeId: options.startNodeId,
      previewState: options.previewState,
      settings: options.settings,
      transcriptionProvider: options.transcriptionProvider,
    }),
  };
}

function createCompiledGraph(): CompiledNodeGraph {
  const surface = (id: string): CompiledPlayableSurface => ({
    id,
    html: "",
    css: "",
    javascript: "export function mount() {}",
    inputs: [],
  });
  return {
    version: 1,
    nodes: {
      menu: surface("menu"),
      lobby: surface("lobby"),
      archive: surface("archive"),
    },
  };
}

/** The fixture with the menu's archive entry as a navigation Signal instead of a step in the story. */
function createGraphWithArchiveAside(): NodeGraph {
  const graph = createNodeGraphFixture();
  const inspect = graph.nodes.find((node) => node.id === "menu")!.signals.find((signal) => signal.id === "inspect")!;
  inspect.role = "navigation";
  return graph;
}

function nodeContext(host: FakeSurfaceHost, id: string): NodeContext {
  const entry = [...host.nodeContexts]
    .reverse()
    .find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Node "${id}" was not mounted.`);
  return entry.context;
}

function createSave(overrides: Partial<PlayableSave> = {}): PlayableSave {
  return {
    version: 1,
    graphVersion: 1,
    graphSignature: "fixture-v1",
    savedAt: "2026-09-27T00:00:00.000Z",
    currentNodeId: "menu",
    backStack: [],
    state: createNodeGraphFixture().initialState,
    ...overrides,
  };
}
