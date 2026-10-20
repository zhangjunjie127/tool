// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateText } from "../src/renderer/i18n.js";
import { PlayableAffectionDialog } from "../src/renderer/playable-affection-dialog.js";
import type { PlayableAffectionConfig } from "../src/shared/playable-affection.js";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const config: PlayableAffectionConfig = {
  characters: [{ id: "affection_lan", name: "Lan", initial: 0 }],
  choices: [{
    id: "remember",
    label: "Remember it",
    characterId: "affection_lan",
    delta: 2,
    threshold: 2,
    successSignal: "closer",
    fallbackSignal: "distant",
  }],
};

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

describe("Playable affection author settings", () => {
  it("lets the author add people and choices and saves their score rules", async () => {
    const onSave = vi.fn(async () => {});
    await act(async () => root.render(
      <PlayableAffectionDialog config={config} busy={false} onSave={onSave} onClose={vi.fn()} />,
    ));
    const addButtons = container.querySelectorAll<HTMLButtonElement>(
      `button[aria-label="${translateText("Add character", "zh-CN")}"], button[aria-label="${translateText("Add choice", "zh-CN")}"]`,
    );
    await act(async () => {
      addButtons[0]!.click();
      addButtons[1]!.click();
    });
    expect(container.querySelectorAll(".playable-affection-row")).toHaveLength(2);
    expect(container.querySelectorAll(".playable-affection-choice")).toHaveLength(2);

    const change = container.querySelector<HTMLInputElement>('input[type="number"][min="-10"]')!;
    await act(async () => {
      change.value = "-2";
      change.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      characters: expect.arrayContaining([expect.objectContaining({ id: "affection_2" })]),
      choices: expect.arrayContaining([expect.objectContaining({ id: "choice_2" })]),
    }));
  });
});
