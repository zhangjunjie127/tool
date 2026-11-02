import { describe, expect, it } from "vitest";
import {
  playableEdgeForSignal,
  playableNodeById,
  playableOutgoingEdges,
  withPlayableEntry,
} from "../src/shared/playable-graph.js";
import { PLAYABLE_GRAPH_SCHEMA } from "../src/shared/playable-graph-schema.js";
import {
  isNodeGraph,
  validateNodeGraph,
} from "../src/shared/playable-graph-validation.js";
import type { NodeGraph } from "../src/shared/playable-nodes.js";
import {
  createNodeGraphFixture,
  PLAYABLE_FIXTURE_FILES,
} from "./playable-fixture.js";

describe("Node Graph contract", () => {
  it("exports a standalone JSON Schema and accepts a valid graph", () => {
    const graph = createNodeGraphFixture();

    expect(PLAYABLE_GRAPH_SCHEMA.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
    expect(isNodeGraph(graph)).toBe(true);
  });

  it("rejects malformed graph fields before cross-reference validation", () => {
    const graph = createNodeGraphFixture() as NodeGraph & {
      unexpected?: boolean;
    };
    graph.unexpected = true;
    graph.nodes[0]!.source.html = "C:outside.html";
    graph.edges[0]!.mode = "overlay" as "replace";

    const result = validateNodeGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.issues.every((item) => item.code === "schema")).toBe(true);
    expect(result.issues.some((item) => item.path === "/unexpected")).toBe(
      true,
    );
    expect(
      result.issues.some((item) => item.path.includes("/source/html")),
    ).toBe(true);
    expect(result.issues.some((item) => item.path.includes("/mode"))).toBe(
      true,
    );
  });

  it("accepts Variable descriptions and Exit conditions for display", () => {
    const graph = createNodeGraphFixture();
    graph.initialState = { trust: 0 };
    graph.variables = { trust: "How much the guard trusts the player" };
    graph.nodes[0]!.signals[0]!.when = "if trust is 3 or more";

    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
  });

  it("accepts the optional video-end auto-advance Scene setting", () => {
    const graph = createNodeGraphFixture();
    graph.nodes[0]!.videoEndAutoAdvance = true;

    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
  });

  it("accepts one game-wide settings button with an image Asset", () => {
    const graph = createNodeGraphFixture();
    graph.settingsButton = {
      x: 0.04,
      y: 0.08,
      size: 84,
      iconAssetId: "background",
    };

    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
  });

  it("accepts one game-wide font family", () => {
    const graph = createNodeGraphFixture();
    graph.globalFontFamily = "Example UI";

    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
  });

  it("rejects a settings button size outside the shared function-button range", () => {
    const graph = createNodeGraphFixture();
    graph.settingsButton = { x: 0.04, y: 0.08, size: 200 };

    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/settingsButton/size",
      }),
    );
  });

  it("rejects a settings button icon that is missing or not an image", () => {
    const graph = createNodeGraphFixture();
    graph.settingsButton = { x: 0.04, y: 0.08, iconAssetId: "theme" };

    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-settings-button-asset",
        path: "/settingsButton/iconAssetId",
      }),
    );
    graph.settingsButton.iconAssetId = "missing";
    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-settings-button-asset",
        path: "/settingsButton/iconAssetId",
      }),
    );
  });

  it("rejects settings button coordinates outside the viewport", () => {
    const graph = createNodeGraphFixture();
    graph.settingsButton = { x: 1.1, y: 0.08 };

    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/settingsButton/x",
      }),
    );
  });

  it("accepts a return button with an image Asset", () => {
    const graph = createNodeGraphFixture();
    graph.returnButton = {
      x: 0.96,
      y: 0.05,
      size: 48,
      iconAssetId: "background",
    };

    expect(validateNodeGraph(graph)).toEqual({ ok: true, issues: [] });
  });

  it("rejects a return button icon that is missing or not an image", () => {
    const graph = createNodeGraphFixture();
    graph.returnButton = {
      x: 0.96,
      y: 0.05,
      size: 42,
      iconAssetId: "theme",
    };

    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-return-button-asset",
        path: "/returnButton/iconAssetId",
      }),
    );
    graph.returnButton.iconAssetId = "missing";
    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-return-button-asset",
        path: "/returnButton/iconAssetId",
      }),
    );
  });

  it("accepts a game-wide button sound that references an audio Asset", () => {
    const graph = createNodeGraphFixture();

    expect(
      validateNodeGraph({
        ...graph,
        buttonSoundAssetId: "theme",
      }),
    ).toEqual({ ok: true, issues: [] });
  });

  it("rejects a game-wide button sound that is missing or not audio", () => {
    const graph = createNodeGraphFixture();

    expect(
      validateNodeGraph({
        ...graph,
        buttonSoundAssetId: "background",
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: "invalid-button-sound-asset",
        path: "/buttonSoundAssetId",
      }),
    );
    expect(
      validateNodeGraph({
        ...graph,
        buttonSoundAssetId: "missing",
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: "invalid-button-sound-asset",
        path: "/buttonSoundAssetId",
      }),
    );
  });

  it("rejects a return button outside the viewport or outside its size range", () => {
    const graph = createNodeGraphFixture();
    graph.returnButton = { x: 1.1, y: 0.05, size: 42 };

    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/returnButton/x",
      }),
    );
    graph.returnButton = { x: 0.96, y: 0.05, size: 200 };
    expect(validateNodeGraph(graph).issues).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/returnButton/size",
      }),
    );
  });

  it("rejects descriptions of Variables with no starting value", () => {
    const graph = createNodeGraphFixture();
    graph.initialState = {};
    graph.variables = { "a/b": "Missing" };

    const result = validateNodeGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "unknown-variable", path: "/variables/a~1b" }),
    );
  });

  it("rejects non-string Variable descriptions and Exit conditions", () => {
    const graph = createNodeGraphFixture() as unknown as {
      variables: unknown;
      nodes: { signals: { when?: unknown }[] }[];
    };
    graph.variables = { trust: 3 };
    graph.nodes[0]!.signals[0]!.when = 1;

    const result = validateNodeGraph(graph);

    expect(result.issues.every((item) => item.code === "schema")).toBe(true);
    expect(result.issues.some((item) => item.path.startsWith("/variables"))).toBe(true);
    expect(result.issues.some((item) => item.path.endsWith("/when"))).toBe(true);
  });

  it("reports duplicate IDs and invalid graph references", () => {
    const graph = createNodeGraphFixture();
    graph.nodes.push(structuredClone(graph.nodes[0]!));
    graph.nodes[0]!.signals.push({ id: "start", label: "Duplicate start" });
    graph.edges.push({
      id: "start-game",
      source: { nodeId: "missing", signal: "unknown" },
      targetNodeId: "missing",
      mode: "replace",
    });
    graph.edges.push({
      id: "lobby-broken",
      source: { nodeId: "lobby", signal: "missing" },
      targetNodeId: "menu",
      mode: "replace",
    });

    const result = validateNodeGraph(graph);

    expect(
      result.issues.filter((item) => item.code === "duplicate-id").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      result.issues.some(
        (item) =>
          item.path === `/edges/${graph.edges.length - 1}/source/signal` && item.code === "missing-signal",
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (item) =>
          item.path.endsWith("/source/nodeId") && item.code === "missing-node",
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (item) =>
          item.path.endsWith("/targetNodeId") && item.code === "missing-node",
      ),
    ).toBe(true);
  });

  it("validates signal routes, asset dependencies, and referenced files", () => {
    const graph = createNodeGraphFixture();
    graph.nodes[0]!.assets.push("missing-asset");
    graph.nodes[1]!.assets.push("missing-lobby-asset");
    graph.edges[0]!.source.signal = "undeclared";
    graph.edges.push({
      id: "duplicate-route",
      source: { nodeId: "menu", signal: "inspect" },
      targetNodeId: "lobby",
      mode: "replace",
    });
    const files = new Set([
      "nodes/menu/index.html",
      "nodes/menu/style.css",
      "nodes/menu/node.js",
      "nodes/lobby/index.html",
      "nodes/lobby/style.css",
      "nodes/lobby/node.js",
      "nodes/archive/index.html",
      "nodes/archive/style.css",
    ]);

    const result = validateNodeGraph(graph, { availableFiles: files });

    expect(result.issues.some((item) => item.code === "missing-signal")).toBe(
      true,
    );
    expect(result.issues.some((item) => item.code === "duplicate-route")).toBe(
      true,
    );
    expect(
      result.issues.filter((item) => item.code === "missing-asset"),
    ).toHaveLength(2);
    expect(
      result.issues.some(
        (item) =>
          item.code === "missing-file" &&
          item.message.includes("nodes/archive/node.js"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (item) =>
          item.code === "missing-file" &&
          item.message.includes("assets/background.webp"),
      ),
    ).toBe(true);
  });

  it("allows unconnected signals in drafts but requires them for publish", () => {
    const graph = createNodeGraphFixture();
    graph.edges = graph.edges.filter(
      (edge) => edge.source.signal !== "inspect",
    );

    expect(validateNodeGraph(graph, { mode: "draft" }).ok).toBe(true);
    expect(
      validateNodeGraph(graph, {
        mode: "publish",
        availableFiles: PLAYABLE_FIXTURE_FILES,
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: "unconnected-signal",
        message: 'Signal "menu.inspect" must be connected before publishing.',
      }),
    );
  });

  it("publishes with a navigation Signal that goes nowhere, which a Node can show disabled", () => {
    const graph = createNodeGraphFixture();
    graph.edges = graph.edges.filter((edge) => edge.source.signal !== "home");

    expect(validateNodeGraph(graph, { mode: "publish", availableFiles: PLAYABLE_FIXTURE_FILES }).issues).toEqual([]);
  });

  it("accepts a project with no Nodes as a draft but not for publish", () => {
    const graph = { ...createNodeGraphFixture(), nodes: [], edges: [], entryNodeId: "start" };

    expect(validateNodeGraph(graph, { mode: "draft" })).toEqual({ ok: true, issues: [] });
    expect(
      validateNodeGraph(graph, { mode: "publish", availableFiles: PLAYABLE_FIXTURE_FILES }).issues,
    ).toEqual([expect.objectContaining({ code: "missing-node", path: "/nodes" })]);
  });

  it("makes the first Node the Start when the Entry Node names none of them", () => {
    const graph = createNodeGraphFixture();

    expect(withPlayableEntry(graph)).toBe(graph);
    expect(withPlayableEntry({ ...graph, entryNodeId: "gone" }).entryNodeId).toBe(graph.nodes[0]!.id);
    const empty = { ...graph, nodes: [], entryNodeId: "gone" };
    expect(withPlayableEntry(empty)).toBe(empty);
  });

  it("requires a workspace file inventory for publish validation", () => {
    const graph = createNodeGraphFixture();
    const options = { mode: "publish" } as unknown as Parameters<
      typeof validateNodeGraph
    >[1];

    expect(validateNodeGraph(graph, options).issues).toContainEqual(
      expect.objectContaining({ code: "file-list-required" }),
    );
  });

  it("accepts only navigation as a Signal role", () => {
    const graph = createNodeGraphFixture();
    expect(graph.nodes.some((node) => node.signals.some((signal) => signal.role === "navigation"))).toBe(true);
    expect(validateNodeGraph(graph).ok).toBe(true);

    graph.nodes[0]!.signals[0]!.role = "story" as "navigation";
    const result = validateNodeGraph(graph);
    expect(result.ok).toBe(false);
    expect(result.issues.some((item) => item.code === "schema" && item.path.includes("/role"))).toBe(true);
  });

  it("has no layer over every Node: a graph with a shell is rejected", () => {
    const graph = {
      ...createNodeGraphFixture(),
      shell: { source: { html: "shell/index.html" }, assets: [], signals: [] },
    };

    expect(isNodeGraph(graph)).toBe(false);
    expect(validateNodeGraph(graph).issues).toContainEqual(expect.objectContaining({ code: "schema" }));
  });

  it("rejects graphs above the runtime resource limits", () => {
    const graph = createNodeGraphFixture();
    graph.nodes = Array.from({ length: 501 }, (_, index) => ({
      ...structuredClone(graph.nodes[0]!),
      id: `node-${index}`,
    }));

    const result = validateNodeGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "schema", path: "/nodes" }));
  });

  it("provides side-effect-free graph lookups", () => {
    const graph = createNodeGraphFixture();

    expect(playableNodeById(graph, "menu")?.title).toBe("Main menu");
    expect(playableNodeById(graph, "missing")).toBeUndefined();
    expect(playableEdgeForSignal(graph, "menu", "inspect")?.mode).toBe("push");
    expect(playableOutgoingEdges(graph, "menu")).toHaveLength(2);
  });
});
