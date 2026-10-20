import type { NodeCodebase } from "../shared/playable-codebase.js";

export function playableEditorHistoryKey(snapshot: NodeCodebase): string {
  const { viewport: _gameViewport, ...graph } = snapshot.graph;
  const {
    viewport: _canvasViewport,
    view: _view,
    ...layout
  } = snapshot.editorLayout;
  return JSON.stringify({ graph, layout });
}

export function samePlayableEditorHistoryState(
  left: NodeCodebase,
  right: NodeCodebase,
): boolean {
  return playableEditorHistoryKey(left) === playableEditorHistoryKey(right);
}

export function preservePlayableEditorView(
  restored: NodeCodebase,
  current: NodeCodebase,
): NodeCodebase {
  return {
    graph: { ...restored.graph, viewport: current.graph.viewport },
    editorLayout: {
      ...restored.editorLayout,
      viewport: current.editorLayout.viewport,
      view: current.editorLayout.view,
    },
  };
}
