// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  StoryTreePaneMinimumWidthContext,
  StoryTreePanes,
} from "../src/renderer/story-tree-panes.js";

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let width: number;
let measure: () => void;
const disconnect = vi.fn();
const minimumWidthChanged = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  minimumWidthChanged.mockClear();
  width = 601;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      left: 0,
      right: width,
      width,
      top: 0,
      bottom: 800,
      height: 800,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () =>
    root.render(
      <StoryTreePaneMinimumWidthContext.Provider value={minimumWidthChanged}>
        <StoryTreePanes>
          <section>
            <input defaultValue="Existing chapter" />
          </section>
          <section>Story flow</section>
        </StoryTreePanes>
      </StoryTreePaneMinimumWidthContext.Provider>,
    ),
  );
}

const handle = () => host.querySelector<HTMLElement>('[role="separator"]')!;
const chapterWidth = () => Number(handle().getAttribute("aria-valuenow"));

it("keeps the default 2:3 split and supports keyboard resizing without remounting content", async () => {
  await render();
  expect(chapterWidth()).toBe(240);
  expect(minimumWidthChanged).toHaveBeenLastCalledWith(494);
  const input = host.querySelector("input")!;
  input.value = "Unsaved name";
  await act(async () =>
    handle().dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(chapterWidth()).toBe(256);
  expect(minimumWidthChanged).toHaveBeenLastCalledWith(510);
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("Unsaved name");
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(chapterWidth()).toBe(256);
  await act(async () =>
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(chapterWidth()).toBe(240);
});

it("clamps left-button drags, cleans the shield on cancellation, and ignores other buttons", async () => {
  await render();
  let captured = false;
  handle().setPointerCapture = () => {
    captured = true;
  };
  handle().hasPointerCapture = () => captured;
  for (const button of [2, 0]) {
    await act(async () =>
      handle().dispatchEvent(
        new PointerEvent("pointerdown", {
          isPrimary: true,
          button,
          clientX: 240,
          pointerId: 1,
          bubbles: true,
        }),
      ),
    );
    await act(async () =>
      handle().dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 1000,
          pointerId: 1,
          bubbles: true,
        }),
      ),
    );
    expect(chapterWidth()).toBe(button === 0 ? 348 : 240);
  }
  expect(document.querySelector(".workspace-resize-shield")).not.toBeNull();
  await act(async () =>
    handle().dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: -1000,
        pointerId: 1,
        bubbles: true,
      }),
    ),
  );
  expect(chapterWidth()).toBe(168);
  await act(async () =>
    handle().dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
    ),
  );
  expect(document.querySelector(".workspace-resize-shield")).toBeNull();
});

it("keeps the chapter width fixed when the story/canvas boundary moves", async () => {
  await render();
  expect(chapterWidth()).toBe(240);
  await act(async () => {
    width = 801;
    measure();
  });
  expect(chapterWidth()).toBe(240);
  await act(async () => {
    width = 551;
    measure();
  });
  expect(chapterWidth()).toBe(240);
});

it("migrates the saved ratio once and restores the fixed width after a narrow viewport", async () => {
  localStorage.setItem("ohmygame-story-chapters-ratio", "0.55");
  await render();
  expect(chapterWidth()).toBe(330);
  await act(async () => {
    width = 421;
    measure();
  });
  expect(chapterWidth()).toBe(168);
  await act(async () => {
    width = 801;
    measure();
  });
  expect(chapterWidth()).toBe(330);
  expect(localStorage.getItem("ohmygame-story-chapters-ratio")).toBe("0.55");
  expect(localStorage.getItem("ohmygame-story-chapters-width")).toBe("330");
});
