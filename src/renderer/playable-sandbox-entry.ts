import {
  isPlayableHostMessage,
  type PlayableFrameMessage,
  type PlayableHostMessage,
  type PlayableElementCopy,
  type PlayablePreviewTool,
  type PlayablePreviewShortcut,
} from "../shared/playable-player-protocol.js";
import { NodeRuntime } from "../shared/playable-runtime.js";
import {
  createPlayableSettingsService,
  type PlayableSettingsService,
  type PlayableGameSettings,
} from "../shared/playable-settings.js";
import {
  type PlayableSave,
  type PlayableSaveStore,
  type PlayableSeenStore,
} from "../shared/playable-runtime.js";
import type { PlayableSeen } from "../shared/playable-story-map.js";
import { DocumentPlayableSurfaceHost } from "../shared/playable-sandbox.js";
import { translateSandboxTextNodes } from "./playable-sandbox-language.js";

let session: SandboxSession | undefined;
let nextElementPasteRequest = 0;
let lastActivityPointerMove = 0;
const pendingElementPaste = new Map<
  string,
  {
    resolve: (sources: Record<string, string> | undefined) => void;
    reject: (error: Error) => void;
  }
>();

const reportPlayerActivity = (event: Event) => {
  const current = session;
  if (!current) return;
  if (event.type === "pointermove") {
    const now = performance.now();
    if (now - lastActivityPointerMove < 250) return;
    lastActivityPointerMove = now;
  }
  post({
    kind: "putenggame:playable:activity",
    instanceId: current.instanceId,
  });
};
for (const type of ["pointermove", "pointerdown", "click", "keydown", "touchstart"])
  document.addEventListener(type, reportPlayerActivity, true);

document.addEventListener(
  "click",
  (event) => {
    const current = session;
    if (!current || current.host.isPicking) return;
    const interactive = event.composedPath().some((target) => {
      if (!(target instanceof Element)) return false;
      const control = target.closest(
        'button, a[href], [role="button"], input[type="button"], input[type="submit"], [data-signal], [data-putenggame-button-preset], [data-putenggame-motion-mode="interactive"]',
      );
      return Boolean(
        control && !control.matches(":disabled, [aria-disabled='true']"),
      );
    });
    if (!interactive) return;
    post({
      kind: "putenggame:playable:button-activated",
      instanceId: current.instanceId,
    });
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    const current = session;
    if (
      current?.pauseMenuEnabled &&
      event.key === "Escape" &&
      !event.repeat &&
      !event.isComposing &&
      !isTextEntry(event.target)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      post({
        kind: "putenggame:playable:pause-menu-toggle",
        instanceId: current.instanceId,
      });
      return;
    }
    if (
      !current?.preview ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      isTextEntry(event.target)
    )
      return;
    const shortcut = previewShortcutForKey(event.key);
    if (!shortcut) return;
    event.preventDefault();
    post({
      kind: "putenggame:playable:keyboard-shortcut",
      instanceId: current.instanceId,
      shortcut,
    });
  },
  true,
);

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || !isPlayableHostMessage(event.data))
    return;
  if (event.data.kind === "putenggame:playable:save-result") {
    session?.saveStore.resolve(event.data);
    return;
  }
  if (event.data.kind === "putenggame:playable:settings-save-result") {
    session?.settingsStore.resolve(event.data);
    return;
  }
  if (event.data.kind === "putenggame:playable:settings-command") {
    const current = session;
    if (current?.instanceId !== event.data.instanceId) return;
    switch (event.data.action) {
      case "patch":
        current.settingsStore.service.patch(event.data.settings);
        break;
      case "save":
        void current.settingsStore.service.save().catch(() => {});
        break;
      case "reset":
        current.settingsStore.service.reset();
        break;
      case "discard":
        current.settingsStore.service.discard();
        break;
      case "pause":
        current.host.setPlayerPaused(true);
        break;
      case "resume":
        current.host.setPlayerPaused(false);
        break;
    }
    return;
  }
  if (event.data.kind === "putenggame:playable:runtime-command") {
    const current = session;
    if (current?.instanceId !== event.data.instanceId) return;
    const navigate =
      event.data.command === "return-to-entry"
        ? current.runtime.returnToEntry()
        : current.runtime.openStoryMap();
    void navigate
      .then(() => current.host.setPlayerPaused(false))
      .catch(() => {});
    return;
  }
  if (event.data.kind === "putenggame:playable:global-font") {
    const current = session;
    if (current?.instanceId === event.data.instanceId)
      current.host.setGlobalFontFamily(event.data.family);
    return;
  }
  if (event.data.kind === "putenggame:playable:assets-result") {
    const current = session;
    if (current?.instanceId !== event.data.instanceId) return;
    const pending = current.pendingAssets.get(event.data.requestId);
    if (!pending) return;
    current.pendingAssets.delete(event.data.requestId);
    if (event.data.error) {
      pending.reject(new Error(event.data.error));
      return;
    }
    for (const [id, asset] of Object.entries(event.data.assets))
      current.assetUrls[id] = URL.createObjectURL(
        asset.blob.type === asset.contentType
          ? asset.blob
          : new Blob([asset.blob], { type: asset.contentType }),
      );
    pending.resolve();
    return;
  }
  if (event.data.kind === "putenggame:playable:pick-start") {
    startPicking(event.data.instanceId, event.data.tool);
    return;
  }
  if (event.data.kind === "putenggame:playable:pick-locks") {
    if (session?.instanceId === event.data.instanceId)
      session.host.setPickingLocks(event.data.picks);
    return;
  }
  if (event.data.kind === "putenggame:playable:align-elements") {
    if (session?.instanceId === event.data.instanceId)
      session.host.alignPickedToCenter(
        event.data.reference,
        event.data.targets,
      );
    return;
  }
  if (event.data.kind === "putenggame:playable:text-created-result") {
    if (session?.instanceId === event.data.instanceId)
      session.host.setTextSource(event.data.id, event.data.source);
    return;
  }
  if (event.data.kind === "putenggame:playable:element-paste-result") {
    const pending = pendingElementPaste.get(event.data.requestId);
    if (!pending) return;
    pendingElementPaste.delete(event.data.requestId);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.sources);
    return;
  }
  if (event.data.kind === "putenggame:playable:element-clipboard") {
    if (session?.instanceId !== event.data.instanceId) return;
    if (event.data.action === "copy") session.host.copyPickedElements();
    else void session.host.pastePickedElements()?.catch(() => {});
    return;
  }
  if (event.data.kind === "putenggame:playable:vr-inspect") {
    if (session?.instanceId !== event.data.instanceId) return;
    post({
      kind: "putenggame:playable:vr-scene",
      instanceId: event.data.instanceId,
      requestId: event.data.requestId,
      nodeId: event.data.nodeId,
      buttons: session.host.inspectVrButtons(
        event.data.nodeId,
        event.data.viewport,
      ),
    });
    return;
  }
  if (event.data.kind === "putenggame:playable:vr-activate") {
    if (session?.instanceId !== event.data.instanceId) return;
    session.host.activateVrButton(event.data.nodeId, event.data.buttonId);
    return;
  }
  if (event.data.kind === "putenggame:playable:vr-press") {
    if (session?.instanceId !== event.data.instanceId) return;
    session.host.pressVrButton(
      event.data.nodeId,
      event.data.buttonId,
      event.data.phase,
    );
    return;
  }
  if (event.data.kind === "putenggame:playable:media-command") {
    if (session?.instanceId === event.data.instanceId) {
      if (
        event.data.command.command === "insert-button-preset" &&
        event.data.command.signal
      )
        session.runtime.registerSignal(event.data.command.nodeId, {
          id: event.data.command.signal,
          label: event.data.command.label,
        });
      session.host.controlMedia(event.data.command);
    }
    return;
  }
  if (event.data.kind === "putenggame:playable:delete-element") {
    if (session?.instanceId === event.data.instanceId)
      session.host.deletePicked(event.data.pick);
    return;
  }
  if (event.data.kind === "putenggame:playable:appearance-timing") {
    if (session?.instanceId === event.data.instanceId)
      session.host.updateAppearanceTiming(event.data.command.updates);
    return;
  }
  if (event.data.kind === "putenggame:playable:motion") {
    if (session?.instanceId === event.data.instanceId)
      session.host.updateMotion(event.data.command);
    return;
  }
  if (event.data.kind === "putenggame:playable:text-style") {
    if (session?.instanceId === event.data.instanceId)
      session.host.updateTextStyle(event.data.command);
    return;
  }
  if (event.data.kind === "putenggame:playable:backdrop-effects") {
    if (session?.instanceId === event.data.instanceId)
      session.host.setBackdropEffects(event.data.effects);
    return;
  }
  if (event.data.kind === "putenggame:playable:pick-cancel") {
    if (session?.instanceId === event.data.instanceId)
      session.host.stopPicking();
    return;
  }
  void startSession(event.data);
});

window.addEventListener("pagehide", () => {
  void disposeSession();
});

// Exceptions thrown from surface event handlers never pass through a Runtime
// call, so they are recorded here against the current Node.
window.addEventListener("error", (event) => {
  session?.runtime.recordError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  session?.runtime.recordError(event.reason);
});

async function startSession(
  message: Extract<PlayableHostMessage, { kind: "putenggame:playable:init" }>,
): Promise<void> {
  await disposeSession();
  const assetUrls: Record<string, string> = {};
  const pendingAssets = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  let nextAssetRequest = 0;
  try {
    for (const [id, asset] of Object.entries(message.assets)) {
      assetUrls[id] = URL.createObjectURL(
        asset.blob.type === asset.contentType
          ? asset.blob
          : new Blob([asset.blob], { type: asset.contentType }),
      );
    }
    const saveStore = new ParentSaveStore(message.instanceId, message.save);
    const settingsStore = new ParentSettingsStore(
      message.instanceId,
      message.settings,
    );
    const host = new DocumentPlayableSurfaceHost(document);
    host.setGlobalFontFamily(message.definition.graph.globalFontFamily);
    const ensureAssets = (assetIds: readonly string[]) => {
      const missing = [...new Set(assetIds)].filter((id) => !assetUrls[id]);
      if (!missing.length) return Promise.resolve();
      const requestId = String(++nextAssetRequest);
      const result = new Promise<void>((resolve, reject) => {
        pendingAssets.set(requestId, { resolve, reject });
      });
      post({
        kind: "putenggame:playable:assets-request",
        instanceId: message.instanceId,
        requestId,
        assetIds: missing,
      });
      return result;
    };
    const runtime = new NodeRuntime({
      graph: message.definition.graph,
      compiled: message.definition.compiled,
      graphSignature: message.definition.graphSignature,
      surfaceHost: host,
      saveStore,
      settings: settingsStore.service,
      seenStore: new ParentSeenStore(message.instanceId, message.seen),
      assetUrls,
      ensureAssets,
      ...message.preview,
      onChange: () => scheduleSnapshot(message.instanceId),
      onError: (error) =>
        post({
          kind: "putenggame:playable:diagnostic",
          instanceId: message.instanceId,
          error: errorMessage(error),
        }),
    });
    host.setMediaStateListener((state) =>
      post({
        kind: "putenggame:playable:media-state",
        instanceId: message.instanceId,
        state,
      }),
    );
    const disposeLanguage = installSandboxLanguage();
    session = {
      instanceId: message.instanceId,
      preview: message.preview !== undefined,
      pauseMenuEnabled: message.pauseMenuEnabled === true,
      runtime,
      host,
      saveStore,
      settingsStore,
      assetUrls,
      pendingAssets,
      disposeLanguage,
    };
    await runtime.start();
    applySandboxLanguage();
    postSnapshot(message.instanceId);
  } catch (cause) {
    if (!session) {
      for (const url of Object.values(assetUrls)) URL.revokeObjectURL(url);
    }
    post({
      kind: "putenggame:playable:error",
      instanceId: message.instanceId,
      error: errorMessage(cause),
    });
  }
}

function startPicking(instanceId: string, tool: PlayablePreviewTool): void {
  const current = session;
  // Picking is an authoring tool; published sessions never enable it.
  if (current?.instanceId !== instanceId || !current.preview) return;
  current.host.startPicking(tool, {
    onPick: (pick, additive) =>
      post({ kind: "putenggame:playable:picked", instanceId, pick, additive }),
    onTextSelect: (selection) =>
      post({
        kind: "putenggame:playable:text-selected",
        instanceId,
        ...(selection ? { selection } : {}),
      }),
    onInteractionSelect: (selection, additive) =>
      post({
        kind: "putenggame:playable:interaction-selected",
        instanceId,
        selection,
        additive,
      }),
    onTextEdit: (edit) =>
      post({ kind: "putenggame:playable:text-edited", instanceId, edit }),
    onTextCreate: (text) =>
      post({ kind: "putenggame:playable:text-created", instanceId, text }),
    onMove: (move) =>
      post({ kind: "putenggame:playable:moved", instanceId, move }),
    onTransform: (edit) =>
      post({ kind: "putenggame:playable:transformed", instanceId, edit }),
    onDelete: (edit) =>
      post({ kind: "putenggame:playable:deleted", instanceId, edit }),
    onDeleteSelection: () =>
      post({ kind: "putenggame:playable:delete-selection", instanceId }),
    onContextMenu: (position) =>
      post({
        kind: "putenggame:playable:context-menu",
        instanceId,
        ...position,
      }),
    onPasteElements: (copies: PlayableElementCopy[]) =>
      new Promise((resolve, reject) => {
        const requestId = String(++nextElementPasteRequest);
        pendingElementPaste.set(requestId, { resolve, reject });
        post({
          kind: "putenggame:playable:element-paste",
          instanceId,
          requestId,
          copies,
        });
      }),
    onHistoryCommand: (command) =>
      post({
        kind: "putenggame:playable:history-command",
        instanceId,
        command,
      }),
    onCancel: () =>
      post({ kind: "putenggame:playable:pick-cancelled", instanceId }),
  });
}

async function disposeSession(): Promise<void> {
  const current = session;
  session = undefined;
  if (!current) return;
  current.saveStore.dispose();
  current.settingsStore.dispose();
  for (const pending of current.pendingAssets.values())
    pending.reject(new Error("The preview closed before Assets loaded."));
  current.pendingAssets.clear();
  current.disposeLanguage();
  await current.runtime.dispose();
  current.host.destroy();
  for (const pending of pendingElementPaste.values())
    pending.reject(new Error("The preview closed before paste completed."));
  pendingElementPaste.clear();
  for (const url of Object.values(current.assetUrls)) URL.revokeObjectURL(url);
}

class ParentSaveStore implements PlayableSaveStore {
  readonly #pending = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  #nextRequest = 0;

  constructor(
    readonly instanceId: string,
    readonly initialSave: unknown,
  ) {}

  async load(): Promise<unknown> {
    return this.initialSave;
  }

  save(save: PlayableSave): Promise<void> {
    const requestId = String(++this.#nextRequest);
    const result = new Promise<void>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
    });
    post({
      kind: "putenggame:playable:save",
      instanceId: this.instanceId,
      requestId,
      save,
    });
    return result;
  }

  resolve(
    message: Extract<
      PlayableHostMessage,
      { kind: "putenggame:playable:save-result" }
    >,
  ): void {
    if (message.instanceId !== this.instanceId) return;
    const pending = this.#pending.get(message.requestId);
    if (!pending) return;
    this.#pending.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve();
  }

  dispose(): void {
    for (const pending of this.#pending.values())
      pending.reject(
        new Error("Published Player closed before the save completed."),
      );
    this.#pending.clear();
  }
}

class ParentSeenStore implements PlayableSeenStore {
  constructor(
    readonly instanceId: string,
    readonly initialSeen: unknown,
  ) {}

  async load(): Promise<unknown> {
    return this.initialSeen;
  }

  async save(seen: PlayableSeen): Promise<void> {
    post({
      kind: "putenggame:playable:seen",
      instanceId: this.instanceId,
      seen,
    });
  }
}

class ParentSettingsStore {
  readonly #pending = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  #nextRequest = 0;
  readonly service: PlayableSettingsService;

  constructor(
    readonly instanceId: string,
    initialSettings: unknown,
  ) {
    this.service = createPlayableSettingsService(initialSettings, (settings) =>
      this.persist(settings),
    );
    this.service.subscribe((settings) => {
      applySandboxLanguage();
      post({
        kind: "putenggame:playable:settings-change",
        instanceId,
        settings: settings as PlayableGameSettings,
      });
    });
  }

  resolve(
    message: Extract<
      PlayableHostMessage,
      { kind: "putenggame:playable:settings-save-result" }
    >,
  ): void {
    if (message.instanceId !== this.instanceId) return;
    const pending = this.#pending.get(message.requestId);
    if (!pending) return;
    this.#pending.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve();
  }

  dispose(): void {
    for (const pending of this.#pending.values())
      pending.reject(new Error("The player closed before settings were saved."));
    this.#pending.clear();
  }

  private persist(settings: Readonly<PlayableGameSettings>): Promise<void> {
    const requestId = String(++this.#nextRequest);
    const result = new Promise<void>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
    });
    post({
      kind: "putenggame:playable:settings-save",
      instanceId: this.instanceId,
      requestId,
      settings: settings as PlayableGameSettings,
    });
    return result;
  }
}

interface SandboxSession {
  instanceId: string;
  preview: boolean;
  pauseMenuEnabled: boolean;
  runtime: NodeRuntime;
  host: DocumentPlayableSurfaceHost;
  saveStore: ParentSaveStore;
  settingsStore: ParentSettingsStore;
  assetUrls: Record<string, string>;
  pendingAssets: Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >;
  disposeLanguage: () => void;
}

const sandboxOriginalText = new WeakMap<Text, string>();

const SANDBOX_ZH: Record<string, string> = {
  "Untitled story": "未命名影游",
  QTE: "快速事件",
  "Made it": "成功",
  Missed: "失败",
  Space: "空格",
  "Jump!": "跳跃！",
  Hotspot: "热点场景",
  Door: "门",
  Window: "窗",
  "Look around.": "四处看看。",
  Ending: "结局",
  Fin: "终",
  "Write the closing lines of this ending here.": "在此写下结局的收尾文字。",
  "Play again": "再玩一次",
  "A new case": "新的案件",
  "Shanghai, 1937": "上海，1937",
  Start: "开始",
  Continue: "继续",
  "No save yet": "暂无存档",
  "Story map": "故事地图",
  Choice: "选择",
  "Main menu": "主菜单",
  "I had no choice.": "我别无选择。",
  "Who else would come?": "还有谁会来？",
  STRANGER: "陌生人",
  '"You came alone. That was brave."': "“你独自一人来的。很勇敢。”",
  "Click to continue ▸": "点击继续 ▸",
  Back: "返回",
  "PLAYER MENU": "玩家设置",
  "Video volume": "视频音量",
  "Background music": "背景音乐",
  "Music volume": "音乐音量",
  "UI sounds": "界面音效",
  "UI sound volume": "界面音效音量",
  Sound: "声音",
  Display: "显示",
  Brightness: "亮度",
  "Display mode": "显示模式",
  Fullscreen: "全屏",
  Windowed: "窗口",
  Resolution: "分辨率",
  Auto: "自动",
  Subtitles: "字幕",
  "Show subtitles": "显示字幕",
  "Subtitle size": "字幕字号",
  "Video for subtitle timing": "字幕对应视频",
  "No declared videos": "没有已声明的视频",
  End: "结束",
  "Subtitle text": "字幕内容",
  "Remove subtitle": "删除字幕",
  "Check subtitle timing.": "请检查字幕时间。",
  "Speech transcription provider connected": "语音转写服务已连接",
  "Speech transcription provider not connected": "尚未连接语音转写服务",
  "Add subtitle line": "添加字幕行",
  "Generate subtitles": "生成字幕",
  Other: "其他",
  "Message hints": "消息提示",
  Language: "语言",
  "Save settings": "保存设置",
  Reset: "重置",
  "Unsaved settings": "未保存的设置",
  "Save your changes before leaving?": "离开前要保存更改吗？",
  "Save and return": "保存并返回",
  "Discard and return": "放弃更改并返回",
  "Keep editing": "继续编辑",
  "Unsaved changes": "有未保存的更改",
  "Settings saved": "设置已保存",
  "Could not save settings.": "设置保存失败。",
  "Could not return.": "无法返回。",
  "Could not generate subtitles.": "字幕生成失败。",
  "Language changed": "语言已切换",
  "Defaults restored. Save to keep them.": "已恢复默认值，保存后生效。",
  "Subtitle draft generated. Review and save it.": "字幕草稿已生成，请检查并保存。",
};

function sandboxLanguage(): "zh-CN" | "en-US" {
  return session?.settingsStore.service.get("language") ?? "zh-CN";
}

function translateSandboxText(value: string): string {
  if (sandboxLanguage() === "en-US") return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(
    leading.length,
    value.length - trailing.length || undefined,
  );
  const exact = SANDBOX_ZH[core];
  if (exact) return `${leading}${exact}${trailing}`;
  const progress = core.match(/^Scenes (\d+\/\d+) · Endings (\d+\/\d+)$/);
  return progress
    ? `${leading}场景 ${progress[1]} · 结局 ${progress[2]}${trailing}`
    : value;
}

function applySandboxLanguage(): void {
  document.documentElement.lang = sandboxLanguage();
  for (const root of sandboxRoots())
    translateSandboxTextNodes(root, translateSandboxText, sandboxOriginalText);
}

function sandboxRoots(): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = [document];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const elements = Array.from(root.querySelectorAll("*"));
    for (const element of elements)
      if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  return roots;
}

function installSandboxLanguage(): () => void {
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const observeRoots = () => {
    for (const root of sandboxRoots()) {
      if (observers.has(root)) continue;
      const observer = new MutationObserver(() => {
        applySandboxLanguage();
        observeRoots();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      observers.set(root, observer);
    }
  };
  observeRoots();
  applySandboxLanguage();
  return () => {
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
  };
}

let snapshotScheduled = false;

/** Coalesces Runtime changes into one snapshot per task. */
function scheduleSnapshot(instanceId: string): void {
  if (snapshotScheduled) return;
  snapshotScheduled = true;
  window.setTimeout(() => {
    snapshotScheduled = false;
    postSnapshot(instanceId);
  }, 0);
}

function postSnapshot(instanceId: string): void {
  if (session?.instanceId !== instanceId) return;
  post({
    kind: "putenggame:playable:snapshot",
    instanceId,
    snapshot: session.runtime.snapshot(),
  });
}

function post(message: PlayableFrameMessage): void {
  window.parent.postMessage(message, "*");
}

function previewShortcutForKey(key: string): PlayablePreviewShortcut | undefined {
  switch (key.toLowerCase()) {
    case "s":
      return "select";
    case "t":
      return "text";
    case "m":
      return "move";
    case "d":
      return "draw";
    case " ":
    case "spacebar":
      return "toggle-playback";
    default:
      return undefined;
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
