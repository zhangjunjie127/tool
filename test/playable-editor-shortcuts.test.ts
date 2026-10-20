import { describe, expect, it, vi } from "vitest";
import { routePlayableClipboardShortcut } from "../src/renderer/playable-editor-shortcuts.js";

function shortcut(key: string) {
  return {
    key,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
  };
}

describe("playable editor clipboard shortcuts", () => {
  it("routes paste to scene elements instead of the storyline canvas while editing a scene", () => {
    const event = shortcut("v");
    const onScene = vi.fn();
    const onCanvas = vi.fn(() => true);

    expect(
      routePlayableClipboardShortcut(event, true, onScene, onCanvas),
    ).toBe(true);
    expect(onScene).toHaveBeenCalledWith("paste");
    expect(onCanvas).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("keeps node copy and paste on the storyline canvas when no scene is open", () => {
    const event = shortcut("v");
    const onScene = vi.fn();
    const onCanvas = vi.fn(() => true);

    expect(
      routePlayableClipboardShortcut(event, false, onScene, onCanvas),
    ).toBe(true);
    expect(onScene).not.toHaveBeenCalled();
    expect(onCanvas).toHaveBeenCalledWith("paste");
  });
});
