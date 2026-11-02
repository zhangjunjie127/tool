import type { PlayableMotionConfig } from "./playable-motion.js";
import {
  playableStoryTreeSections,
  type PlayableStoryTree,
  type PlayableStoryTreeLink,
  type PlayableStoryTreeSection,
} from "./playable-story-tree.js";

export interface StoryTreeGenerationRoute extends PlayableStoryTreeLink {
  action?: PlayableStoryTreeSection["beats"][number];
}

/** Reserve explicit matches first, then bind remaining candidates in tree order. */
export function storyTreeGenerationRoutes(
  tree: PlayableStoryTree,
  section: PlayableStoryTreeSection,
): StoryTreeGenerationRoute[] {
  const sections = playableStoryTreeSections(tree);
  const actions = section.beats.filter(
    (beat) => beat.kind === "choice" || beat.kind === "operation",
  );
  const routes: StoryTreeGenerationRoute[] = tree.links
    .filter((link) => link.fromSectionId === section.id)
    .map((link) => ({ ...link }));
  const assigned = new Set<string>();
  for (const route of routes) {
    const action = storyTreeActionBeat(
      { ...section, beats: actions.filter((beat) => !assigned.has(beat.id)) },
      route.label,
      sections.find((item) => item.id === route.toSectionId)?.title,
      -1,
      -1,
    );
    if (action) {
      route.action = action;
      assigned.add(action.id);
    }
  }
  for (const route of routes) {
    if (route.action) continue;
    const action = actions.find((beat) => !assigned.has(beat.id));
    if (action) {
      route.action = action;
      assigned.add(action.id);
    }
  }
  for (const action of actions) {
    if (assigned.has(action.id)) continue;
    routes.push({
      id: `action-${action.id}`,
      fromSectionId: section.id,
      toSectionId: "",
      label: action.text.slice(0, 240),
      status: "suggested",
      action,
    });
  }
  return routes;
}

// Shared by generation and its read-only preview so the displayed bindings agree.
export function storyTreeActionBeat(
  section: PlayableStoryTreeSection,
  linkLabel: string,
  targetTitle: string | undefined,
  routeIndex: number,
  routeCount: number,
): PlayableStoryTreeSection["beats"][number] | undefined {
  const actions = section.beats.filter(
    (beat) => beat.kind === "choice" || beat.kind === "operation",
  );
  const routeLabels = [linkLabel, targetTitle]
    .filter((value): value is string => Boolean(value))
    .map(normalizeStoryActionText)
    .filter((value) => value && value !== "继续" && value !== "下一集");
  const matched = actions.find((beat) => {
    const text = normalizeStoryActionText(beat.text);
    return routeLabels.some(
      (label) => text.includes(label) || label.includes(text),
    );
  });
  if (matched) return matched;

  const choices = actions.filter((beat) => beat.kind === "choice");
  if (choices.length === routeCount) return choices[routeIndex];
  if (choices.length === 1 && routeCount === 1) return choices[0];

  const operations = actions.filter((beat) => beat.kind === "operation");
  if (choices.length) return undefined;
  if (operations.length === routeCount) return operations[routeIndex];
  if (operations.length === 1 && routeCount === 1) return operations[0];
  return undefined;
}

export function storyTreeOperationMotion(
  beat: PlayableStoryTreeSection["beats"][number],
  signal: string,
): PlayableMotionConfig | undefined {
  if (beat.kind !== "operation") return undefined;
  const text = beat.text;
  const timeLimit = Number(/(\d+(?:\.\d+)?)\s*(?:秒|s)\s*内/iu.exec(text)?.[1]);
  const hasTimeLimit = Number.isFinite(timeLimit) && timeLimit > 0;
  const parseSeconds = (fallback: number) => {
    const value = Number(
      /(?:长按|按住|持续按)[^，。；,;]{0,16}?(\d+(?:\.\d+)?)\s*(?:秒|s)/iu.exec(
        text,
      )?.[1],
    );
    return Math.max(
      0.1,
      Math.min(3600, Number.isFinite(value) && value > 0 ? value : fallback),
    );
  };
  const withSignal = (
    config: Omit<PlayableMotionConfig, "signal">,
  ): PlayableMotionConfig => ({
    ...config,
    signal,
  });

  if (/长按|按住|持续按/u.test(text)) {
    return withSignal({
      kind: "hold-charge",
      mode: "interactive",
      duration: parseSeconds(0.8),
      timeoutDuration: hasTimeLimit ? Math.min(3600, timeLimit) : 3600,
      interaction: "hold",
      feedback: "bounce-hover-press",
    });
  }
  if (/滑动|拖动|划动|滑向/u.test(text)) {
    const interaction: PlayableMotionConfig["interaction"] = /向左|左滑/u.test(
      text,
    )
      ? "swipe-left"
      : /向右|右滑/u.test(text)
        ? "swipe-right"
        : /向上|上滑/u.test(text)
          ? "swipe-up"
          : /向下|下滑/u.test(text)
            ? "swipe-down"
            : "swipe-any";
    return withSignal({
      kind: "swipe-button",
      mode: "interactive",
      duration: 0.8,
      timeoutDuration: hasTimeLimit ? Math.min(3600, timeLimit) : 3600,
      interaction,
    });
  }
  if (/连续点击|连点|点击\s*\d+\s*次/u.test(text)) {
    const requiredCount = Math.max(
      2,
      Math.min(20, Number(/(\d+)\s*次/u.exec(text)?.[1] ?? 3)),
    );
    return withSignal({
      kind: "button-feedback",
      mode: "interactive",
      duration: 1,
      timeoutDuration: hasTimeLimit ? Math.min(3600, timeLimit) : 3600,
      interaction: "multi-click",
      requiredCount,
      feedback: "bounce-hover-press",
    });
  }
  if (/双击/u.test(text)) {
    const duration = hasTimeLimit ? Math.min(3600, timeLimit) : 3;
    return withSignal({
      kind: "countdown",
      mode: "interactive",
      duration,
      timeoutDuration: hasTimeLimit ? duration : 3600,
      interaction: "double-click",
    });
  }
  if (/快速点击|快速点按/u.test(text)) {
    const duration = hasTimeLimit ? Math.min(3600, timeLimit) : 3;
    return withSignal({
      kind: "countdown",
      mode: "interactive",
      duration,
      timeoutDuration: hasTimeLimit ? duration : 3600,
      interaction: "quick-click",
    });
  }
  if (/限时|倒计时|QTE/u.test(text)) {
    const seconds = Number(/(\d+(?:\.\d+)?)\s*(?:秒|s)/iu.exec(text)?.[1]);
    const duration = Math.max(
      0.1,
      Math.min(3600, Number.isFinite(seconds) && seconds > 0 ? seconds : 3),
    );
    return withSignal({
      kind: "countdown",
      mode: "interactive",
      duration,
      timeoutDuration: duration,
      interaction: "click",
    });
  }
  return undefined;
}

function normalizeStoryActionText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(
      /^(?:选项|选择|操作)\s*(?:[a-z]\s*\d*|[一二三四五六七八九十\d]+)?\s*[:：、.．-]?\s*/u,
      "",
    )
    .replace(/[\s，。；、：:!！?？"'“”‘’（）()【】\[\]<>《》]/gu, "");
}
