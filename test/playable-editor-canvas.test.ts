import { describe, expect, it } from "vitest";
import {
  arrangePlayableNodes,
  buildCodebase,
  nodeIdForIssuePath,
  toFlowEdge,
  toPlayableEdge,
  uniqueNodeId,
  type GraphMeta,
  type PlayableFlowNode,
} from "../src/renderer/playable-flow.js";
import type { NodeEditorLayout } from "../src/shared/playable-codebase.js";
import type { PlayableEdge, PlayableNode } from "../src/shared/playable-nodes.js";

function playableNode(id: string, signals: string[] = []): PlayableNode {
  return {
    id,
    title: id,
    source: {
      html: `nodes/${id}/index.html`,
      css: `nodes/${id}/style.css`,
      javascript: `nodes/${id}/node.js`,
    },
    assets: [],
    signals: signals.map((signal) => ({ id: signal, label: signal })),
  };
}

function flowNode(node: PlayableNode, position: { x: number; y: number }): PlayableFlowNode {
  return {
    id: node.id,
    type: "playable",
    position,
    data: { node, entry: false, ending: false, issues: [], connected: {}, failed: false },
  };
}

const META: GraphMeta = {
  version: 1,
  title: "Ash Club",
  viewport: { width: 1280, height: 720 },
  entryNodeId: "start",
  initialState: {},
  assets: {},
};

const LAYOUT: NodeEditorLayout = {
  version: 1,
  nodes: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  view: "canvas",
};

describe("playable canvas serialization", () => {
  it("arranges branches by signal order and keeps disconnected nodes after the story", () => {
    const nodes = [
      flowNode(playableNode("start", ["first", "second"]), { x: 0, y: 0 }),
      flowNode(playableNode("second", ["continue"]), { x: 0, y: 0 }),
      flowNode(playableNode("first"), { x: 0, y: 0 }),
      flowNode(playableNode("ending"), { x: 0, y: 0 }),
      flowNode(playableNode("orphan"), { x: 0, y: 0 }),
    ];
    nodes[0]!.measured = { width: 200, height: 120 };
    nodes[2]!.measured = { width: 180, height: 300 };
    const edges = [
      toFlowEdge({ id: "second-edge", source: { nodeId: "start", signal: "second" }, targetNodeId: "second", mode: "replace" }),
      toFlowEdge({ id: "first-edge", source: { nodeId: "start", signal: "first" }, targetNodeId: "first", mode: "replace" }),
      toFlowEdge({ id: "ending-edge", source: { nodeId: "second", signal: "continue" }, targetNodeId: "ending", mode: "replace" }),
    ];

    const positions = arrangePlayableNodes(nodes, edges, "start");

    expect(positions.start).toEqual({ x: 80, y: 80 });
    expect(positions.first!.y).toBeLessThan(positions.second!.y);
    expect(positions.ending!.x).toBeGreaterThan(positions.second!.x);
    expect(positions.orphan!.x).toBeGreaterThan(positions.ending!.x);
    expect(positions.second!.y).toBeGreaterThanOrEqual(positions.first!.y + 300 + 80);
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left]!;
        const b = nodes[right]!;
        const aPosition = positions[a.id]!;
        const bPosition = positions[b.id]!;
        const separated = aPosition.x + (a.measured?.width ?? 280) <= bPosition.x
          || bPosition.x + (b.measured?.width ?? 280) <= aPosition.x
          || aPosition.y + (a.measured?.height ?? 220) <= bPosition.y
          || bPosition.y + (b.measured?.height ?? 220) <= aPosition.y;
        expect(separated, `${a.id} and ${b.id} overlap`).toBe(true);
      }
    }
  });

  it("lays out cycles and disconnected components without overlapping nodes", () => {
    const nodes = [
      flowNode(playableNode("start", ["next"]), { x: 0, y: 0 }),
      flowNode(playableNode("loop", ["back"]), { x: 0, y: 0 }),
      flowNode(playableNode("isolated"), { x: 0, y: 0 }),
    ];
    nodes[0]!.measured = { width: 200, height: 200 };
    nodes[1]!.measured = { width: 200, height: 260 };
    const edges = [
      toFlowEdge({ id: "forward", source: { nodeId: "start", signal: "next" }, targetNodeId: "loop", mode: "replace" }),
      toFlowEdge({ id: "back", source: { nodeId: "loop", signal: "back" }, targetNodeId: "start", mode: "replace" }),
    ];

    const positions = arrangePlayableNodes(nodes, edges, "start");

    expect(positions.loop!.x).toBeGreaterThan(positions.start!.x);
    expect(positions.isolated!.x).toBeGreaterThan(positions.loop!.x);
  });

  it("writes the graph from canvas state with rounded positions", () => {
    const nodes = [
      flowNode(playableNode("start", ["begin"]), { x: 80.4, y: 180.6 }),
      flowNode(playableNode("carriage"), { x: 520, y: 180 }),
    ];
    const edges = [toFlowEdge({
      id: "start-begin",
      source: { nodeId: "start", signal: "begin" },
      targetNodeId: "carriage",
      mode: "replace",
    })];

    const codebase = buildCodebase(META, nodes, edges, LAYOUT, "code");

    expect(codebase.graph.title).toBe("Ash Club");
    expect(codebase.graph.nodes.map((node) => node.id)).toEqual(["start", "carriage"]);
    expect(codebase.graph.edges).toEqual([{
      id: "start-begin",
      source: { nodeId: "start", signal: "begin" },
      targetNodeId: "carriage",
      mode: "replace",
    }]);
    expect(codebase.editorLayout.nodes).toEqual({ start: { x: 80, y: 181 }, carriage: { x: 520, y: 180 } });
    expect(codebase.editorLayout.view).toBe("code");
  });

  it("round-trips both edge modes and marks push edges on the canvas", () => {
    const edge: PlayableEdge = {
      id: "start-inspect",
      source: { nodeId: "start", signal: "inspect" },
      targetNodeId: "archive",
      mode: "push",
    };

    const flowEdge = toFlowEdge(edge);

    expect(flowEdge).toMatchObject({ label: "↩ Back", className: "playable-edge-push", sourceHandle: "inspect" });
    expect(toPlayableEdge(flowEdge)).toEqual(edge);
    // A replace edge stays undecorated so only push edges read as a stack push.
    const replace = toFlowEdge({ ...edge, mode: "replace" });
    expect(replace.label).toBeUndefined();
    expect(toPlayableEdge(replace)?.mode).toBe("replace");
    // An edge dropped on a Node body has no Signal, so there is nothing to store.
    expect(toPlayableEdge({ ...flowEdge, sourceHandle: undefined })).toBeUndefined();
  });

  it("slugifies a copied Node ID and keeps it unique", () => {
    const taken = new Set(["carriage", "carriage-2"]);
    expect(uniqueNodeId("The Carriage", new Set())).toBe("the-carriage");
    expect(uniqueNodeId("carriage", taken)).toBe("carriage-3");
    expect(uniqueNodeId("../escape!", new Set())).toBe("escape");
    expect(uniqueNodeId("!!!", new Set())).toBe("node");
  });

  it("attributes a compiler issue to the Node that owns the file", () => {
    const nodes = [flowNode(playableNode("start"), { x: 0, y: 0 })];
    expect(nodeIdForIssuePath("nodes/start/node.js", nodes)).toBe("start");
    expect(nodeIdForIssuePath("nodes/start/extra/helper.js", nodes)).toBe("start");
    expect(nodeIdForIssuePath("shared/components/menu.js", nodes)).toBeUndefined();
  });
});
