// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlayableStoryTreeOutline } from "../src/renderer/playable-story-tree-outline.js";
import type { PlayableStoryTree } from "../src/shared/playable-story-tree.js";

it("renders the read-only story flow and linked branch destinations", () => {
  const tree: PlayableStoryTree = {
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
                objective: "找到线索",
                prerequisite: "完成开场",
                beats: [
                  { id: "beat-1", kind: "plot", text: "主角发现一封信" },
                  { id: "operation-1", kind: "operation", text: "长按查看线索" },
                ],
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
                beats: [
                  {
                    id: "beat-2",
                    kind: "plot",
                    text: "尚未选中时隐藏的分支正文",
                  },
                ],
                scriptText: "",
                sourceSnapshot: {
                  heading: "分支后果",
                  body: "",
                  title: "分支后果",
                  beats: [],
                },
              },
              {
                id: "scene-3",
                episodeNumber: 1,
                sceneNumber: 3,
                title: "已从剧本删除的场景",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceRemoved: true,
                sourceSnapshot: {
                  heading: "已从剧本删除的场景",
                  body: "",
                  title: "已从剧本删除的场景",
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
        status: "suggested",
      },
      {
        id: "link-1b",
        fromSectionId: "scene-1",
        toSectionId: "scene-2",
        label: "拒绝来信",
        status: "suggested",
      },
      {
        id: "link-2",
        fromSectionId: "scene-1",
        toSectionId: "scene-3",
        label: "已删除去向",
        status: "suggested",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(PlayableStoryTreeOutline, {
      tree,
      selectedSectionId: "scene-1",
      onSelectSection: () => undefined,
    }),
  );

  expect(markup).toContain("story-tree-outline-children");
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain("第一篇章");
  expect(markup).toContain("第一集");
  expect(markup).toContain("story-tree-interaction-marker");
  expect(markup).toContain("互动");
  expect(markup).toContain('aria-expanded="true"');
  expect(markup).toContain("初遇");
  expect(markup).toContain("找到线索");
  expect(markup).toContain("主角发现一封信");
  expect(markup).toContain("相信来信");
  expect(markup).toContain("A_相信来信");
  expect(markup).toContain("B_拒绝来信");
  expect(
    markup.match(/<small class="is-pending-route">待确认<\/small>/g),
  ).toHaveLength(2);
  expect(markup).toContain("分支后果");
  expect(markup).not.toContain("尚未选中时隐藏的分支正文");
  expect(markup).not.toContain("已从剧本删除的场景");
  expect(markup).not.toContain("已删除去向");
});

it("groups long fixed-plot runs while keeping choices and routes visible", () => {
  const tree: PlayableStoryTree = {
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
                title: "木屋",
                kind: "scene",
                objective: "确认苏尘已学成",
                prerequisite: "苏尘练习十二年",
                beats: [
                  { id: "plot-1", kind: "plot", text: "九儿姐抛出铜钱。" },
                  { id: "plot-2", kind: "plot", text: "苏尘准确说出年号。" },
                  { id: "plot-3", kind: "plot", text: "九儿姐告知苏尘父母死因。" },
                  { id: "plot-4", kind: "plot", text: "苏尘决定下山历练。" },
                  { id: "operation-1", kind: "operation", text: "长按查看信件" },
                  { id: "choice-1", kind: "choice", text: "选择是否追问仇人。" },
                  { id: "choice-2", kind: "choice", text: "选择是否告知九儿姐。" },
                ],
                scriptText: "",
                sourceSnapshot: {
                  heading: "木屋",
                  body: "",
                  title: "木屋",
                  beats: [],
                },
              },
              {
                id: "scene-2",
                episodeNumber: 1,
                sceneNumber: 2,
                title: "古玩市场",
                kind: "branch",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceSnapshot: {
                  heading: "古玩市场",
                  body: "",
                  title: "古玩市场",
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
        label: "下山历练",
        status: "suggested",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(PlayableStoryTreeOutline, {
      tree,
      selectedSectionId: "scene-1",
      onSelectSection: () => undefined,
    }),
  );

  expect(markup).toContain('class="story-tree-outline-beat-group"');
  expect(markup).toContain("4段");
  expect(markup).toContain("九儿姐抛出铜钱。");
  expect(markup).toContain("选择是否追问仇人。");
  expect(markup).toContain("A_选择是否追问仇人。");
  expect(markup).toContain("B_选择是否告知九儿姐。");
  expect(markup).toContain(
    'class="story-tree-outline-leaf story-tree-outline-beat is-operation"',
  );
  expect(markup).toContain("下山历练");
  expect(markup).not.toContain("A_下山历练");
  expect(markup).not.toMatch(/<details class="story-tree-outline-beat-group" open>/);
});

it("marks episodes whose confirmed story-tree routes are missing from the canvas", () => {
  const tree: PlayableStoryTree = {
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
                title: "开场",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                canvasNodeId: "node-1",
                sourceSnapshot: {
                  heading: "开场",
                  body: "",
                  title: "开场",
                  beats: [],
                },
              },
              {
                id: "scene-2",
                episodeNumber: 1,
                sceneNumber: 2,
                title: "结局",
                kind: "ending",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                canvasNodeId: "node-2",
                sourceSnapshot: {
                  heading: "结局",
                  body: "",
                  title: "结局",
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
                title: "孤立场景",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                canvasNodeId: "node-3",
                sourceSnapshot: {
                  heading: "孤立场景",
                  body: "",
                  title: "孤立场景",
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
        id: "route-1",
        fromSectionId: "scene-1",
        toSectionId: "scene-2",
        label: "继续",
        status: "confirmed",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(PlayableStoryTreeOutline, {
      tree,
      selectedSectionId: "scene-1",
      onSelectSection: () => undefined,
      canvasNodeIds: ["node-1", "node-2", "node-3"],
      canvasEdges: [],
    }),
  );

  expect(markup).toContain(
    'class="story-tree-episode-warning" role="img"',
  );
  expect(markup).toContain("1 条确认路线尚未连接到画布");
  expect(markup).toContain("第二集");
  expect(markup).toContain("1 个场景缺少入线");
  expect(markup).toContain("1 个场景缺少出线");
  expect(markup).not.toContain("story-tree-interaction-marker");
});

it("does not warn about a connected route or an ending without an outgoing route", () => {
  const tree: PlayableStoryTree = {
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
                title: "开场",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                canvasNodeId: "node-1",
                sourceSnapshot: {
                  heading: "开场",
                  body: "",
                  title: "开场",
                  beats: [],
                },
              },
              {
                id: "scene-2",
                episodeNumber: 1,
                sceneNumber: 2,
                title: "结局",
                kind: "ending",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                canvasNodeId: "node-2",
                sourceSnapshot: {
                  heading: "结局",
                  body: "",
                  title: "结局",
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
        id: "route-1",
        fromSectionId: "scene-1",
        toSectionId: "scene-2",
        label: "继续",
        status: "confirmed",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(PlayableStoryTreeOutline, {
      tree,
      selectedSectionId: "scene-1",
      onSelectSection: () => undefined,
      canvasNodeIds: ["node-1", "node-2"],
      canvasEdges: [
        {
          sourceNodeId: "node-1",
          sourceSignalId: "next",
          targetNodeId: "node-2",
        },
      ],
    }),
  );

  expect(markup).not.toContain("story-tree-episode-warning");
});

it("marks suggested routes for confirmation without calling them failed canvas edges", () => {
  const tree: PlayableStoryTree = {
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
                title: "开场",
                kind: "scene",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceSnapshot: {
                  heading: "开场",
                  body: "",
                  title: "开场",
                  beats: [],
                },
              },
              {
                id: "scene-2",
                episodeNumber: 1,
                sceneNumber: 2,
                title: "结局",
                kind: "ending",
                objective: "",
                prerequisite: "",
                beats: [],
                scriptText: "",
                sourceSnapshot: {
                  heading: "结局",
                  body: "",
                  title: "结局",
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
        id: "route-1",
        fromSectionId: "scene-1",
        toSectionId: "scene-2",
        label: "继续",
        status: "suggested",
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(PlayableStoryTreeOutline, {
      tree,
      onSelectSection: () => undefined,
      canvasNodeIds: [],
      canvasEdges: [],
    }),
  );

  expect(markup).toContain("1 条路线待确认");
  expect(markup).not.toContain("确认路线尚未连接到画布");
});
