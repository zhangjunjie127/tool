import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref, type UIEventHandler } from "react";
import { House, PanelToggle, type IconComponent } from "./icons.js";
import type { ChatLayout } from "./chat-layout.js";
import { t } from "./i18n.js";
import { PanelResizeHandle } from "./panel-resize-handle.js";
import { StoryTreePaneMinimumWidthContext } from "./story-tree-panes.js";

const DEFAULT_AGENT_WIDTH = 430;
const MIN_AGENT_WIDTH = 320;
const MIN_VIEWER_WIDTH = 300;
const AGENT_WIDTH_STORAGE_KEY = "ohmygame-agent-width";
const STORY_WIDTH_STORAGE_KEY = "ohmygame-story-panel-width";
const MIN_STORY_WIDTH = 420;

/** Shared chrome and layout for game and plugin workspaces. */
export function WorkspaceShell({ chatLayout, agentCollapsed, viewerCollapsed = false, onHome, onExpandAgent, homeLabel = t("sidebar.home"), homeIcon = House, className = "", agent, children, agentSidePanel, agentSidePanelVisible = true }: {
  chatLayout: ChatLayout;
  agentCollapsed: boolean;
  viewerCollapsed?: boolean;
  onHome: () => void;
  onExpandAgent: () => void;
  homeLabel?: string;
  homeIcon?: IconComponent;
  className?: string;
  agent: ReactNode;
  children: ReactNode;
  agentSidePanel?: ReactNode;
  agentSidePanelVisible?: boolean;
}) {
  const [agentWidth, setAgentWidth] = useState(readAgentWidth);
  const [maximumAgentWidth, setMaximumAgentWidth] = useState(DEFAULT_AGENT_WIDTH);
  const [resizingAgent, setResizingAgent] = useState(false);
  const [shellWidth, setShellWidth] = useState(window.innerWidth);
  const [storyMinimumWidth, setStoryMinimumWidth] = useState(MIN_STORY_WIDTH);
  const [storyWidth, setStoryWidth] = useState<number | undefined>(() => {
    try {
      const stored = Number(localStorage.getItem(STORY_WIDTH_STORAGE_KEY));
      return stored >= MIN_STORY_WIDTH && Number.isFinite(stored) ? stored : undefined;
    } catch { return undefined; }
  });
  const shell = useRef<HTMLElement>(null);
  const widthRef = useRef(agentWidth);
  const resizingRef = useRef(false);
  const collapsed = agentCollapsed || viewerCollapsed;
  const hasAgentSidePanel = agentSidePanel !== undefined;
  const sidePanelVisible = hasAgentSidePanel && agentSidePanelVisible;
  const sidePanelWidth = storyPanelWidth(shellWidth, storyWidth, agentCollapsed);
  const reservedSideWidth = sidePanelVisible && shellWidth > 1100 ? sidePanelWidth : 0;
  const maximumStoryWidth = Math.max(MIN_STORY_WIDTH,
    shellWidth - (agentCollapsed ? 0 : agentWidth) - MIN_VIEWER_WIDTH - 5);
  const minimumStoryWidth = Math.min(maximumStoryWidth, Math.ceil(Math.max(MIN_STORY_WIDTH, storyMinimumWidth)));

  useEffect(() => {
    const updateMaximum = () => {
      if (window.matchMedia("(max-width: 720px)").matches) return;
      const bounds = shell.current?.getBoundingClientRect();
      if (!bounds) return;
      setShellWidth(bounds.width);
      const maximum = maximumWidth(bounds.width, sidePanelVisible && bounds.width > 1100
        ? storyPanelWidth(bounds.width, storyWidth, agentCollapsed) : 0);
      setMaximumAgentWidth(maximum);
      if (!agentCollapsed && widthRef.current > maximum) {
        widthRef.current = maximum;
        setAgentWidth(maximum);
        saveWidth(maximum);
      }
    };
    updateMaximum();
    window.addEventListener("resize", updateMaximum);
    return () => window.removeEventListener("resize", updateMaximum);
  }, [sidePanelVisible, storyWidth, agentCollapsed]);

  function resize(clientX: number) {
    const bounds = shell.current?.getBoundingClientRect();
    if (!bounds || !shell.current) return;
    const distance = chatLayout === "right" ? bounds.right - clientX : clientX - bounds.left;
    const width = Math.round(Math.min(maximumWidth(bounds.width, reservedSideWidth), Math.max(MIN_AGENT_WIDTH, distance)));
    widthRef.current = width;
    shell.current.style.setProperty("--agent-width", `${width}px`);
  }
  function finishResize() {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    setResizingAgent(false);
    setAgentWidth(widthRef.current);
    saveWidth(widthRef.current);
  }
  function resetWidth() {
    const width = Math.min(DEFAULT_AGENT_WIDTH, maximumAgentWidth);
    widthRef.current = width;
    setAgentWidth(width);
    saveWidth(width);
  }
  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = chatLayout === "left"
      ? (event.key === "ArrowLeft" ? -1 : 1)
      : (event.key === "ArrowLeft" ? 1 : -1);
    const bounds = shell.current?.getBoundingClientRect();
    if (!bounds) return;
    resize(chatLayout === "right"
      ? bounds.right - widthRef.current - direction * 16
      : bounds.left + widthRef.current + direction * 16);
    setAgentWidth(widthRef.current);
    saveWidth(widthRef.current);
  }

  return <main ref={shell} className={`workspace-shell workspace-shell-chat-${chatLayout}${agentSidePanel !== undefined ? " workspace-shell-has-agent-side-panel" : ""}${agentCollapsed ? " workspace-shell-agent-collapsed" : ""}${viewerCollapsed ? " workspace-shell-viewer-collapsed" : ""}${resizingAgent ? " workspace-shell-resizing" : ""} ${className}`}
    style={{ "--agent-width": `${agentWidth}px`, "--story-panel-width": `${sidePanelWidth}px` } as CSSProperties}>
    {resizingAgent ? <div className="workspace-resize-shield" /> : null}
    {chatLayout === "left" ? <div className="workspace-navigation-actions" role="toolbar" aria-label={t("workspace.navigation")}>
      <WorkspaceBackButton onClick={onHome} label={homeLabel} icon={homeIcon} />
      {agentCollapsed ? <button className="icon-button" type="button" onClick={onExpandAgent} title={t("workspace.showAgent")} aria-label={t("workspace.showAgent")}><PanelToggle size={15} /></button> : null}
    </div> : null}
    {agent}
    <div className="workspace-resizer" role="separator" aria-label={t("workspace.resizeAgent")} aria-orientation="vertical"
      aria-valuemin={MIN_AGENT_WIDTH} aria-valuemax={maximumAgentWidth} aria-valuenow={agentWidth}
      aria-hidden={collapsed || undefined} tabIndex={collapsed ? -1 : 0}
      onDoubleClick={resetWidth} onKeyDown={resizeWithKeyboard}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizingRef.current = true;
        setResizingAgent(true);
      }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
      onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); finishResize(); }}
      onPointerCancel={finishResize} onLostPointerCapture={finishResize} />
    {agentSidePanel !== undefined ? <aside className="workspace-agent-side-panel">
      <StoryTreePaneMinimumWidthContext.Provider value={setStoryMinimumWidth}>
        {agentSidePanel}
      </StoryTreePaneMinimumWidthContext.Provider>
      {sidePanelVisible && !viewerCollapsed ? <PanelResizeHandle
        className="workspace-story-resizer"
        label={t("workspace.resizeStoryPanel")}
        value={sidePanelWidth}
        minimum={minimumStoryWidth}
        maximum={maximumStoryWidth}
        reversed={chatLayout === "right"}
        onChange={width => {
          setStoryWidth(width);
          try { localStorage.setItem(STORY_WIDTH_STORAGE_KEY, String(width)); } catch { /* Optional preference. */ }
        }}
        onReset={() => {
          const defaultWidth = storyPanelWidth(shellWidth, undefined, agentCollapsed);
          const width = Math.min(maximumStoryWidth, Math.max(minimumStoryWidth, defaultWidth));
          setStoryWidth(width === defaultWidth ? undefined : width);
          try {
            if (width === defaultWidth) localStorage.removeItem(STORY_WIDTH_STORAGE_KEY);
            else localStorage.setItem(STORY_WIDTH_STORAGE_KEY, String(width));
          } catch { /* Optional preference. */ }
        }}
      /> : null}
    </aside> : null}
    {children}
  </main>;
}

export function WorkspaceBackButton({ onClick, label = t("sidebar.home"), icon: Icon = House }: { onClick: () => void; label?: string; icon?: IconComponent }) {
  return <button className="icon-button pane-header-action workspace-home-button" type="button" onClick={onClick} title={label} aria-label={label}><Icon size={14} /></button>;
}

export function WorkspaceAgentPane({ label = t("workspace.agent"), title, actions, bodyRef, onScroll, children }: {
  label?: string;
  title?: ReactNode;
  actions: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  return <section className="agent-pane" aria-label={label}>
    <header className="pane-header window-drag-handle">
      <span className="workspace-navigation-drag-exclusion" aria-hidden="true" />
      {title}
      <div className="pane-header-actions">{actions}</div>
    </header>
    <div className="agent-body" ref={bodyRef} onScroll={onScroll}>{children}</div>
  </section>;
}

function readAgentWidth(): number {
  try {
    const stored = Number(localStorage.getItem(AGENT_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_AGENT_WIDTH ? stored : DEFAULT_AGENT_WIDTH;
  } catch { return DEFAULT_AGENT_WIDTH; }
}
function saveWidth(width: number) {
  try { localStorage.setItem(AGENT_WIDTH_STORAGE_KEY, String(width)); } catch { /* Layout still works without storage. */ }
}
function maximumWidth(width: number, sidePanelWidth = 0) {
  return Math.round(Math.max(
    MIN_AGENT_WIDTH,
    Math.min(width * 0.65, width - MIN_VIEWER_WIDTH - 5 - sidePanelWidth),
  ));
}

function storyPanelWidth(width: number, preferred: number | undefined, agentCollapsed: boolean) {
  return Math.max(MIN_STORY_WIDTH, Math.min(
    preferred ?? Math.min(620, Math.max(MIN_STORY_WIDTH, width * 0.38)),
    width - (agentCollapsed ? 0 : MIN_AGENT_WIDTH) - MIN_VIEWER_WIDTH - 5,
  ));
}
