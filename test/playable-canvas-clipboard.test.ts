import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { createPlayableClipboard, duplicatePlayableSelection } from "../src/renderer/playable-canvas-clipboard.js";
import { createFlowNode, nodeSourcePaths, type PlayableFlowNode } from "../src/renderer/playable-flow.js";
import type { PlayableNode } from "../src/shared/playable-nodes.js";

const node = (id: string, x: number, selected = true): PlayableFlowNode => {
  const playable: PlayableNode = {
    id,
    title: id,
    source: nodeSourcePaths(id),
    assets: ["video"],
    signals: [{ id: "next", label: "Next" }],
  };
  return { ...createFlowNode(playable, { x, y: 20 }), selected };
};

describe("Playable canvas clipboard", () => {
  it("copies selected nodes, their sources, and only internal edges", () => {
    const first = node("first", 0);
    const second = node("second", 320);
    const outside = node("outside", 640, false);
    const edges: Edge[] = [
      { id: "inside", source: "first", sourceHandle: "next", target: "second" },
      { id: "outside", source: "second", sourceHandle: "next", target: "outside" },
    ];
    const clipboard = createPlayableClipboard([first, second, outside], edges, {
      first: { [first.data.node.source.html]: "first html" },
      second: { [second.data.node.source.javascript]: "second js" },
    });

    expect(clipboard.nodes.map((item) => item.node.id)).toEqual(["first", "second"]);
    expect(clipboard.edges.map((edge) => edge.id)).toEqual(["inside"]);
    expect(clipboard.nodes[0]!.sources[first.data.node.source.html]).toBe("first html");
  });

  it("remaps node ids, source paths, positions, and internal edges on paste", () => {
    const first = node("first", 0);
    const second = node("second", 320);
    const clipboard = createPlayableClipboard(
      [first, second],
      [{ id: "inside", source: "first", sourceHandle: "next", target: "second" }],
      {
        first: { [first.data.node.source.html]: "first html" },
        second: { [second.data.node.source.javascript]: "second js" },
      },
    );
    const duplicated = duplicatePlayableSelection(
      clipboard,
      { x: 100, y: 200 },
      new Set(["first", "second"]),
      new Set(["inside"]),
    );

    expect(duplicated.nodes.map((item) => item.node.id)).toEqual(["first-2", "second-2"]);
    expect(duplicated.nodes.map((item) => item.position)).toEqual([
      { x: 100, y: 200 },
      { x: 420, y: 200 },
    ]);
    expect(duplicated.nodes[0]!.node.source.html).toBe("nodes/first-2/index.html");
    expect(duplicated.nodes[0]!.sources).toEqual({ "nodes/first-2/index.html": "first html" });
    expect(duplicated.edges).toEqual([
      expect.objectContaining({ id: "first-2-next", source: "first-2", target: "second-2" }),
    ]);
  });
});
