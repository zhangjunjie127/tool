import {
  isPlayableHostMessage,
  type PlayableFrameMessage,
  type PlayableHostMessage,
  type PlayableElementCopy,
  type PlayablePreviewTool,
} from "../shared/playable-player-protocol.js";
import {
  NodeRuntime,
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

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || !isPlayableHostMessage(event.data))
    return;
  if (event.data.kind === "putenggame:playable:save-result") {
    session?.saveStore.resolve(event.data);
    return;
  }
  if (event.data.kind === "putenggame:playable:pick-start") {
    startPicking(event.data.instanceId, event.data.tool);
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
  try {
    for (const [id, asset] of Object.entries(message.assets)) {
      assetUrls[id] = URL.createObjectURL(
        new Blob([asset.bytes], { type: asset.contentType }),
      );
    }
    const saveStore = new ParentSaveStore(message.instanceId, message.save);
    const host = new DocumentPlayableSurfaceHost(document);
    const runtime = new NodeRuntime({
      graph: message.definition.graph,
      compiled: message.definition.compiled,
      graphSignature: message.definition.graphSignature,
      surfaceHost: host,
      saveStore,
      seenStore: new ParentSeenStore(message.instanceId, message.seen),
      assetUrls,
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
      runtime,
      host,
      saveStore,
      assetUrls,
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

interface SandboxSession {
  instanceId: string;
  preview: boolean;
  runtime: NodeRuntime;
  host: DocumentPlayableSurfaceHost;
  saveStore: ParentSaveStore;
  assetUrls: Record<string, string>;
  disposeLanguage: () => void;
}

const SANDBOX_LANGUAGE_KEY = "putenggame:language";
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
};

function sandboxLanguage(): "zh-CN" | "en-US" {
  try {
    return localStorage.getItem(SANDBOX_LANGUAGE_KEY) === "en-US"
      ? "en-US"
      : "zh-CN";
  } catch {
    return "zh-CN";
  }
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

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
