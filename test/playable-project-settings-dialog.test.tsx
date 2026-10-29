// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayableProjectSettingsDialog } from "../src/renderer/playable-project-settings-dialog.js";
import { DEFAULT_PLAYABLE_BACKDROP_EFFECTS } from "../src/shared/playable-backdrop-effects.js";
import { createNodeGraphFixture } from "./playable-fixture.js";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Playable project settings dialog", () => {
  it.each([
    ["Vignette", 0],
    ["Grain texture", 1],
  ])("can turn %s off and back on", async (_name, index) => {
    await act(async () =>
      root.render(
        <PlayableProjectSettingsDialog
          project={{ name: "Test project" } as never}
          graph={createNodeGraphFixture()}
          backdropEffects={DEFAULT_PLAYABLE_BACKDROP_EFFECTS}
          exporting={false}
          canExport
          onSave={vi.fn(async () => {})}
          onExport={vi.fn(async () => {})}
          onClose={vi.fn()}
        />,
      ),
    );
    const input = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )[Number(index)];
    expect(input).not.toBeNull();

    await act(async () => {
      input!.click();
    });
    expect(input!.checked).toBe(false);
    await act(async () => {
      input!.click();
    });
    expect(input!.checked).toBe(true);
  });

  it.each(["editable", "pico-web", "pico-apk"] as const)(
    "exports the selected %s format",
    async (format) => {
    const onExport = vi.fn(async () => {});
    await act(async () =>
      root.render(
        <PlayableProjectSettingsDialog
          project={{ name: "Test project" } as never}
          graph={createNodeGraphFixture()}
          backdropEffects={DEFAULT_PLAYABLE_BACKDROP_EFFECTS}
          exporting={false}
          canExport
          onSave={vi.fn(async () => {})}
          onExport={onExport}
          onClose={vi.fn()}
        />,
      ),
    );
    const option = container.querySelector<HTMLInputElement>(
      `input[type="radio"][value="${format}"]`,
    );
    expect(option).not.toBeNull();

    await act(async () => {
      option!.click();
      container.querySelector<HTMLButtonElement>(".project-settings-browser")!.click();
    });

    expect(onExport).toHaveBeenCalledWith(format);
    },
  );
});
