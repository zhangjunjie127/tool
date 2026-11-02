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
import { DEFAULT_PLAYABLE_GAME_SETTINGS } from "../src/shared/playable-settings.js";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("plays the shared button sound for scene and player buttons unless UI sound is muted", async () => {
  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:button-sound");
  const soundId = "click-sound";
  const definitionWithSound: NodePlayerDefinition = {
    ...definition,
    graph: {
      ...definition.graph,
      assets: {
        [soundId]: {
          type: "audio",
          source: { kind: "library", assetId: "library-click" },
        },
      },
      buttonSoundAssetId: soundId,
    },
  };
  const onLoadAssets = vi.fn(async () => ({
    [soundId]: new Blob(["sound"], { type: "audio/wav" }),
  }));
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definitionWithSound}
        assets={{}}
        onLoadAssets={onLoadAssets}
        saveKey="button-sound-test"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings
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
          snapshot: { currentNodeId: "start" },
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:button-activated",
          instanceId,
        },
      }),
    );
  });
  expect(play).toHaveBeenCalledOnce();

  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(".playable-player-settings-trigger")!
      .click();
  });
  expect(play).toHaveBeenCalledTimes(2);

  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:settings-change",
          instanceId,
          settings: {
            ...DEFAULT_PLAYABLE_GAME_SETTINGS,
            uiSoundEnabled: false,
          },
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:button-activated",
          instanceId,
        },
      }),
    );
  });
  expect(play).toHaveBeenCalledTimes(2);
});

it("opens global settings without restarting the current game session", async () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("playable-player") ? 1280 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("playable-player") ? 720 : 0;
    },
  );
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

  const sizedDefinition: NodePlayerDefinition = {
    ...updatedDefinition,
    graph: {
      ...updatedDefinition.graph,
      settingsButton: { x: 0.6, y: 0.72, size: 84 },
      returnButton: { x: 0.25, y: 0.35, size: 84 },
    },
  };
  await act(async () =>
    root.render(
      <NodePlayer
        definition={sizedDefinition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
        showReturnButton
      />,
    ),
  );
  expect(
    container.querySelector<HTMLButtonElement>(
      ".playable-player-settings-trigger",
    )?.style,
  ).toMatchObject({ left: "60%", top: "72%", width: "84px", height: "84px" });
  expect(
    container.querySelector<HTMLButtonElement>(
      ".playable-player-return-trigger",
    )?.style,
  ).toMatchObject({ left: "25%", top: "35%", width: "84px", height: "84px" });

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
  expect(
    selectButton.querySelector(".playable-player-settings-selection-box"),
  ).toBeNull();
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
    selectButton.querySelector(".playable-player-settings-selection-box"),
  ).not.toBeNull();
  const pendingIcon = new Blob(["pending"], { type: "image/png" });
  const originalSize = {
    width: selectButton.style.width,
    height: selectButton.style.height,
  };
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:pending-settings-icon");
  await act(async () =>
    root.render(
      <NodePlayer
        definition={updatedDefinition}
        assets={{}}
        saveKey="settings-test"
        storage={storage}
        frameUrl="about:blank"
        tool="select"
        settingsButtonSelected
        settingsButtonIconPreview={pendingIcon}
        onSelectSettingsButton={onSelectSettingsButton}
        onSettingsButtonPositionChange={vi.fn(async () => true)}
      />,
    ),
  );
  const previewButton = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  expect(previewButton.querySelector("img")?.getAttribute("src")).toBe(
    "blob:pending-settings-icon",
  );
  expect(previewButton.style).toMatchObject({
    left: "60%",
    top: "72%",
    ...originalSize,
  });
  expect(createObjectURL).toHaveBeenCalledWith(pendingIcon);
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

it("updates the global font without restarting the preview iframe", async () => {
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="global-font-test"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings={false}
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
          snapshot: {},
        },
      }),
    );
  });

  const fontDefinition: NodePlayerDefinition = {
    ...definition,
    graph: { ...definition.graph, globalFontFamily: "Example UI" },
  };
  await act(async () =>
    root.render(
      <NodePlayer
        definition={fontDefinition}
        assets={{}}
        saveKey="global-font-test"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings={false}
      />,
    ),
  );
  expect(container.querySelector("iframe")).toBe(iframe);
  expect(
    messages.filter((message) => message.kind === "putenggame:playable:init"),
  ).toHaveLength(1);
  expect(messages.at(-1)).toMatchObject({
    kind: "putenggame:playable:global-font",
    instanceId,
    family: "Example UI",
  });

  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="global-font-test"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings={false}
      />,
    ),
  );
  expect(container.querySelector("iframe")).toBe(iframe);
  expect(messages.at(-1)).toEqual({
    kind: "putenggame:playable:global-font",
    instanceId,
  });
});

it("keeps the pause menu available by button and Escape without disrupting settings", async () => {
  const onReturnButtonPositionChange = vi.fn(async () => true);
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="pause-menu-test"
        storage={storage}
        frameUrl="about:blank"
        showPauseMenu
        onReturnButtonPositionChange={onReturnButtonPositionChange}
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

  const init = messages.find(
    (message) => message.kind === "putenggame:playable:init",
  )!;
  const instanceId = init.instanceId as string;
  expect(init.pauseMenuEnabled).toBe(true);
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

  expect(
    container.querySelector(".playable-player-return-trigger"),
  ).toBeNull();
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId,
          snapshot: {
            status: "running",
            policy: "published",
            currentNodeId: "game",
            backStack: ["start"],
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

  const returnButton = container.querySelector<HTMLButtonElement>(
    ".playable-player-return-trigger",
  )!;
  expect(returnButton).not.toBeNull();
  await act(async () => {
    returnButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
  });
  expect(container.querySelector(".playable-pause-menu")).not.toBeNull();
  const pauseMenu = container.querySelector(".playable-pause-menu")!;
  for (const item of [
    "continueGame",
    "mainMenu",
    "storyMap",
    "settings",
    "exit",
  ] as const) {
    expect(pauseMenu.textContent).toContain(t(`pauseMenu.${item}`));
  }
  expect(messages.at(-1)).toMatchObject({
    kind: "putenggame:playable:settings-command",
    instanceId,
    action: "pause",
  });

  const settingsItem = [
    ...container.querySelectorAll<HTMLButtonElement>(
      ".playable-pause-menu-item",
    ),
  ].find((button) => button.textContent?.includes(t("pauseMenu.settings")))!;
  await act(async () => settingsItem.click());
  expect(container.querySelector(".playable-game-settings-dialog")).not.toBeNull();
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(container.querySelector(".playable-game-settings-dialog")).toBeNull();
  expect(container.querySelector(".playable-pause-menu")).not.toBeNull();
  expect(messages.at(-1)).not.toMatchObject({
    kind: "putenggame:playable:settings-command",
    action: "resume",
  });

  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(container.querySelector(".playable-pause-menu")).toBeNull();
  expect(messages.at(-1)).toMatchObject({
    kind: "putenggame:playable:settings-command",
    instanceId,
    action: "resume",
  });
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

it("lets the editor select and drag the return button without opening the menu", async () => {
  const onSelectReturnButton = vi.fn();
  const onReturnButtonPositionChange = vi.fn(async () => true);
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="return-button-edit"
        storage={storage}
        frameUrl="about:blank"
        showReturnButton
        tool="select"
        onSelectReturnButton={onSelectReturnButton}
        onReturnButtonPositionChange={onReturnButtonPositionChange}
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
    ".playable-player-return-trigger",
  )!;
  expect(button).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe(
    t("playableWorkbench.selectReturnButton"),
  );
  expect(button.style.left).toBe(`${(1247 / 1280) * 100}%`);

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
    left: 1226,
    top: 12,
    width: 42,
    height: 42,
    right: 1268,
    bottom: 54,
    x: 1226,
    y: 12,
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
    button.dispatchEvent(pointerEvent("pointerdown", 1247, 33));
    button.dispatchEvent(pointerEvent("pointermove", 900, 400));
    button.dispatchEvent(pointerEvent("pointerup", 900, 400));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(onSelectReturnButton).toHaveBeenCalledOnce();
  expect(onReturnButtonPositionChange).toHaveBeenCalledWith({
    x: 900 / 1280,
    y: 400 / 720,
  });
  expect(button.style.left).toBe(`${(900 / 1280) * 100}%`);
  expect(button.style.top).toBe(`${(400 / 720) * 100}%`);
  expect(container.querySelector(".playable-pause-menu")).toBeNull();
});

it("keeps replacement settings and return icons contained in their existing button frames", async () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:settings-icon")
    .mockReturnValueOnce("blob:return-icon")
    .mockReturnValueOnce("blob:settings-icon-replacement")
    .mockReturnValueOnce("blob:return-icon-replacement");
  const definitionWithIcons: NodePlayerDefinition = {
    ...definition,
    graph: {
      ...definition.graph,
      settingsButton: {
        x: 0.3,
        y: 0.4,
      },
      returnButton: {
        x: 0.7,
        y: 0.6,
        size: 64,
      },
    },
  };
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definitionWithIcons}
        assets={{}}
        saveKey="replacement-icons"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings
        showReturnButton
        settingsButtonIconPreview={
          new Blob(["settings"], { type: "image/png" })
        }
        returnButtonIconPreview={new Blob(["return"], { type: "image/png" })}
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
    await Promise.resolve();
  });

  const settingsButton = container.querySelector<HTMLButtonElement>(
    ".playable-player-settings-trigger",
  )!;
  const returnButton = container.querySelector<HTMLButtonElement>(
    ".playable-player-return-trigger",
  )!;
  const initialFrames = [settingsButton, returnButton].map((button) => ({
    left: button.style.left,
    top: button.style.top,
    width: button.style.width,
    height: button.style.height,
  }));
  expect(initialFrames).toEqual([
    { left: "30%", top: "40%", width: "0px", height: "0px" },
    { left: "70%", top: "60%", width: "0px", height: "0px" },
  ]);
  expect(settingsButton.querySelector("img")?.style.objectFit).toBe("contain");
  expect(returnButton.querySelector("img")?.style.objectFit).toBe("contain");

  await act(async () =>
    root.render(
      <NodePlayer
        definition={definitionWithIcons}
        assets={{}}
        saveKey="replacement-icons"
        storage={storage}
        frameUrl="about:blank"
        showGameSettings
        showReturnButton
        settingsButtonIconPreview={
          new Blob(["replacement-settings"], { type: "image/png" })
        }
        returnButtonIconPreview={
          new Blob(["replacement-return"], { type: "image/png" })
        }
      />,
    ),
  );
  expect(
    [settingsButton, returnButton].map((button) => ({
      left: button.style.left,
      top: button.style.top,
      width: button.style.width,
      height: button.style.height,
    })),
  ).toEqual(initialFrames);
  expect(createObjectURL).toHaveBeenCalledTimes(4);
});
