import { expect, it } from "vitest";
import { createStarterCodebaseWithScene } from "./playable-fixture.js";
import {
  preservePlayableEditorView,
  samePlayableEditorHistoryState,
} from "../src/renderer/playable-editor-history.js";

it("excludes canvas view and project dimensions from scene edit history", () => {
  const original = createStarterCodebaseWithScene("History", {
    width: 1280,
    height: 720,
  });
  const viewOnly = structuredClone(original);
  viewOnly.editorLayout.viewport = { x: 100, y: -40, zoom: 1.4 };
  viewOnly.editorLayout.view = "code";
  viewOnly.graph.viewport = { width: 1920, height: 1080 };
  expect(samePlayableEditorHistoryState(original, viewOnly)).toBe(true);

  const sceneEdit = structuredClone(original);
  sceneEdit.graph.nodes[0]!.title = "Renamed";
  expect(samePlayableEditorHistoryState(original, sceneEdit)).toBe(false);

  const layoutEdit = structuredClone(original);
  layoutEdit.editorLayout.nodes.start!.x += 30;
  expect(samePlayableEditorHistoryState(original, layoutEdit)).toBe(false);
});

it("restores scene content while retaining the current canvas and game view", () => {
  const before = createStarterCodebaseWithScene("History", {
    width: 1280,
    height: 720,
  });
  const current = structuredClone(before);
  current.graph.viewport = { width: 1920, height: 1080 };
  current.editorLayout.viewport = { x: -20, y: 80, zoom: 1.7 };
  current.editorLayout.view = "code";

  const restored = preservePlayableEditorView(before, current);
  expect(restored.graph.viewport).toEqual(current.graph.viewport);
  expect(restored.editorLayout.viewport).toEqual(current.editorLayout.viewport);
  expect(restored.editorLayout.view).toBe("code");
  expect(restored.editorLayout.nodes).toEqual(before.editorLayout.nodes);
});
