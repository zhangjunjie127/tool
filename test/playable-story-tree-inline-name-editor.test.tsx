// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StoryTreeInlineNameEditor } from "../src/renderer/playable-story-tree-inline-name-editor.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("replaces the displayed name with an input and lets Escape cancel", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSave = vi.fn();

  await act(async () => {
    root.render(
      createElement(StoryTreeInlineNameEditor, {
        value: "Scene 1",
        label: "Rename scene",
        disabled: false,
        onSave,
      }),
    );
  });

  expect(
    host.querySelector(".story-tree-inline-name-display")?.textContent,
  ).toBe("Scene 1");

  const editButton = host.querySelector(
    'button[aria-label="Rename scene"]',
  ) as HTMLButtonElement;
  await act(async () => editButton.click());

  const input = host.querySelector(
    'input[aria-label="Rename scene"]',
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.parentElement?.classList.contains("is-editing")).toBe(true);

  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });

  expect(host.querySelector("input")).toBeNull();
  expect(host.textContent).toContain("Scene 1");
  expect(onSave).not.toHaveBeenCalled();

  await act(async () => root.unmount());
  host.remove();
});
