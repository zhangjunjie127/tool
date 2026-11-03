// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../src/renderer/api.js";
import type { PlayableStoryTree } from "../src/shared/playable-story-tree.js";

const { tree } = vi.hoisted(() => ({
  tree: {
    version: 1,
    chapters: [
      {
        id: "chapter-1",
        title: "第一篇章",
        episodes: [
          {
            id: "episode-1",
            number: 1,
            title: "第一集",
            sections: [
              {
                id: "scene-1",
                episodeNumber: 1,
                sceneNumber: 1,
                title: "初遇",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [{ id: "beat-1", kind: "plot", text: "主角发现一封信" }],
                scriptText: "",
                sourceSnapshot: {
                  heading: "初遇",
                  body: "",
                  title: "初遇",
                  beats: [],
                },
              },
              {
                id: "scene-2",
                episodeNumber: 1,
                sceneNumber: 2,
                title: "分支后果",
                kind: "branch",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceSnapshot: {
                  heading: "分支后果",
                  body: "",
                  title: "分支后果",
                  beats: [],
                },
              },
            ],
          },
          {
            id: "episode-2",
            number: 2,
            title: "第二集",
            sections: [
              {
                id: "scene-3",
                episodeNumber: 2,
                sceneNumber: 1,
                title: "尾声",
                kind: "ending",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceSnapshot: {
                  heading: "尾声",
                  body: "",
                  title: "尾声",
                  beats: [],
                },
              },
            ],
          },
        ],
      },
    ],
    links: [
      {
        id: "link-1",
        fromSectionId: "scene-1",
        toSectionId: "scene-2",
        label: "相信来信",
        status: "confirmed",
      },
    ],
  } satisfies PlayableStoryTree,
}));

import { PlayableStoryTreePanel } from "../src/renderer/playable-story-tree-panel.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
let scrollIntoViewDescriptor: PropertyDescriptor | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  if (scrollIntoViewDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollIntoViewDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  scrollIntoViewDescriptor = undefined;
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(api, "listLibraryAssets").mockResolvedValue([]);
});

it("keeps chapters and the read-only story tree visible side by side", async () => {
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  expect(host.querySelectorAll(".story-tree-pane")).toHaveLength(2);
  expect(host.querySelector(".story-tree-chapters-pane")).toBeTruthy();
  expect(host.querySelector(".story-tree-outline-pane")).toBeTruthy();
  expect(host.querySelector(".story-tree-chapters-pane")?.textContent).not.toContain("待生成");
  expect(host.querySelector(".story-tree-outline-pane")?.textContent).toContain("待生成");
  expect(host.querySelector('[role="tab"]')).toBeNull();
  expect(host.querySelector(".story-tree-outline")).toBeTruthy();
  expect(host.querySelector(".story-tree-editor")).toBeNull();
  expect(host.querySelector(".story-tree-actions")).toBeNull();
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.textContent).toContain("主角发现一封信");
  expect(host.textContent).toContain("相信来信");
  expect(host.textContent).toContain("分支后果");
  expect(host.textContent).toContain("尾声");
  expect(host.textContent).toContain("缺少入线");
  expect(host.textContent).toContain("缺少出线");
  expect(host.querySelector(".story-tree-sync-status")?.textContent).toContain(
    "2 个场景缺少连线",
  );
  expect(
    [...host.querySelector(".story-tree-chapter-summary")!.children]
      .filter((child) =>
        child.matches(
          ".story-tree-inline-name-editor, .story-tree-row-delete",
        ),
      )
      .map((child) =>
        child.classList.contains("story-tree-row-delete")
          ? "delete"
          : "name",
      ),
  ).toEqual(["name", "delete"]);
  expect(
    [
      ...host
        .querySelector(".story-tree-chapter-summary .story-tree-inline-name-editor")!
        .children,
    ]
      .filter((child) =>
        child.matches(
          ".story-tree-inline-name-display, .story-tree-row-count, .story-tree-inline-name-edit",
        ),
      )
      .map((child) =>
        child.classList.contains("story-tree-row-count")
            ? "count"
            : child.classList.contains("story-tree-inline-name-edit")
              ? "edit"
              : "name",
      ),
  ).toEqual(["name", "count", "edit"]);

  const episodeToggles = host.querySelectorAll<HTMLButtonElement>(
    ".story-tree-outline-heading.is-episode",
  );
  expect(episodeToggles).toHaveLength(2);
  expect(episodeToggles[0]?.getAttribute("aria-expanded")).toBe("true");
  expect(episodeToggles[1]?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => episodeToggles[0]?.click());

  expect(episodeToggles[0]?.getAttribute("aria-expanded")).toBe("false");
  expect(host.textContent).not.toContain("主角发现一封信");
  expect(host.textContent).toContain("尾声");

  await act(async () => episodeToggles[0]?.click());
  const branchToggle = host.querySelector<HTMLButtonElement>(
    ".story-tree-outline-heading.is-branch-group",
  );
  expect(branchToggle?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => branchToggle?.click());
  expect(branchToggle?.getAttribute("aria-expanded")).toBe("false");
  await act(async () => branchToggle?.click());
  expect(branchToggle?.getAttribute("aria-expanded")).toBe("true");
});

it("shows one script import button when the story tree is empty", async () => {
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: { version: 1, chapters: [], links: [] },
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  expect(host.querySelectorAll(".story-tree-empty button")).toHaveLength(1);
});

it("confirms and saves a suggested story-tree route", async () => {
  const suggestedTree: PlayableStoryTree = structuredClone(tree);
  suggestedTree.chapters[0]!.episodes[0]!.sections[1]!.kind = "scene";
  suggestedTree.links[0]!.status = "suggested";
  suggestedTree.links[0]!.sourceSnapshot = {
    fromSectionId: suggestedTree.links[0]!.fromSectionId,
    toSectionId: suggestedTree.links[0]!.toSectionId,
    label: suggestedTree.links[0]!.label,
    status: "suggested",
  };
  const confirmedTree: PlayableStoryTree = structuredClone(suggestedTree);
  confirmedTree.links[0]!.status = "confirmed";
  const save = vi.spyOn(api, "savePlayableStoryTree").mockResolvedValue({
    tree: confirmedTree,
    revision: "revision-2",
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: suggestedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const confirmButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.includes("确认连线"));
  expect(confirmButton).toBeDefined();
  expect(host.querySelector(".story-tree-warning")).not.toBeNull();
  await act(async () => {
    confirmButton?.click();
    await Promise.resolve();
  });
  expect(host.querySelector(".story-tree-warning")).toBeNull();
  expect(host.textContent).toContain("已确认");
  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "路线已确认",
  );

  const saveButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.includes("保存剧情树"));
  await act(async () => {
    saveButton?.click();
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledWith("project-1", confirmedTree, "revision-1");
});

it("locates the matching chapter scene when a route warning is clicked", async () => {
  const suggestedTree: PlayableStoryTree = structuredClone(tree);
  suggestedTree.links[0]!.status = "suggested";
  const scrollIntoView = vi.fn();
  scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: suggestedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const routeWarning = host.querySelector<HTMLButtonElement>(
    ".story-tree-warning",
  );
  expect(routeWarning?.classList.contains("is-error")).toBe(true);
  expect(routeWarning?.closest(".story-tree-outline-pane")).not.toBeNull();
  expect(routeWarning?.closest(".story-tree-chapters-pane")).toBeNull();

  const chapter = host.querySelector<HTMLDetailsElement>(
    ".story-tree-chapter-list > details",
  );
  const episode = chapter?.querySelector<HTMLDetailsElement>(
    ".story-tree-episode",
  );
  await act(async () => chapter?.querySelector("summary")?.click());
  await act(async () => episode?.querySelector("summary")?.click());
  expect(chapter?.open).toBe(false);
  expect(episode?.open).toBe(false);

  await act(async () => {
    host?.querySelector<HTMLButtonElement>(".story-tree-warning")?.click();
  });

  expect(chapter?.open).toBe(true);
  expect(episode?.open).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>(
      '.story-tree-section-select[aria-pressed="true"]',
    )?.textContent,
  ).toContain("初遇");
  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "center",
  });
});

it("removes the unnamed chapter warning after its name is corrected", async () => {
  const unnamedTree: PlayableStoryTree = structuredClone(tree);
  unnamedTree.chapters[0]!.title = "待命名篇章";
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: unnamedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const unnamedWarning = [...host.querySelectorAll<HTMLButtonElement>(
    ".story-tree-warning",
  )].find((button) => button.textContent?.includes("篇章边界"));
  expect(unnamedWarning).toBeTruthy();
  await act(async () => unnamedWarning?.click());
  const input = host.querySelector<HTMLInputElement>(
    '.story-tree-chapter-summary input[aria-label="编辑篇章名称"]',
  );
  expect(input).toBeTruthy();
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "第一篇章");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input?.blur());

  expect(
    [...host.querySelectorAll(".story-tree-warning")].some((button) =>
      button.textContent?.includes("篇章边界"),
    ),
  ).toBe(false);
});

it("shows authored choice text instead of a generic next-episode route", async () => {
  const choiceTree: PlayableStoryTree = structuredClone(tree);
  const source = choiceTree.chapters[0]!.episodes[0]!.sections[0]!;
  const firstTarget = choiceTree.chapters[0]!.episodes[0]!.sections[1]!;
  const secondTarget = choiceTree.chapters[0]!.episodes[1]!.sections[0]!;
  const thirdTarget = structuredClone(secondTarget);
  thirdTarget.id = "scene-4";
  thirdTarget.sceneNumber = 2;
  thirdTarget.title = "C分支";
  choiceTree.chapters[0]!.episodes[1]!.sections.push(thirdTarget);
  firstTarget.title = "当场拆穿";
  source.beats = [
    { id: "choice-a", kind: "choice", text: "选项一：【当场拆穿】" },
    { id: "choice-b", kind: "choice", text: "选项二：【默默离开】" },
    { id: "choice-c", kind: "choice", text: "选项三：【以身入局】" },
  ];
  choiceTree.links = [
    {
      id: "choice-route-a",
      fromSectionId: source.id,
      toSectionId: firstTarget.id,
      label: "下一集",
      status: "suggested",
    },
    {
      id: "choice-route-b",
      fromSectionId: source.id,
      toSectionId: secondTarget.id,
      label: "默默离开",
      status: "suggested",
    },
    {
      id: "choice-route-c",
      fromSectionId: source.id,
      toSectionId: thirdTarget.id,
      label: "C分支",
      status: "suggested",
    },
  ];
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: choiceTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const outlineText = host.querySelector(".story-tree-outline")?.textContent;
  expect(outlineText).toContain("A_当场拆穿");
  expect(outlineText).toContain("B_默默离开");
  expect(outlineText).toContain("C_以身入局");
  expect(outlineText).not.toContain("A_下一集");
});

it("aligns episode row actions and detaches linked scenes when deleting an episode", async () => {
  const treeWithCanvasScene = structuredClone(tree);
  Object.assign(
    treeWithCanvasScene.chapters[0]!.episodes[0]!.sections[0]!,
    { canvasNodeId: "canvas-scene-1" },
  );
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: treeWithCanvasScene,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const firstEpisode = host.querySelector(".story-tree-episode > summary")!;
  expect(firstEpisode.querySelector("small")?.textContent).toBe("2");
  expect(
    [...firstEpisode.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    ),
  ).toEqual(["编辑集数名称", "删除集数"]);
  expect(
    [
      ...firstEpisode.querySelector(".story-tree-inline-name-editor")!.children,
    ]
      .filter((child) =>
        child.matches(
          ".story-tree-inline-name-display, .story-tree-row-count, .story-tree-inline-name-edit",
        ),
      )
      .map((child) =>
        child.classList.contains("story-tree-row-count")
          ? "count"
          : child.classList.contains("story-tree-inline-name-edit")
            ? "edit"
            : "name",
      ),
  ).toEqual(["name", "count", "edit"]);

  await act(async () => {
    firstEpisode
      .querySelector<HTMLButtonElement>('[aria-label="删除集数"]')
      ?.click();
  });

  expect(host.querySelectorAll(".story-tree-episode")).toHaveLength(1);
  expect(host.textContent).toContain("待解绑的画布节点");
  expect(host.textContent).toContain("初遇");
  expect(host.querySelector(".story-tree-sync-status")?.textContent).toContain(
    "1 个节点待解绑",
  );
});

it("adds a scene delete action and detaches its linked canvas node", async () => {
  const treeWithCanvasScene = structuredClone(tree);
  Object.assign(
    treeWithCanvasScene.chapters[0]!.episodes[0]!.sections[0]!,
    { canvasNodeId: "canvas-scene-1" },
  );
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: treeWithCanvasScene,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const firstScene = host.querySelector(".story-tree-section-entry")!;
  expect(
    [...firstScene.children]
      .filter((child) =>
        child.matches(".story-tree-inline-name-editor, .story-tree-row-delete"),
      )
      .map((child) =>
        child.classList.contains("story-tree-row-delete")
          ? "delete"
          : "name",
      ),
  ).toEqual(["name", "delete"]);
  expect(
    [
      ...firstScene.querySelector(".story-tree-inline-name-editor")!.children,
    ]
      .filter((child) =>
        child.matches(
          ".story-tree-section-select, .story-tree-row-count, .story-tree-inline-name-edit",
        ),
      )
      .map((child) =>
        child.classList.contains("story-tree-row-count")
          ? "count"
          : child.classList.contains("story-tree-inline-name-edit")
            ? "edit"
            : "name",
      ),
  ).toEqual(["name", "count", "edit"]);

  await act(async () => {
    firstScene
      .querySelector<HTMLButtonElement>('[aria-label="从剧情树移除场景"]')
      ?.click();
  });

  expect(host.querySelectorAll(".story-tree-section-entry")).toHaveLength(2);
  expect(host.querySelectorAll(".story-tree-detached-scenes > div")).toHaveLength(
    1,
  );
  expect(host.querySelector(".story-tree-detached-scenes")?.textContent).toContain(
    "初遇",
  );
  expect(host.querySelector(".story-tree-sync-status")?.textContent).toContain(
    "1 个节点待解绑",
  );
});

it("previews AI analysis differences and saves only after confirmation", async () => {
  const nextTree = structuredClone(tree);
  nextTree.chapters[0]!.episodes[0]!.sections[0]!.objective = "找到信件来源";
  const analyze = vi.spyOn(api, "analyzePlayableStoryTree").mockResolvedValue({
    tree: nextTree,
    revision: "revision-1",
    analyzedSections: 1,
  });
  const save = vi.spyOn(api, "savePlayableStoryTree").mockResolvedValue({
    tree: nextTree,
    revision: "revision-2",
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        model: { provider: "test-gateway", id: "gpt-5.6-terra" },
      }),
    );
    await Promise.resolve();
  });

  const analyzeButton = host.querySelector<HTMLButtonElement>(
    ".story-tree-chapter-footer .is-primary",
  );
  await act(async () => {
    analyzeButton?.click();
    await Promise.resolve();
  });

  expect(analyze).toHaveBeenCalledWith("project-1", tree, "revision-1", {
    provider: "test-gateway",
    id: "gpt-5.6-terra",
  });
  expect(host.querySelector(".story-tree-analysis-preview")?.textContent)
    .toContain("找到信件来源");
  expect(save).not.toHaveBeenCalled();

  const applyButton = host.querySelector<HTMLButtonElement>(
    ".story-tree-analysis-actions .is-primary",
  );
  await act(async () => {
    applyButton?.click();
    await Promise.resolve();
  });

  expect(save).toHaveBeenCalledWith("project-1", nextTree, "revision-1");
  expect(host.textContent).toContain("剧情树已更新");
});

it("explains when there are no scenes to generate", async () => {
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: { version: 1, chapters: [], links: [] },
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  expect(generateButton?.disabled).toBe(false);
  await act(async () => generateButton?.click());

  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "还没有场景",
  );
});

it("explains when all story-tree scenes already have canvas nodes", async () => {
  const generatedTree: PlayableStoryTree = structuredClone(tree);
  generatedTree.chapters.forEach((chapter) =>
    chapter.episodes.forEach((episode) =>
      episode.sections.forEach((section, index) => {
        section.canvasNodeId = `canvas-node-${index}`;
      }),
    ),
  );
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: generatedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  expect(generateButton?.disabled).toBe(false);
  await act(async () => generateButton?.click());

  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "都已生成",
  );
});

it("treats deleted canvas nodes as pending generation", async () => {
  const previouslyLinkedTree: PlayableStoryTree = structuredClone(tree);
  previouslyLinkedTree.chapters.forEach((chapter, chapterIndex) =>
    chapter.episodes.forEach((episode, episodeIndex) =>
      episode.sections.forEach((section, sectionIndex) => {
        section.canvasNodeId = `old-node-${chapterIndex}-${episodeIndex}-${sectionIndex}`;
      }),
    ),
  );
  const existingCanvasNodeIds = previouslyLinkedTree.chapters.flatMap((chapter) =>
    chapter.episodes.flatMap((episode) =>
      episode.sections.map((section) => section.canvasNodeId!),
    ),
  );
  const sync = vi.spyOn(api, "syncPlayableStoryTree").mockResolvedValue({
    applied: true,
    tree: previouslyLinkedTree,
    revision: "revision-2",
    addedNodes: 3,
    addedVideos: 0,
    skippedVideoAssignments: 0,
    updatedNodes: 0,
    pendingLinks: 0,
    confirmations: [],
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: previouslyLinkedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        canvasNodeIds: existingCanvasNodeIds,
      }),
    );
    await Promise.resolve();
  });

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        canvasNodeIds: [],
      }),
    );
  });

  expect(host.querySelector(".story-tree-sync-status")?.textContent).toContain(
    "3 个场景待生成",
  );
  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  await act(async () => {
    generateButton?.click();
    await Promise.resolve();
  });

  expect(sync).toHaveBeenCalledWith(
    "project-1",
    previouslyLinkedTree,
    "revision-1",
    false,
    "generate",
  );
  expect(host.querySelector(".story-tree-generation-preview")).toBeNull();
});

it("focuses the linked canvas node when a story-tree scene is selected", async () => {
  const linkedTree: PlayableStoryTree = structuredClone(tree);
  linkedTree.chapters[0]!.episodes[0]!.sections[1]!.canvasNodeId = "canvas-scene-2";
  const onCanvasNodeSelect = vi.fn();
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: linkedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        canvasNodeIds: ["canvas-scene-2"],
        onCanvasNodeSelect,
      }),
    );
    await Promise.resolve();
  });

  const scene = [...host.querySelectorAll<HTMLButtonElement>(
    ".story-tree-outline-scene",
  )].find((button) => button.textContent?.includes("分支后果"));
  await act(async () => scene?.click());

  expect(onCanvasNodeSelect).toHaveBeenCalledWith("canvas-scene-2");
});

it("focuses and expands the matching story-tree scene when its canvas node is selected", async () => {
  const linkedTree: PlayableStoryTree = structuredClone(tree);
  linkedTree.chapters[0]!.episodes[0]!.sections[1]!.canvasNodeId =
    "canvas-scene-2";
  const scrollIntoView = vi.fn();
  scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree: linkedTree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const episodeHeading = host.querySelector<HTMLButtonElement>(
    ".story-tree-outline-heading.is-episode",
  );
  const branchHeading = host.querySelector<HTMLButtonElement>(
    ".story-tree-outline-heading.is-branch-group",
  );
  expect(episodeHeading?.getAttribute("aria-expanded")).toBe("true");
  expect(branchHeading?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => branchHeading?.click());
  await act(async () => episodeHeading?.click());
  expect(episodeHeading?.getAttribute("aria-expanded")).toBe("false");
  expect(branchHeading?.isConnected).toBe(false);

  const chapter = host.querySelector<HTMLDetailsElement>(
    ".story-tree-chapter-list > details",
  );
  const chapterEpisode = chapter?.querySelector<HTMLDetailsElement>(
    ".story-tree-episode",
  );
  await act(async () => chapterEpisode?.querySelector("summary")?.click());
  await act(async () => chapter?.querySelector("summary")?.click());
  expect(chapter?.open).toBe(false);
  expect(chapterEpisode?.open).toBe(false);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        canvasNodeSelection: {
          sequence: 1,
          nodeId: "canvas-scene-2",
        },
      }),
    );
  });

  const selectedScene = [...host.querySelectorAll<HTMLButtonElement>(
    ".story-tree-outline-scene",
  )].find((button) => button.textContent?.includes("分支后果"));
  const expandedEpisodeHeading = host.querySelector<HTMLButtonElement>(
    ".story-tree-outline-heading.is-episode",
  );
  const expandedBranchHeading = host.querySelector<HTMLButtonElement>(
    ".story-tree-outline-heading.is-branch-group",
  );
  expect(selectedScene?.classList.contains("is-selected")).toBe(true);
  expect(expandedEpisodeHeading?.getAttribute("aria-expanded")).toBe("true");
  expect(expandedBranchHeading?.getAttribute("aria-expanded")).toBe("true");
  expect(chapter?.open).toBe(true);
  expect(chapterEpisode?.open).toBe(true);
  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "center",
  });
});

it("generates directly and automatically matches videos without a setup preview", async () => {
  const beforeSync = vi.fn(async () => {});
  const canvasSyncComplete = vi.fn();
  const canvasSyncProgressChange = vi.fn();
  const sync = vi.spyOn(api, "syncPlayableStoryTree").mockResolvedValue({
    applied: true,
    tree,
    revision: "revision-2",
    addedNodes: 3,
    addedVideos: 1,
    skippedVideoAssignments: 0,
    updatedNodes: 0,
    pendingLinks: 0,
    confirmations: [],
  });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  vi.spyOn(api, "listLibraryAssets").mockResolvedValue([
    {
      id: "video-first-scene",
      name: "序章_第1集_初遇.mp4",
      size: 1024,
      mediaType: "video",
      contentType: "video/mp4",
      createdAt: "2026-01-01T00:00:00.000Z",
      purpose: "asset",
      projects: [],
      referenceOnly: false,
    },
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
        onBeforeSync: beforeSync,
        onCanvasSyncComplete: canvasSyncComplete,
        onCanvasSyncProgressChange: canvasSyncProgressChange,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  await act(async () => {
    generateButton?.click();
    await Promise.resolve();
  });

  expect(host.querySelector(".story-tree-generation-preview")).toBeNull();
  expect(sync).toHaveBeenCalledWith(
    "project-1",
    tree,
    "revision-1",
    false,
    "generate",
    undefined,
    { "scene-1": "video-first-scene" },
  );
  expect(beforeSync).toHaveBeenCalledOnce();
  expect(beforeSync.mock.invocationCallOrder[0]).toBeLessThan(
    sync.mock.invocationCallOrder[0]!,
  );
  expect(canvasSyncComplete).toHaveBeenCalledOnce();
  expect(canvasSyncProgressChange.mock.calls).toEqual([
    ["generate"],
    [undefined],
  ]);
  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "已生成 3 个画布节点",
  );
  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "添加 1 个背景视频",
  );
});

it("does not generate nodes when the Library scan fails", async () => {
  const sync = vi.spyOn(api, "syncPlayableStoryTree");
  vi.spyOn(api, "listLibraryAssets").mockRejectedValue(
    new Error("Library unavailable"),
  );
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  await act(async () => {
    generateButton?.click();
    await Promise.resolve();
  });

  expect(sync).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "未开始生成节点",
  );
});

it("keeps automatically matched videos when node changes need confirmation", async () => {
  const sync = vi.spyOn(api, "syncPlayableStoryTree")
    .mockResolvedValueOnce({
      applied: false,
      revision: "revision-1",
      addedNodes: 0,
      addedVideos: 0,
      skippedVideoAssignments: 0,
      updatedNodes: 0,
      pendingLinks: 0,
      confirmations: [
        { nodeId: "canvas-scene-1", title: "初遇", changes: ["Story-tree scene content will be updated."] },
      ],
    })
    .mockResolvedValueOnce({
      applied: true,
      tree,
      revision: "revision-2",
      addedNodes: 3,
      addedVideos: 1,
      skippedVideoAssignments: 0,
      updatedNodes: 0,
      pendingLinks: 0,
      confirmations: [],
    });
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  vi.spyOn(api, "listLibraryAssets").mockResolvedValue([
    {
      id: "video-first-scene",
      name: "序章_第1集_初遇.mp4",
      size: 1024,
      mediaType: "video",
      contentType: "video/mp4",
      createdAt: "2026-01-01T00:00:00.000Z",
      purpose: "asset",
      projects: [],
      referenceOnly: false,
    },
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  await act(async () => {
    generateButton?.click();
    await Promise.resolve();
  });

  const confirm = host.querySelector<HTMLButtonElement>(
    ".story-tree-confirmation button",
  );
  await act(async () => {
    confirm?.click();
    await Promise.resolve();
  });

  expect(sync).toHaveBeenNthCalledWith(
    1,
    "project-1",
    tree,
    "revision-1",
    false,
    "generate",
    undefined,
    { "scene-1": "video-first-scene" },
  );
  expect(sync).toHaveBeenNthCalledWith(
    2,
    "project-1",
    tree,
    "revision-1",
    true,
    "generate",
    undefined,
    { "scene-1": "video-first-scene" },
  );
  expect(api.listLibraryAssets).toHaveBeenCalledOnce();
  expect(host.querySelector(".story-tree-notice")?.textContent).toContain(
    "添加 1 个背景视频",
  );
});

it("shows a direct generation error when canvas synchronization fails", async () => {
  vi.spyOn(api, "syncPlayableStoryTree").mockRejectedValue(
    new Error("无法写入画布节点"),
  );
  vi.spyOn(api, "getPlayableStoryTree").mockResolvedValue({
    tree,
    revision: "revision-1",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      createElement(PlayableStoryTreePanel, {
        projectId: "project-1",
        visible: true,
      }),
    );
    await Promise.resolve();
  });

  const generateButton = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("生成节点"),
  );
  await act(async () => {
    generateButton?.click();
    await Promise.resolve();
  });

  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "无法写入画布节点",
  );
});
