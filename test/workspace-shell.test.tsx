// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAgentPane, WorkspaceShell } from "../src/renderer/workspace-shell.js";
import { StoryTreePanes } from "../src/renderer/story-tree-panes.js";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, right: 1200, width: 1200, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON() {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(layout: "left" | "right", collapsed = false, withSidePanel = false, sidePanelVisible = true) {
  await act(async () => root.render(<WorkspaceShell chatLayout={layout} agentCollapsed={collapsed}
    agentSidePanelVisible={sidePanelVisible}
    onHome={() => {}} onExpandAgent={() => {}}
    agentSidePanel={withSidePanel ? <aside aria-label="Story tree">Story tree</aside> : undefined}
    agent={<WorkspaceAgentPane actions={null}><input aria-label="Draft" defaultValue="Saved draft" /></WorkspaceAgentPane>}>
    <section className="viewer-pane">Preview</section>
  </WorkspaceShell>));
}
const shell = () => container.querySelector<HTMLElement>("main")!;
const separator = () => container.querySelector<HTMLElement>('[role="separator"]')!;
const storySeparator = () => container.querySelector<HTMLElement>(".workspace-story-resizer")!;

async function drag(handle: HTMLElement, delta: number, button = 0) {
  let captured = false;
  handle.setPointerCapture = () => { captured = true; };
  handle.hasPointerCapture = () => captured;
  handle.releasePointerCapture = () => { captured = false; };
  await act(async () => handle.dispatchEvent(new PointerEvent("pointerdown", { clientX: 500, isPrimary: true, button, pointerId: 1, bubbles: true })));
  await act(async () => handle.dispatchEvent(new PointerEvent("pointermove", { clientX: 500 + delta, pointerId: 1, bubbles: true })));
  await act(async () => handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true })));
}

describe("shared workspace layout", () => {
  it("stops the outer divider before it would squeeze the independently sized chapters pane", async () => {
    localStorage.setItem("ohmygame-story-panel-width", "500");
    const defaultBounds = document.body.getBoundingClientRect();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return this.classList.contains("story-tree-panes")
        ? { ...defaultBounds, width: 499, right: 499 }
        : defaultBounds;
    });
    await act(async () => root.render(
      <WorkspaceShell chatLayout="left" agentCollapsed={false}
        onHome={() => {}} onExpandAgent={() => {}}
        agent={<WorkspaceAgentPane actions={null}>Chat</WorkspaceAgentPane>}
        agentSidePanel={<StoryTreePanes><section>Chapters</section><section>Story</section></StoryTreePanes>}>
        <section className="viewer-pane">Canvas</section>
      </WorkspaceShell>,
    ));
    expect(storySeparator().getAttribute("aria-valuemin")).toBe("454");
    await drag(storySeparator(), -1000);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("454");
    expect(separator().getAttribute("aria-valuenow")).toBe("395");
  });

  it.each(["left", "right"] as const)("drags the story/canvas divider with %s chat, retaining canvas space", async layout => {
    await render(layout, false, true);
    const initial = Number(storySeparator().getAttribute("aria-valuenow"));
    expect(initial).toBe(456);
    await drag(storySeparator(), layout === "left" ? 500 : -500);
    expect(Number(storySeparator().getAttribute("aria-valuenow"))).toBe(465);
    expect(separator().getAttribute("aria-valuenow")).toBe("430");
    expect(localStorage.getItem("ohmygame-story-panel-width")).toBe("465");
    expect(document.querySelector(".workspace-resize-shield")).toBeNull();
    await drag(storySeparator(), layout === "left" ? -500 : 500);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("420");
  });

  it("ignores right-button drags and resets the story width on double click", async () => {
    await render("left", true, true);
    await drag(storySeparator(), 200, 2);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("456");
    await drag(storySeparator(), 200);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("656");
    await act(async () => storySeparator().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("456");
    expect(localStorage.getItem("ohmygame-story-panel-width")).toBeNull();
  });

  it("restores the story width and accounts for it when resizing chat", async () => {
    localStorage.setItem("ohmygame-story-panel-width", "500");
    await render("left", false, true);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("500");
    expect(separator().getAttribute("aria-valuemax")).toBe("395");
    await render("left", false, true, false);
    expect(storySeparator()).toBeNull();
    expect(separator().getAttribute("aria-valuemax")).toBe("780");
  });

  it("clamps saved panel widths on smaller windows", async () => {
    localStorage.setItem("ohmygame-story-panel-width", "900");
    await render("left", false, true);
    expect(storySeparator().getAttribute("aria-valuenow")).toBe("575");
    expect(separator().getAttribute("aria-valuenow")).toBe("320");
    expect(localStorage.getItem("ohmygame-story-panel-width")).toBe("900");
  });

  it.each(["left", "right"] as const)("keeps the story tree beside the %s chat pane", async layout => {
    await render(layout, false, true);
    expect(shell().classList.contains("workspace-shell-has-agent-side-panel")).toBe(true);
    expect(container.querySelector(".workspace-agent-side-panel [aria-label='Story tree']")).not.toBeNull();
    expect(container.querySelector(".workspace-agent-side-panel")?.nextElementSibling?.classList.contains("viewer-pane")).toBe(true);
  });

  it.each(["left", "right"] as const)("resizes %s chat in the arrow's physical direction and restores its width in another workspace", async layout => {
    await render(layout);
    await act(async () => separator().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    const width = layout === "left" ? 446 : 414;
    expect(separator().getAttribute("aria-valuenow")).toBe(String(width));
    expect(shell().style.getPropertyValue("--agent-width")).toBe(`${width}px`);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(layout);
    expect(separator().getAttribute("aria-valuenow")).toBe(String(width));
    await act(async () => separator().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(separator().getAttribute("aria-valuenow")).toBe("430");
  });

  it("clamps pointer drags, saves on release, and removes the resize shield", async () => {
    await render("left");
    const handle = separator();
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = vi.fn();
    await act(async () => handle.dispatchEvent(new PointerEvent("pointerdown", { isPrimary: true, button: 0, pointerId: 1, bubbles: true })));
    expect(container.querySelector(".workspace-resize-shield")).not.toBeNull();
    await act(async () => handle.dispatchEvent(new PointerEvent("pointermove", { clientX: 1100, pointerId: 1, bubbles: true })));
    await act(async () => handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true })));
    expect(handle.getAttribute("aria-valuenow")).toBe("780");
    expect(localStorage.getItem("ohmygame-agent-width")).toBe("780");
    expect(container.querySelector(".workspace-resize-shield")).toBeNull();
    await act(async () => handle.dispatchEvent(new PointerEvent("pointerdown", { isPrimary: true, button: 0, pointerId: 2, bubbles: true })));
    await act(async () => handle.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, pointerId: 2, bubbles: true })));
    await act(async () => handle.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 2, bubbles: true })));
    expect(handle.getAttribute("aria-valuenow")).toBe("320");
  });

  it("retains the chat's draft across collapse and removes the hidden splitter from keyboard navigation", async () => {
    await render("left");
    const input = container.querySelector<HTMLInputElement>("input")!;
    input.value = "Unsent changes";
    await render("left", true);
    expect(separator().tabIndex).toBe(-1);
    expect(separator().getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll(".workspace-navigation-actions button")).toHaveLength(2);
    await render("left");
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Unsent changes");
    expect(separator().tabIndex).toBe(0);
  });
});
