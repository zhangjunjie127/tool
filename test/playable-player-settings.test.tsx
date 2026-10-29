// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NodePlayerDefinition } from "../src/shared/playable-player-protocol.js";
import {
  createMemoryStorage,
  NodePlayer,
} from "../src/renderer/playable-player.js";
import { t } from "../src/renderer/i18n.js";

const definition: NodePlayerDefinition = {
  version: 1,
  graph: {
    version: 1,
    title: "Settings test",
    viewport: { width: 1280, height: 720 },
    entryNodeId: "start",
    initialState: {},
    assets: {},
    nodes: [
      {
        id: "start",
        title: "Start",
        source: {
          html: "nodes/start/index.html",
          css: "nodes/start/style.css",
          javascript: "nodes/start/node.js",
        },
        assets: [],
        signals: [],
      },
    ],
    edges: [],
  },
  graphSignature: "settings-test",
  compiled: {
    version: 1,
    nodes: {
      start: {
        id: "start",
        inputs: [],
        html: "<main>Start</main>",
        css: "",
        javascript: "",
      },
    },
  },
};

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let storage: Storage;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  storage = createMemoryStorage();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens global settings without restarting the current game session", async () => {
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
      />,
    ),
  );

  const iframe = container.querySelector<HTMLIFrameElement>("iframe")!;
  const messages: Record<string, unknown>[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: Record<string, unknown>) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });

  const init = messages.find((message) => message.kind === "putenggame:playable:init")!;
  const instanceId = init.instanceId as string;
  const snapshot = {
    status: "running",
    policy: "published",
    currentNodeId: "start",
    backStack: [],
    state: {},
    recentSignals: [],
    reports: [],
    stateAccess: {},
    errors: [],
    save: { present: false },
  };
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId,
          snapshot,
        },
      }),
    );
  });

  const open = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  await act(async () => open.click());
  expect(container.querySelector("iframe")).toBe(iframe);
  expect(
    messages.filter((message) => message.kind === "putenggame:playable:init"),
  ).toHaveLength(1);
  expect(messages.at(-1)).toMatchObject({
    kind: "putenggame:playable:settings-command",
    instanceId,
    action: "pause",
  });

  const musicEnabled = container.querySelector<HTMLInputElement>(
    '.playable-game-settings-dialog input[type="checkbox"]',
  )!;
  await act(async () => musicEnabled.click());
  expect(messages.at(-1)).toMatchObject({
    kind: "putenggame:playable:settings-command",
    instanceId,
    action: "patch",
    settings: { musicEnabled: false },
  });
  expect(container.querySelector("iframe")).toBe(iframe);

  const returnButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.includes(t("gameSettingsOverlay.return")),
  )!;
  await act(async () => returnButton.click());
  const discardButton = [...container.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes(
        t("gameSettingsOverlay.discardAndReturn"),
      ),
  )!;
  await act(async () => discardButton.click());
  expect(messages.slice(-2)).toMatchObject([
    {
      kind: "putenggame:playable:settings-command",
      instanceId,
      action: "discard",
    },
    {
      kind: "putenggame:playable:settings-command",
      instanceId,
      action: "resume",
    },
  ]);
  expect(container.querySelector("iframe")).toBe(iframe);

  const updatedDefinition: NodePlayerDefinition = {
    ...definition,
    graph: {
      ...definition.graph,
      settingsButton: { x: 0.6, y: 0.72 },
    },
  };
  await act(async () =>
    root.render(
      <NodePlayer
        definition={updatedDefinition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
      />,
    ),
  );
  expect(container.querySelector("iframe")).toBe(iframe);
  expect(
    container.querySelector<HTMLButtonElement>(
      ".playable-player-settings-trigger",
    )?.style,
  ).toMatchObject({ left: "60%", top: "72%" });
  expect(
    messages.filter((message) => message.kind === "putenggame:playable:init"),
  ).toHaveLength(1);

  const onSelectSettingsButton = vi.fn();
  const renderSettingsButtonSelection = (selected: boolean) =>
    root.render(
      <NodePlayer
        definition={updatedDefinition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
        tool="select"
        settingsButtonSelected={selected}
        onSelectSettingsButton={onSelectSettingsButton}
        onSettingsButtonPositionChange={vi.fn(async () => true)}
      />,
    );
  await act(async () =>
    renderSettingsButtonSelection(false),
  );
  const selectButton = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  const stage = container.querySelector<HTMLDivElement>(
    ".playable-player-stage",
  )!;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1280,
    height: 720,
    right: 1280,
    bottom: 720,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(selectButton, "getBoundingClientRect").mockReturnValue({
    left: 747,
    top: 497,
    width: 42,
    height: 42,
    right: 789,
    bottom: 539,
    x: 747,
    y: 497,
    toJSON: () => ({}),
  });
  const pointerEvent = (type: "pointerdown" | "pointerup") => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      clientX: { value: 768 },
      clientY: { value: 518 },
    });
    return event;
  };
  await act(async () => {
    selectButton.dispatchEvent(pointerEvent("pointerdown"));
  });
  expect(onSelectSettingsButton).toHaveBeenCalledOnce();
  await act(async () => renderSettingsButtonSelection(true));
  await act(async () => {
    selectButton.dispatchEvent(pointerEvent("pointerup"));
    selectButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
  });
  expect(onSelectSettingsButton).toHaveBeenCalledOnce();
  expect(selectButton.getAttribute("aria-pressed")).toBe("true");
  expect(selectButton.classList.contains("is-selected")).toBe(true);
  expect(
    container.querySelector(".playable-game-settings-dialog"),
  ).toBeNull();
  expect(
    messages.filter((message) => message.kind === "putenggame:playable:init"),
  ).toHaveLength(1);

  onSelectSettingsButton.mockClear();
  await act(async () =>
    root.render(
      <NodePlayer
        definition={updatedDefinition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
        tool="select"
        onSelectSettingsButton={onSelectSettingsButton}
      />,
    ),
  );
  const buttonWithoutDragHandler = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  await act(async () => {
    buttonWithoutDragHandler.dispatchEvent(pointerEvent("pointerdown"));
  });
  expect(onSelectSettingsButton).toHaveBeenCalledOnce();
  await act(async () => {
    buttonWithoutDragHandler.dispatchEvent(pointerEvent("pointerup"));
    buttonWithoutDragHandler.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
  });
  expect(container.querySelector(".playable-game-settings-dialog")).toBeNull();
});

it("keeps a dragged settings button in place when saving its position fails", async () => {
  const onSettingsButtonPositionChange = vi.fn(
    async () => await Promise.reject(new Error("Failed to fetch")),
  );
  const definitionWithSettingsButton: NodePlayerDefinition = {
    ...definition,
    graph: {
      ...definition.graph,
      settingsButton: { x: 0.6, y: 0.72 },
    },
  };

  await act(async () =>
    root.render(
      <NodePlayer
        definition={definitionWithSettingsButton}
        assets={{}}
        saveKey="settings-position-failure"
        storage={storage}
        frameUrl="about:blank"
        onSettingsButtonPositionChange={onSettingsButtonPositionChange}
      />,
    ),
  );

  const iframe = container.querySelector<HTMLIFrameElement>("iframe")!;
  const messages: Record<string, unknown>[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: Record<string, unknown>) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });
  const instanceId = messages.find(
    (message) => message.kind === "putenggame:playable:init",
  )!.instanceId as string;
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId,
          snapshot: {
            status: "running",
            policy: "published",
            currentNodeId: "start",
            backStack: [],
            state: {},
            recentSignals: [],
            reports: [],
            stateAccess: {},
            errors: [],
            save: { present: false },
          },
        },
      }),
    );
  });

  const button = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  const stage = container.querySelector<HTMLDivElement>(
    ".playable-player-stage",
  )!;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1280,
    height: 720,
    right: 1280,
    bottom: 720,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 747,
    top: 497,
    width: 42,
    height: 42,
    right: 789,
    bottom: 539,
    x: 747,
    y: 497,
    toJSON: () => ({}),
  });
  const pointerEvent = (
    type: "pointerdown" | "pointermove" | "pointerup",
    clientX: number,
    clientY: number,
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      clientX: { value: clientX },
      clientY: { value: clientY },
    });
    return event;
  };

  await act(async () => {
    button.dispatchEvent(pointerEvent("pointerdown", 768, 518));
    button.dispatchEvent(pointerEvent("pointermove", 900, 600));
    button.dispatchEvent(pointerEvent("pointerup", 900, 600));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(onSettingsButtonPositionChange).toHaveBeenCalledWith({
    x: 900 / 1280,
    y: 600 / 720,
  });
  expect(button.style.left).toBe(`${(900 / 1280) * 100}%`);
  expect(button.style.top).toBe(`${(600 / 720) * 100}%`);
});
