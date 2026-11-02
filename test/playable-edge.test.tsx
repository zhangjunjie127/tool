import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Position, type EdgeProps } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { PlayableEdge, type PlayableEdgeData } from "../src/renderer/playable-edge.js";

function renderEdge(data: PlayableEdgeData): string {
  return renderToStaticMarkup(
    createElement(PlayableEdge, {
      id: "edge-1",
      source: "source",
      target: "target",
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 50,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data,
    } as EdgeProps & { data: PlayableEdgeData }),
  );
}

describe("playable edge flow", () => {
  it("shows the moving highlight only for selected confirmed connections", () => {
    expect(renderEdge({ nodeSelected: true, provisional: false })).toContain(
      "playable-edge-flow-highlight",
    );
    expect(renderEdge({ nodeSelected: true, provisional: true })).not.toContain(
      "playable-edge-flow-highlight",
    );
    expect(renderEdge({ nodeSelected: false, provisional: false })).not.toContain(
      "playable-edge-flow-highlight",
    );
  });
});
