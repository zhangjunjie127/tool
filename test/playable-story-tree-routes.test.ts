import { describe, expect, it } from "vitest";
import {
  parseScreenplayText,
  playableStoryTreeSections,
} from "../src/shared/playable-story-tree.js";
import {
  completePlayableStoryTreeRoutes,
  playableStoryTreeExitLabel,
} from "../src/shared/playable-story-tree-routes.js";

function treeWith(...lines: string[]) {
  const tree = parseScreenplayText(lines, "routes.txt").tree;
  tree.links = [];
  return tree;
}

describe("story route completion", () => {
  it("uses destination scene titles for generic Exit labels and preserves named choices", () => {
    for (const generic of ["", "继续", "下一集", "主线汇合"]) {
      expect(playableStoryTreeExitLabel(generic, "古董摊")).toBe("古董摊");
    }
    expect(playableStoryTreeExitLabel("拒绝赌注", "古董摊")).toBe("拒绝赌注");
    expect(playableStoryTreeExitLabel("下一集")).toBe("下一集");
  });

  it("adds provisional ordinary continuations across episodes without mutating the input", () => {
    const tree = treeWith(
      "第1集",
      "1-1 开场",
      "剧情",
      "1-2 后续",
      "剧情",
      "第2集",
      "2-1 结尾",
      "剧情",
    );
    const before = structuredClone(tree);
    const sections = playableStoryTreeSections(tree);
    const completed = completePlayableStoryTreeRoutes(tree);
    expect(
      completed.links.map((link) => [
        link.fromSectionId,
        link.toSectionId,
        link.status,
      ]),
    ).toEqual([
      [sections[0]!.id, sections[1]!.id, "suggested"],
      [sections[1]!.id, sections[2]!.id, "suggested"],
    ]);
    expect(tree).toEqual(before);
    expect(completePlayableStoryTreeRoutes(completed)).toBe(completed);
  });

  it("uses an explicit scene reference instead of connecting to the next episode's first branch", () => {
    const tree = treeWith(
      "第2集",
      "2-1B 离开",
      "后续接3-2",
      "第3集",
      "3-1A 赌局",
      "剧情",
      "3-1B 拒绝",
      "剧情",
      "3-2 古董摊",
      "剧情",
    );
    const sections = playableStoryTreeSections(tree);
    const completed = completePlayableStoryTreeRoutes(tree);
    expect(
      completed.links.filter((link) => link.fromSectionId === sections[0]!.id),
    ).toEqual([
      expect.objectContaining({
        toSectionId: sections[3]!.id,
        status: "suggested",
      }),
    ]);
  });

  it("does not guess a destination when the explicit reference is missing or ambiguous", () => {
    for (const reference of ["后续接8-8", "后续接1-2"]) {
      const tree = treeWith(
        "第1集",
        "1-1 开始",
        reference,
        "1-2 重复一",
        "剧情",
        "1-2 重复二",
        "剧情",
      );
      const source = playableStoryTreeSections(tree)[0]!;
      expect(
        completePlayableStoryTreeRoutes(tree).links.some(
          (link) => link.fromSectionId === source.id,
        ),
      ).toBe(false);
    }
  });

  it("preserves authored destinations and deliberately removed managed exits", () => {
    const tree = treeWith(
      "第1集",
      "1-1 开始",
      "剧情",
      "1-2 后续",
      "剧情",
      "1-3 终点",
      "剧情",
    );
    const [source, middle, last] = playableStoryTreeSections(tree);
    tree.links.push({
      id: "manual",
      fromSectionId: source!.id,
      toSectionId: last!.id,
      label: "我的路线",
      status: "confirmed",
    });
    middle!.canvasSnapshot = {
      title: middle!.title,
      exits: [{ id: "old", label: "继续", targetSectionId: last!.id }],
    };
    expect(completePlayableStoryTreeRoutes(tree)).toBe(tree);
  });

  it("does not connect endings or replay outcomes to later scenes", () => {
    const tree = treeWith(
      "第1集",
      "1-1 结束",
      "剧情",
      "1-2 失败",
      "按钮：【返回故事线】",
      "1-3 其他",
      "剧情",
    );
    playableStoryTreeSections(tree)[0]!.kind = "ending";
    expect(completePlayableStoryTreeRoutes(tree).links).toEqual([]);
  });

  it("does not bypass removed scenes or invent links between consecutive branch-only episodes", () => {
    const tree = treeWith(
      "第1集",
      "1-1A 分支",
      "剧情",
      "1-1B 分支",
      "剧情",
      "第2集",
      "2-1A 另一组",
      "剧情",
    );
    expect(completePlayableStoryTreeRoutes(tree).links).toEqual([]);
    const removed = treeWith(
      "第1集",
      "1-1 开始",
      "剧情",
      "1-2 删除",
      "剧情",
      "1-3 后续",
      "剧情",
    );
    playableStoryTreeSections(removed)[1]!.sourceRemoved = true;
    expect(completePlayableStoryTreeRoutes(removed).links).toEqual([]);
  });

  it("recognizes sibling alternatives from existing edges even when their kind is scene", () => {
    const tree = treeWith(
      "第1集",
      "1-1 选择",
      "选项一：甲",
      "选项二：乙",
      "1-2 甲",
      "剧情",
      "1-3 乙",
      "剧情",
      "1-4 汇合",
      "剧情",
    );
    const [source, a, b, merge] = playableStoryTreeSections(tree);
    tree.links = [a!, b!].map((target) => ({
      id: target.id,
      fromSectionId: source!.id,
      toSectionId: target.id,
      label: target.title,
      status: "confirmed",
    }));
    const completed = completePlayableStoryTreeRoutes(tree);
    for (const branch of [a!, b!]) {
      expect(
        completed.links.filter((link) => link.fromSectionId === branch.id),
      ).toEqual([expect.objectContaining({ toSectionId: merge!.id })]);
    }
  });

  it("matches cross-episode branches from a choice inside another branch, regardless of scene numbering", () => {
    const tree = treeWith(
      "第1集",
      "1-1A 旧分支",
      "剧情",
      "1-1B 决策",
      "选项一：【甲】",
      "选项二：【乙】",
      "选项三：【丙】",
      "第2集",
      "2-1A 甲",
      "剧情",
      "2-2B 乙",
      "剧情",
      "2-2C 丙",
      "剧情",
    );
    const sections = playableStoryTreeSections(tree);
    const completed = completePlayableStoryTreeRoutes(tree);
    expect(
      completed.links
        .filter((link) => link.fromSectionId === sections[1]!.id)
        .map((link) => link.toSectionId),
    ).toEqual(sections.slice(2).map((section) => section.id));
    expect(
      completed.links.some((link) => link.fromSectionId === sections[0]!.id),
    ).toBe(false);
  });
});
