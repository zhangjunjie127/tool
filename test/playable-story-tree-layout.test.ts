import { describe, expect, it } from "vitest";
import { layoutPlayableStoryTreeNodes } from "../src/shared/playable-story-tree-layout.js";
import { parseScreenplayText, playableStoryTreeSections } from "../src/shared/playable-story-tree.js";
import { completePlayableStoryTreeRoutes } from "../src/shared/playable-story-tree-routes.js";

type Position = { x: number; y: number };
const columnStep = 440 + 140;
const rowStep = 440 / (1280 / 720) + 28 + 140;

function arrange(
  names: string[],
  routes: [string, string][],
  fixedPositions: Record<string, Position> = {},
) {
  const tree = parseScreenplayText(
    ["第1集", ...names.flatMap((name, index) => [`1-${index + 1} ${name}`, name])],
    "layout.txt",
  ).tree;
  const sections = playableStoryTreeSections(tree).map((section, index) => ({
    ...section, id: names[index]!,
  }));
  return layoutPlayableStoryTreeNodes({
    sections,
    links: routes.map(([fromSectionId, toSectionId], index) => ({
      id: `route-${index}`, fromSectionId, toSectionId, label: "Next", status: "confirmed",
    })),
    nodeIds: new Map(names.map((name) => [name, name])),
    newNodeIds: new Set(names.filter((name) => !fixedPositions[name])),
    fixedPositions,
    entryNodeId: names[0],
    viewport: { width: 1280, height: 720 },
  });
}

describe("story tree horizontal layout", () => {
  it("returns successive branch merges to the main horizontal axis and reuses branch rows", () => {
    const positions = arrange(
      ["start", "a", "b", "merge", "c", "d", "end"],
      [["start", "a"], ["start", "b"], ["a", "merge"], ["b", "merge"],
        ["merge", "c"], ["merge", "d"], ["c", "end"], ["d", "end"]],
    );
    expect(positions.merge!.y).toBe(positions.start!.y);
    expect(positions.end!.y).toBe(positions.start!.y);
    expect(positions.a!.y).toBe(positions.start!.y);
    expect(positions.b!.y - positions.a!.y).toBe(rowStep);
    expect(positions.c!.y).toBe(positions.a!.y);
    expect(positions.d!.y).toBe(positions.b!.y);
    expect(positions.end!.x - positions.merge!.x).toBe(2 * columnStep);
  });

  it("keeps main scenes on one axis while choice branches occupy ordered rows and merge back", () => {
    const tree = parseScreenplayText([
      "第1集",
      "1-1 开场",
      "铺垫",
      "1-2 市场选择",
      "选项一：【当场拆穿】",
      "选项二：【默默离开】",
      "选项三：【以身入局】",
      "第2集",
      "2-1A 当场拆穿",
      "分支A",
      "2-1B 默默离开",
      "分支B",
      "2-1C 以身入局",
      "分支C",
      "2-2 汇合",
      "后续主线",
      "2-3 下一幕",
      "主线继续",
    ], "branch-layout.txt").tree;
    tree.links = tree.links.filter(
      (link) => link.fromSectionId === playableStoryTreeSections(tree)[0]!.id,
    );
    const completed = completePlayableStoryTreeRoutes(tree);
    const sections = playableStoryTreeSections(completed);
    const ids = new Map(sections.map((section) => [section.id, section.id]));
    const positions = layoutPlayableStoryTreeNodes({
      sections,
      links: completed.links,
      nodeIds: ids,
      newNodeIds: new Set(ids.values()),
      fixedPositions: {},
      entryNodeId: sections[0]!.id,
      viewport: { width: 1280, height: 720 },
    });
    const [opening, choice, branchA, branchB, branchC, merge, next] = sections;
    expect(choice!.beats.filter((beat) => beat.kind === "choice")).toHaveLength(3);
    expect([opening, choice, merge, next].map((section) => positions[section!.id]!.y))
      .toEqual([positions[opening!.id]!.y, positions[opening!.id]!.y, positions[opening!.id]!.y, positions[opening!.id]!.y]);
    expect(positions[branchA!.id]!.y).toBe(positions[opening!.id]!.y);
    expect(positions[branchB!.id]!.y - positions[branchA!.id]!.y).toBe(rowStep);
    expect(positions[branchC!.id]!.y - positions[branchB!.id]!.y).toBe(rowStep);
    expect(positions[branchA!.id]!.x).toBe(positions[branchB!.id]!.x);
    expect(positions[branchB!.id]!.x).toBe(positions[branchC!.id]!.x);
    expect(positions[merge!.id]!.x).toBeGreaterThan(positions[branchC!.id]!.x);
  });

  it("places a merge after the longest branch rather than at the first arriving branch", () => {
    const positions = arrange(
      ["start", "a", "b", "b2", "b3", "merge", "end"],
      [["start", "a"], ["start", "b"], ["a", "merge"], ["b", "b2"],
        ["b2", "b3"], ["b3", "merge"], ["merge", "end"]],
    );
    expect(positions.merge!.x - positions.b3!.x).toBe(columnStep);
    expect(positions.merge!.y).toBe(positions.start!.y);
    expect(positions.end!.y).toBe(positions.start!.y);
    expect(positions.b2!.y).toBe(positions.b!.y);
    expect(positions.b3!.y).toBe(positions.b!.y);
  });

  it("returns a nested merge to its branch axis and the outer merge to the main axis", () => {
    const positions = arrange(
      ["start", "a", "b", "a1", "a2", "aMerge", "end"],
      [["start", "a"], ["start", "b"], ["a", "a1"], ["a", "a2"],
        ["a1", "aMerge"], ["a2", "aMerge"], ["aMerge", "end"], ["b", "end"]],
    );
    expect(positions.aMerge!.y).toBe(positions.a!.y);
    expect(positions.end!.y).toBe(positions.start!.y);
    expect(positions.end!.x).toBeGreaterThan(positions.aMerge!.x);
    for (const [id, position] of Object.entries(positions)) {
      for (const [otherId, other] of Object.entries(positions)) {
        if (id === otherId) continue;
        expect(
          Math.abs(position.x - other.x) >= columnStep ||
          Math.abs(position.y - other.y) >= rowStep,
        ).toBe(true);
      }
    }
  });

  it("continues disconnected components horizontally without accumulating new rows", () => {
    const positions = arrange(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]);
    expect(new Set(Object.values(positions).map((position) => position.y)).size).toBe(1);
    expect(positions.c!.x - positions.b!.x).toBe(columnStep);
  });

  it("avoids existing obstacles horizontally and keeps existing node coordinates unchanged", () => {
    const fixed = { start: { x: 300, y: 500 }, obstacle: { x: 300 + columnStep, y: 500 } };
    const original = structuredClone(fixed);
    const positions = arrange(["start", "next", "end"], [["start", "next"], ["next", "end"]], fixed);
    expect(positions.next!.y).toBe(500);
    expect(positions.next!.x).toBe(300 + 2 * columnStep);
    expect(positions.end!.y).toBe(500);
    expect(positions.end!.x - positions.next!.x).toBe(columnStep);
    expect(positions.start).toBeUndefined();
    expect(fixed).toEqual(original);
  });

  it("lays out return links and duplicate exits without creating extra branch rows", () => {
    const positions = arrange(
      ["start", "middle", "end"],
      [["start", "middle"], ["start", "middle"], ["middle", "end"], ["end", "start"]],
    );
    expect(new Set(Object.values(positions).map((position) => position.y)).size).toBe(1);
    expect(positions.middle!.x - positions.start!.x).toBe(columnStep);
    expect(positions.end!.x - positions.middle!.x).toBe(columnStep);
  });

  it("adds later branch groups on the same axis without changing previously generated nodes", () => {
    const routes: [string, string][] = [
      ["start", "a"], ["start", "b"], ["a", "merge"], ["b", "merge"],
    ];
    const fixed = arrange(["start", "a", "b", "merge"], routes);
    const original = structuredClone(fixed);
    const positions = arrange(
      ["start", "a", "b", "merge", "c", "d", "end"],
      [...routes, ["merge", "c"], ["merge", "d"], ["c", "end"], ["d", "end"]],
      fixed,
    );
    expect(fixed).toEqual(original);
    expect(Object.keys(positions)).toEqual(["c", "d", "end"]);
    expect(positions.end!.y).toBe(fixed.start!.y);
    expect(positions.c!.y).toBe(fixed.a!.y);
    expect(positions.d!.y).toBe(fixed.b!.y);
  });

  it("keeps one hundred successive binary branch groups within two rows", () => {
    const names = ["start"];
    const routes: [string, string][] = [];
    let previous = "start";
    for (let index = 0; index < 100; index += 1) {
      const [a, b, merge] = [`a${index}`, `b${index}`, `merge${index}`];
      names.push(a!, b!, merge!);
      routes.push([previous, a!], [previous, b!], [a!, merge!], [b!, merge!]);
      previous = merge!;
    }
    const positions = arrange(names, routes);
    expect(Object.keys(positions)).toHaveLength(301);
    expect(new Set(Object.values(positions).map((position) => position.y)).size).toBe(2);
    expect(positions.merge99!.y).toBe(positions.start!.y);
    expect(positions.merge99!.x - positions.start!.x).toBe(200 * columnStep);
  });
});
