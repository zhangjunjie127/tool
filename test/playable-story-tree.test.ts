import { describe, expect, it } from "vitest";
import {
  diffPlayableStoryTrees,
  formatPlayableStoryTreeMarkdown,
  isPlayableStoryTree,
  parseScreenplayText,
  playableStoryTreeEpisodeHasInteraction,
  playableStoryTreeSections,
  reconcilePlayableStoryTree,
  removePlayableStoryTreeEpisode,
} from "../src/shared/playable-story-tree.js";

describe("playable story tree", () => {
  it("marks episodes that contain player operations, choices, or branching exits", () => {
    const parsedActions = parseScreenplayText([
      "第1集",
      "1-1 操作场景",
      "长按按钮积蓄力量",
      "点击道具查看详情",
      "第2集",
      "2-1 普通场景",
      "角色继续前进",
    ], "screenplay.txt").tree;
    const [parsedInteractiveEpisode] = parsedActions.chapters[0]!.episodes;
    expect(parsedInteractiveEpisode!.sections[0]!.beats.map((beat) => beat.kind))
      .toEqual(["operation", "operation"]);
    expect(playableStoryTreeEpisodeHasInteraction(
      parsedInteractiveEpisode!,
      parsedActions.links,
    )).toBe(true);

    const tree = parseScreenplayText([
      "第1集",
      "1-1 操作场景",
      "固定剧情",
      "1-2 选择场景",
      "固定剧情",
      "第2集",
      "2-1 普通场景",
      "固定剧情",
    ], "screenplay.txt").tree;
    const [interactiveEpisode, plainEpisode] = tree.chapters[0]!.episodes;
    const operationScene = interactiveEpisode!.sections[0]!;

    operationScene.beats = [
      { id: "operation", kind: "operation", text: "长按查看线索" },
    ];
    expect(playableStoryTreeEpisodeHasInteraction(interactiveEpisode!, tree.links))
      .toBe(true);

    operationScene.beats = [
      { id: "choice", kind: "choice", text: "选择是否追问" },
    ];
    expect(playableStoryTreeEpisodeHasInteraction(interactiveEpisode!, tree.links))
      .toBe(true);

    operationScene.beats = [{ id: "plot", kind: "plot", text: "发生一件事" }];
    tree.links.push(
      {
        id: "choice-a",
        fromSectionId: operationScene.id,
        toSectionId: interactiveEpisode!.sections[1]!.id,
        label: "选择A",
        status: "suggested",
      },
      {
        id: "choice-b",
        fromSectionId: operationScene.id,
        toSectionId: interactiveEpisode!.sections[1]!.id,
        label: "选择B",
        status: "suggested",
      },
    );
    expect(playableStoryTreeEpisodeHasInteraction(interactiveEpisode!, tree.links))
      .toBe(true);
    expect(playableStoryTreeEpisodeHasInteraction(plainEpisode!, tree.links))
      .toBe(false);
  });

  it("removes an episode while retaining linked canvas scenes for detaching", () => {
    const tree = parseScreenplayText([
      "第1篇章，第一篇",
      "第1集",
      "1-1 起点",
      "开始",
      "1-2 分支",
      "继续",
      "第2集",
      "2-1 后续",
      "结束",
    ], "screenplay.txt").tree;
    const chapter = tree.chapters[0]!;
    const [removedEpisode, remainingEpisode] = chapter.episodes;
    const linkedScene = removedEpisode!.sections[0]!;
    const unlinkedScene = removedEpisode!.sections[1]!;
    linkedScene.canvasNodeId = "canvas-start";
    tree.links.push({
      id: "route-to-removed-episode",
      fromSectionId: remainingEpisode!.sections[0]!.id,
      toSectionId: linkedScene.id,
      label: "回到起点",
      status: "confirmed",
    });

    const updated = removePlayableStoryTreeEpisode(
      tree,
      chapter.id,
      removedEpisode!.id,
    );
    const remainingSections = playableStoryTreeSections(updated);

    expect(updated.chapters[0]?.episodes.map((episode) => episode.id)).toEqual([
      removedEpisode!.id,
      remainingEpisode!.id,
    ]);
    expect(updated.chapters[0]?.episodes[0]?.sections).toEqual([
      expect.objectContaining({
        id: linkedScene.id,
        canvasNodeId: "canvas-start",
        sourceRemoved: true,
      }),
    ]);
    expect(remainingSections.map((section) => section.id)).toEqual([
      linkedScene.id,
      remainingEpisode!.sections[0]!.id,
    ]);
    expect(remainingSections.map((section) => section.id)).not.toContain(
      unlinkedScene.id,
    );
    expect(updated.links).toEqual([]);
  });

  it("includes removed routes in the tree difference summary", () => {
    const previous = parseScreenplayText([
      "第1集",
      "1-1 起点",
      "开始",
      "1-2 中途",
      "继续",
      "1-3 终点",
      "结束",
    ], "screenplay.txt").tree;
    const next = structuredClone(previous);
    const removed = next.links.pop()!;
    const changed = next.links[0]!;
    changed.label = "修改后的去向";

    const diff = diffPlayableStoryTrees(previous, next);

    expect(diff.changedLinks).toEqual(
      expect.arrayContaining([removed.id, changed.id]),
    );
    expect(diff.changedLinks).toHaveLength(2);
  });

  it("recognizes episodes, scenes, labeled branches, and chapter boundaries", () => {
    const parsed = parseScreenplayText([
      "第1篇章，前篇",
      "第1集",
      "1-1 木屋 夜内人物：苏尘",
      "按钮：长按查看信件",
      "1-2 古董摊 日外人物：苏尘",
      "固定对白",
      "第2集",
      "2-1A 赌串摊 日外——延展剧情 选项一：【当场拆穿】人物：苏尘",
      "选择 D01：当场拆穿",
      "2-1B 赌串摊 日外——延展剧情 选项二：【默默离开】人物：苏尘",
      "固定对白",
      "第2篇章，后篇",
      "第3集",
      "3-1 医院 日内人物：苏尘",
      "固定对白",
    ], "screenplay.txt");

    expect(parsed.tree.chapters.map((chapter) => chapter.title)).toEqual(["前篇", "后篇"]);
    expect(parsed.tree.chapters.map((chapter) => chapter.episodes.map((episode) => episode.number)))
      .toEqual([[1, 2], [3]]);
    expect(playableStoryTreeSections(parsed.tree).map((section) => section.title)).toEqual([
      "木屋",
      "古董摊",
      "当场拆穿",
      "默默离开",
      "医院",
    ]);
    const sections = playableStoryTreeSections(parsed.tree);
    expect(sections[0]?.beats[0]?.kind).toBe("operation");
    expect(sections[2]?.kind).toBe("branch");
    expect(parsed.tree.links.filter((link) => link.status === "suggested")).toHaveLength(4);
    expect(parsed.tree.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromSectionId: sections[2]!.id,
          toSectionId: sections[4]!.id,
          label: "下一集",
          status: "suggested",
        }),
        expect.objectContaining({
          fromSectionId: sections[3]!.id,
          toSectionId: sections[4]!.id,
          label: "下一集",
          status: "suggested",
        }),
      ]),
    );
    expect(parsed.warnings).toContain("routes-need-review");
    expect(isPlayableStoryTree(parsed.tree)).toBe(true);
  });

  it("recognizes scene headings followed by a Word line break inside the same paragraph", () => {
    const parsed = parseScreenplayText([
      "第1集",
      "1-1 木屋 夜 内\n人物：苏尘、九儿姐",
      "固定剧情",
      "第2集",
      "2-1A 赌串摊 夜 外——选项一：【当场拆穿】\n人物：苏尘",
      "分支剧情",
    ], "screenplay.txt");

    expect(parsed.tree.chapters.flatMap((chapter) => chapter.episodes.map((episode) => episode.number)))
      .toEqual([1, 2]);
    expect(playableStoryTreeSections(parsed.tree).map((section) => section.title)).toEqual([
      "木屋",
      "当场拆穿",
    ]);
  });

  it("preserves screenplay heading and scene wording, spacing, and order", () => {
    const heading = "1-1  木屋 夜内  ";
    const firstLine = "  苏尘推开门，走进木屋。  ";
    const secondLine = "\t他听见楼上有脚步声。\t";
    const parsed = parseScreenplayText([
      "第1篇章， 序章 ",
      "第1集：  初遇 ",
      heading,
      firstLine,
      "",
      secondLine,
      "1-2  走廊",
      "九儿姐出现在走廊尽头。",
    ], "screenplay.txt");
    const sections = playableStoryTreeSections(parsed.tree);

    expect(parsed.tree.chapters[0]?.sourceHeading).toBe("第1篇章， 序章 ");
    expect(parsed.tree.chapters[0]?.episodes[0]?.sourceHeading).toBe("第1集：  初遇 ");
    expect(sections[0]?.sourceSnapshot.heading).toBe(heading);
    expect(sections[0]?.scriptText).toBe(`${firstLine}\n\n${secondLine}`);
    expect(sections[0]?.beats.map((beat) => beat.text)).toEqual([
      firstLine,
      secondLine,
    ]);
    expect(sections.map((section) => section.scriptText)).toEqual([
      `${firstLine}\n\n${secondLine}`,
      "九儿姐出现在走廊尽头。",
    ]);
    expect(isPlayableStoryTree(parsed.tree)).toBe(true);
  });

  it("keeps a trailing scene in the episode when its chapter-end marker comes first", () => {
    const parsed = parseScreenplayText([
      "第36集",
      "36-1 出租屋",
      "结算剧情",
      "第一篇章，江湖窜货场篇，结束。",
      "36-2 面馆",
      "承接剧情",
      "第37集",
      "37-1 茶庄",
      "下一集剧情",
    ], "screenplay.txt");

    expect(parsed.tree.chapters.map((chapter) => chapter.episodes.map((episode) => episode.number)))
      .toEqual([[36], [37]]);
    expect(parsed.tree.chapters[0]?.episodes[0]?.sections.map((section) => section.id)).toEqual([
      "ep-36-scene-01",
      "ep-36-scene-02",
    ]);
  });

  it("merges source changes without discarding manual fields, chapter order, or canvas links", () => {
    const previous = parseScreenplayText([
      "第1篇章，第一篇",
      "第1集",
      "1-1 木屋",
      "原始对白",
      "1-2 古董摊",
      "旧分支文本",
      "1-3 医院",
      "保留场次",
    ], "screenplay.txt").tree;
    const firstEpisode = previous.chapters[0]!.episodes[0]!;
    previous.chapters[0]!.title = "手动篇章名";
    firstEpisode.title = "手动集名";
    firstEpisode.sections[0]!.objective = "保留目标";
    firstEpisode.sections[0]!.canvasNodeId = "existing-node";
    firstEpisode.sections[1]!.title = "手动场景名";
    firstEpisode.sections[1]!.scriptText = "手动保留的原文";
    firstEpisode.sections[1]!.beats[0]!.text = "手动保留的剧情";
    firstEpisode.sections[1]!.canvasNodeId = "branch-node";
    firstEpisode.sections.push({
      id: "manual-scene",
      episodeNumber: 1,
      sceneNumber: 4,
      title: "手动新增场景",
      kind: "scene",
      objective: "",
      prerequisite: "",
      beats: [],
      scriptText: "",
      sourceManaged: false,
      sourceSnapshot: { heading: "手动新增场景", body: "", title: "手动新增场景", beats: [] },
    });
    previous.links.push({
      id: "manual-route",
      fromSectionId: "ep-01-scene-01",
      toSectionId: "manual-scene",
      label: "手动去向",
      status: "suggested",
    });

    const incoming = parseScreenplayText([
      "第1篇章，第一篇",
      "第1集",
      "1-1 木屋",
      "更新对白",
      "1-2 古董摊",
      "更新分支文本",
    ], "screenplay.txt").tree;
    const { tree, diff } = reconcilePlayableStoryTree(previous, incoming);
    const sections = playableStoryTreeSections(tree);
    const updated = sections.find((section) => section.id === "ep-01-scene-01")!;
    const edited = sections.find((section) => section.id === "ep-01-scene-02")!;

    expect(tree.chapters[0]?.title).toBe("手动篇章名");
    expect(tree.chapters[0]?.episodes[0]?.title).toBe("手动集名");
    expect(updated).toMatchObject({
      scriptText: "更新对白",
      objective: "保留目标",
      canvasNodeId: "existing-node",
    });
    expect(edited).toMatchObject({
      title: "手动场景名",
      scriptText: "手动保留的原文",
      canvasNodeId: "branch-node",
      sourcePending: { body: "更新分支文本" },
    });
    const manual = sections.find((section) => section.id === "manual-scene")!;
    expect(manual.sourceManaged).toBe(false);
    expect(manual).not.toHaveProperty("sourceRemoved");
    expect(sections.find((section) => section.id === "ep-01-scene-03")?.sourceRemoved).toBe(true);
    expect(diff.changed).toContain("ep-01-scene-02");
    expect(diff.removed).toContain("ep-01-scene-03");
    expect(diff.unchanged).toContain("manual-scene");
    expect(tree.links.some((link) => link.id === "manual-route")).toBe(true);
    expect(isPlayableStoryTree(tree)).toBe(true);
  });

  it("keeps a manually confirmed route when re-importing the unchanged screenplay", () => {
    const previous = parseScreenplayText([
      "第1集",
      "1-1 主场景",
      "固定剧情",
      "第2集",
      "2-1A 分支 选项一：【甲】",
      "分支甲",
      "2-1B 分支 选项二：【乙】",
      "分支乙",
    ], "screenplay.txt").tree;
    const route = previous.links.find((link) => link.status === "suggested")!;
    route.status = "confirmed";

    const incoming = parseScreenplayText([
      "第1集",
      "1-1 主场景",
      "固定剧情",
      "第2集",
      "2-1A 分支 选项一：【甲】",
      "分支甲",
      "2-1B 分支 选项二：【乙】",
      "分支乙",
    ], "screenplay.txt").tree;
    const merged = reconcilePlayableStoryTree(previous, incoming).tree;

    expect(merged.links.find((link) => link.id === route.id)?.status).toBe("confirmed");
  });

  it("exports the hierarchy and marks unconfirmed routes for review", () => {
    const tree = parseScreenplayText([
      "第1集",
      "1-1 开场",
      "固定剧情",
      "1-2 分支",
      "选择一",
    ], "screenplay.txt").tree;

    const markdown = formatPlayableStoryTreeMarkdown(tree);

    expect(markdown).toContain("```text");
    expect(markdown).toContain("└── 未分章");
    expect(markdown).toContain("└── 【01｜第1集｜第1集】");
    expect(markdown).toContain("│");
    expect(markdown).toContain("目标：【待校对】");
    expect(markdown).toContain("【待确认】");
  });

  it("exports consecutive fixed-plot beats under one grouped branch", () => {
    const tree = parseScreenplayText([
      "第1集",
      "1-1 木屋",
      "九儿姐抛出铜钱。",
      "苏尘准确说出年号。",
      "九儿姐告知苏尘父母死因。",
    ], "screenplay.txt").tree;

    const text = formatPlayableStoryTreeMarkdown(tree);

    expect(text.match(/【固定剧情】/gu)).toHaveLength(1);
    expect(text).toContain("九儿姐抛出铜钱。");
    expect(text).toContain("苏尘准确说出年号。");
    expect(text).toContain("九儿姐告知苏尘父母死因。");
  });

  it("reports when a screenplay contains no recognizable scene headings", () => {
    const parsed = parseScreenplayText(["标题", "正文"], "screenplay.txt");

    expect(parsed.tree.chapters).toEqual([]);
    expect(parsed.warnings).toContain("no-scenes");
  });
});
