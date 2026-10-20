export type PlayableEditorClipboardAction = "copy" | "paste";

export function routePlayableClipboardShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "preventDefault"
  >,
  sceneEditorOpen: boolean,
  onScene: (action: PlayableEditorClipboardAction) => void,
  onCanvas: (action: PlayableEditorClipboardAction) => boolean,
): boolean {
  if (event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey))
    return false;
  const key = event.key.toLowerCase();
  if (key !== "c" && key !== "v") return false;

  const action = key === "c" ? "copy" : "paste";
  if (sceneEditorOpen) {
    event.preventDefault();
    onScene(action);
    return true;
  }
  return onCanvas(action);
}
