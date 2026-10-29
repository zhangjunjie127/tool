// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayableVrViewer } from "../src/renderer/playable-vr-viewer.js";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let xrDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  xrDescriptor = Object.getOwnPropertyDescriptor(navigator, "xr");
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: { isSessionSupported: vi.fn().mockResolvedValue(false) },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (xrDescriptor)
    Object.defineProperty(navigator, "xr", xrDescriptor);
  else
    Reflect.deleteProperty(navigator, "xr");
  vi.unstubAllGlobals();
});

it("explains why VR cannot start when immersive VR is unsupported", async () => {
  await act(async () =>
    root.render(
      <PlayableVrViewer
        video={new Blob(["video"], { type: "video/mp4" })}
        currentTime={0}
        buttons={[]}
        viewport={{ width: 1920, height: 1080 }}
        onActivate={vi.fn()}
        onPress={vi.fn()}
      />,
    ),
  );
  await act(async () => Promise.resolve());

  const button = container.querySelector("button")!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "VR",
  );
});
