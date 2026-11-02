import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNodeCodebase,
  createPlayableStarterCodebase,
  readNodeCodebase,
  writeNodeCodebase,
} from "../src/daemon/playable-codebase.js";
import {
  syncPlayableStoryTree,
} from "../src/daemon/playable-add-node.js";
import { playablePreset } from "../src/daemon/playable-presets.js";
import {
  PlayableStoryTreeConflictError,
  readPlayableStoryTree,
  writePlayableStoryTree,
} from "../src/daemon/playable-story-tree-store.js";
import {
  removePlayableStoryTreeChapter,
  parseScreenplayText,
  playableStoryTreeSections,
  playableStoryTreeCanvasStatus,
  reconcilePlayableStoryTree,
} from "../src/shared/playable-story-tree.js";
import { addPlayableNodeAsset } from "../src/shared/playable-editor.js";
import { setPlayableBackdrop } from "../src/shared/playable-backdrop.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) =>
    rm(workspace, { recursive: true, force: true }),
  ));
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), "story-tree-"));
  workspaces.push(workspace);
  await createNodeCodebase(
    workspace,
    createPlayableStarterCodebase("Story tree test", { width: 1280, height: 720 }),
  );
  return workspace;
}

function simpleTree() {
  return parseScreenplayText([
    "第1集",
    "1-1 开场",
    "固定剧情",
    "1-2 选择",
    "结束剧情",
  ], "screenplay.txt").tree;
}

function choiceTree(count: number) {
  const tree = simpleTree();
  const episode = tree.chapters[0]!.episodes[0]!;
  const source = episode.sections[0]!;
  source.beats = Array.from({ length: count }, (_, index) => ({
    id: `choice-${index}`,
    kind: "choice" as const,
    text: `选项${index + 1}：路线${index + 1}`,
  }));
  episode.sections = [source, ...Array.from({ length: count }, (_, index) => ({
    ...structuredClone(episode.sections[1]!),
    id: `target-${index}`,
    title: `目的地${index + 1}`,
    sceneNumber: index + 2,
  }))];
  tree.links = episode.sections.slice(1).map((target, index) => ({
    id: `route-${index}`,
    fromSectionId: source.id,
    toSectionId: target.id,
    label: "下一集",
    status: "suggested" as const,
  }));
  return tree;
}

describe("playable story tree canvas sync", () => {
  it("renames legacy generic exits to their destination scene after confirmation", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = structuredClone(first.tree!);
    const [source, target] = playableStoryTreeSections(tree);
    const codebase = await readNodeCodebase(workspace);
    const node = codebase.graph.nodes.find((item) => item.id === source!.canvasNodeId)!;
    const signalId = source!.canvasSnapshot!.exits[0]!.id;
    const signal = node.signals.find((item) => item.id === signalId)!;
    signal.label = "下一集";
    source!.canvasSnapshot!.exits[0]!.label = "下一集";
    const oldPosition = codebase.editorLayout.nodes[node.id];
    await writeNodeCodebase(workspace, {
      graph: codebase.graph,
      editorLayout: codebase.editorLayout,
    });

    const preview = await syncPlayableStoryTree(workspace, tree, tree);
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toHaveLength(1);
    const applied = await syncPlayableStoryTree(workspace, tree, tree, true);
    const after = await readNodeCodebase(workspace);
    expect(after.graph.nodes.find((item) => item.id === node.id)!.signals
      .find((item) => item.id === signalId)!.label).toBe(target!.title);
    expect(after.editorLayout.nodes[node.id]).toEqual(oldPosition);
    expect(applied.tree!.chapters[0]!.episodes[0]!.sections[0]!
      .canvasSnapshot!.exits[0]!.label).toBe(target!.title);
  });

  it("completes missing routes around cross-episode branches without chaining sibling alternatives", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第3集",
      "3-1B 赌串摊——延展剧情 选项二：【拒绝赌注，转身离开】",
      "拿钱离开。",
      "3-2 古董摊",
      "选项一：【采用包圆法】",
      "选项二：【采用捎带法】",
      "选项三：【采用火中取栗法】",
      "第4集",
      "4-1A 古董摊——延展剧情 选项一：【采用包圆法】",
      "按钮：【划动屏幕擦掉灰尘】",
      "4-2B 古董摊——延展剧情 选项二：【采用捎带法】",
      "带着古董离开。",
      "4-2C 古董摊——延展剧情 选项三：【采用火中取栗法】",
      "按钮：【长按屏幕摔掉金蟾】",
      "第5集",
      "5-1 出租屋",
      "三条路线在这里继续。",
    ], "branches.txt").tree;
    const [refuse, choice, a, b, c, next] = playableStoryTreeSections(tree);
    tree.links = [
      { id: "merge", fromSectionId: refuse!.id, toSectionId: choice!.id, label: "主线汇合", status: "suggested" },
      { id: "first", fromSectionId: choice!.id, toSectionId: a!.id, label: "下一集", status: "suggested" },
    ];
    const original = structuredClone(tree);
    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const codebase = await readNodeCodebase(workspace);
    const generated = new Map(playableStoryTreeSections(result.tree!).map((section) => [section.id, section.canvasNodeId]));
    const targets = (id: string) => codebase.graph.edges
      .filter((edge) => edge.source.nodeId === generated.get(id))
      .map((edge) => edge.targetNodeId);
    expect(targets(choice!.id)).toEqual([a, b, c].map((section) => generated.get(section!.id)));
    for (const section of [a, b, c]) {
      expect(targets(section!.id)).toEqual([generated.get(next!.id)]);
    }
    expect(targets(refuse!.id)).toEqual([generated.get(choice!.id)]);
    expect(result.tree!.links).toHaveLength(7);
    expect(result.tree!.links.every((link) => link.status === "suggested")).toBe(true);
    expect(tree).toEqual(original);
    const repeated = await syncPlayableStoryTree(workspace, result.tree, result.tree!);
    expect(repeated).toMatchObject({ applied: true, addedNodes: 0, updatedNodes: 0 });
    expect((await readNodeCodebase(workspace)).graph).toEqual(codebase.graph);
  });

  it.each([2, 3, 5])("creates %i provisionally mapped choices instead of limiting exits to the preset", async (count) => {
    const workspace = await createWorkspace();
    const tree = choiceTree(count);
    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const sections = playableStoryTreeSections(result.tree!);
    const codebase = await readNodeCodebase(workspace);
    const node = codebase.graph.nodes.find((item) => item.id === sections[0]!.canvasNodeId)!;
    const exits = sections[0]!.canvasSnapshot!.exits;
    expect(node.signals).toHaveLength(count);
    const generatedHtml = await readFile(path.join(workspace, node.source.html), "utf8");
    expect(generatedHtml).toContain('data-putenggame-no-input-mode="wait"');
    expect(generatedHtml).not.toContain('class="choices"');
    expect(exits).toHaveLength(count);
    expect(codebase.graph.edges).toHaveLength(count);
    expect(playableStoryTreeCanvasStatus(result.tree!).provisionalEdges).toHaveLength(count);
    expect(sections[0]!.canvasSnapshot!.storyButtons!.map((button) => button.beatId))
      .toEqual(sections[0]!.beats.map((beat) => beat.id));

    const html = await readFile(path.join(workspace, node.source.html), "utf8");
    const confirmed = structuredClone(result.tree!);
    confirmed.links.forEach((link) => { link.status = "confirmed"; });
    const applied = await syncPlayableStoryTree(workspace, result.tree, confirmed);
    expect(applied).toMatchObject({ applied: true, addedNodes: 0, updatedNodes: 0 });
    expect(playableStoryTreeCanvasStatus(applied.tree!).provisionalEdges).toBeUndefined();
    expect(await readFile(path.join(workspace, node.source.html), "utf8")).toBe(html);
    expect((await readNodeCodebase(workspace)).graph).toEqual(codebase.graph);
  });

  it.each([
    ["长按开门2秒", "hold"],
    ["向左滑动", "swipe-left"],
    ["连续点击5次", "multi-click"],
    ["双击开门", "double-click"],
    ["快速点击按钮", "quick-click"],
    ["3秒内完成QTE", "click"],
  ])("generates and connects the suggested operation %s", async (text, interaction) => {
    const workspace = await createWorkspace();
    const tree = simpleTree();
    const section = playableStoryTreeSections(tree)[0]!;
    section.beats = [{ id: "operation", kind: "operation", text }];
    tree.links[0]!.status = "suggested";
    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const codebase = await readNodeCodebase(workspace);
    const node = codebase.graph.nodes.find((item) =>
      item.id === playableStoryTreeSections(result.tree!)[0]!.canvasNodeId,
    )!;
    const html = await readFile(path.join(workspace, node.source.html), "utf8");
    expect(html).toContain(`data-putenggame-motion-interaction="${interaction}"`);
    expect(html).toContain('data-putenggame-no-input-mode="wait"');
    expect(html).toContain('data-putenggame-story-tree-beat-id="operation"');
    expect(codebase.graph.edges.filter((edge) => edge.source.nodeId === node.id)).toHaveLength(1);
    expect(result.pendingLinks).toBe(1);
  });

  it("repairs a legacy two-button scene after confirmation without moving or resizing its buttons", async () => {
    const workspace = await createWorkspace();
    const tree = choiceTree(3);
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const sections = playableStoryTreeSections(first.tree!);
    const codebase = await readNodeCodebase(workspace);
    const source = codebase.graph.nodes.find((node) => node.id === sections[0]!.canvasNodeId)!;
    const preset = playablePreset("choice")!;
    const legacyHtml = preset.source(source.title).html
      .replace('style="--delay: 0.6s"', 'style="left:123px;top:234px;width:87px;height:43px" data-author-note="keep"');
    source.signals = structuredClone(preset.signals);
    codebase.graph.edges = [];
    sections[0]!.canvasSnapshot!.exits = [];
    sections[0]!.canvasSnapshot!.storyButtons = [];
    await writeNodeCodebase(workspace, {
      graph: codebase.graph,
      editorLayout: codebase.editorLayout,
      sources: { [source.source.html]: legacyHtml },
    });
    const preview = await syncPlayableStoryTree(workspace, first.tree, first.tree!);
    expect(preview.applied).toBe(false);
    expect(await readFile(path.join(workspace, source.source.html), "utf8")).toBe(legacyHtml);
    const applied = await syncPlayableStoryTree(workspace, first.tree, first.tree!, true);
    const after = await readNodeCodebase(workspace);
    const html = await readFile(path.join(workspace, source.source.html), "utf8");
    expect(after.graph.edges).toHaveLength(3);
    expect(after.graph.nodes.find((node) => node.id === source.id)!.signals).toHaveLength(3);
    expect(after.editorLayout).toEqual(codebase.editorLayout);
    expect(html).toContain('style="left:123px;top:234px;width:87px;height:43px"');
    expect(html).toContain('data-author-note="keep"');
    expect(html).not.toContain("I had no choice.");
    expect(html).not.toContain("Who else would come?");
    expect(playableStoryTreeSections(applied.tree!)[0]!.canvasSnapshot!.storyButtons).toHaveLength(3);
  });

  it("retains an operation with no target and reuses its button when a destination is supplied", async () => {
    const workspace = await createWorkspace();
    const tree = simpleTree();
    tree.links = [];
    playableStoryTreeSections(tree)[1]!.kind = "branch";
    playableStoryTreeSections(tree)[0]!.beats = [
      { id: "hold", kind: "operation", text: "长按开门2秒" },
    ];
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const sections = playableStoryTreeSections(first.tree!);
    const node = (await readNodeCodebase(workspace)).graph.nodes.find((item) =>
      item.id === sections[0]!.canvasNodeId,
    )!;
    const html = await readFile(path.join(workspace, node.source.html), "utf8");
    expect(node.signals).toHaveLength(1);
    expect(html).toContain('data-putenggame-motion-interaction="hold"');
    const repeated = await syncPlayableStoryTree(workspace, first.tree, first.tree!);
    expect(repeated).toMatchObject({ applied: true, updatedNodes: 0 });
    const next = structuredClone(first.tree!);
    next.links.push({
      id: "hold-destination",
      fromSectionId: sections[0]!.id,
      toSectionId: sections[1]!.id,
      label: "继续",
      status: "suggested",
    });
    const applied = await syncPlayableStoryTree(workspace, first.tree, next, true);
    const after = await readNodeCodebase(workspace);
    expect(applied.applied).toBe(true);
    expect(after.graph.edges).toHaveLength(1);
    expect(after.graph.edges[0]!.source.signal).toBe(node.signals[0]!.id);
    expect(await readFile(path.join(workspace, node.source.html), "utf8")).toBe(html);
  });

  it("keeps existing button identities when a choice is inserted before them or removed", async () => {
    const workspace = await createWorkspace();
    const tree = choiceTree(3);
    tree.links.forEach((link, index) => { link.label = `路线${index + 1}`; });
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const original = playableStoryTreeSections(first.tree!)[0]!;
    const before = await readNodeCodebase(workspace);
    const node = before.graph.nodes.find((item) => item.id === original.canvasNodeId)!;
    const originalButtons = original.canvasSnapshot!.storyButtons!;
    const originalHtml = await readFile(path.join(workspace, node.source.html), "utf8");
    const next = structuredClone(first.tree!);
    const section = playableStoryTreeSections(next)[0]!;
    section.beats.unshift({ id: "inserted", kind: "choice", text: "新增路线" });
    next.links.unshift({
      id: "inserted-route", fromSectionId: section.id,
      toSectionId: playableStoryTreeSections(next)[1]!.id,
      label: "新增路线", status: "suggested",
    });
    const applied = await syncPlayableStoryTree(workspace, first.tree, next, true);
    const newButtons = playableStoryTreeSections(applied.tree!)[0]!.canvasSnapshot!.storyButtons!;
    expect(newButtons).toHaveLength(4);
    for (const button of originalButtons) {
      expect(newButtons.find((item) => item.beatId === button.beatId)).toEqual(button);
    }
    const removed = structuredClone(applied.tree!);
    playableStoryTreeSections(removed)[0]!.beats = original.beats;
    removed.links = removed.links.filter((link) => link.id !== "inserted-route").reverse();
    const reapplied = await syncPlayableStoryTree(workspace, applied.tree, removed, true);
    expect(playableStoryTreeSections(reapplied.tree!)[0]!.canvasSnapshot!.storyButtons!)
      .toEqual(expect.arrayContaining(originalButtons));
    expect(await readFile(path.join(workspace, node.source.html), "utf8")).toBe(originalHtml);
    expect((await readNodeCodebase(workspace)).editorLayout).toEqual(before.editorLayout);
  });

  it("does not replace a manually redirected edge when the story has not changed", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, choiceTree(3));
    const before = await readNodeCodebase(workspace);
    before.graph.edges[0]!.targetNodeId = before.graph.edges[1]!.targetNodeId;
    await writeNodeCodebase(workspace, { graph: before.graph, editorLayout: before.editorLayout });
    const repeated = await syncPlayableStoryTree(workspace, first.tree, first.tree!);
    expect(repeated).toMatchObject({ applied: true, updatedNodes: 0 });
    expect((await readNodeCodebase(workspace)).graph).toEqual(before.graph);
  });

  it("updates provisional positional mappings even when their labels are identical", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, choiceTree(3));
    const section = playableStoryTreeSections(first.tree!)[0]!;
    const before = await readNodeCodebase(workspace);
    const source = before.graph.nodes.find((node) => node.id === section.canvasNodeId)!;
    const html = await readFile(path.join(workspace, source.source.html), "utf8");
    const next = structuredClone(first.tree!);
    const firstTarget = next.links[0]!.toSectionId;
    next.links[0]!.toSectionId = next.links[1]!.toSectionId;
    next.links[1]!.toSectionId = firstTarget;
    const preview = await syncPlayableStoryTree(workspace, first.tree, next);
    expect(preview.applied).toBe(false);
    const applied = await syncPlayableStoryTree(workspace, first.tree, next, true);
    const after = await readNodeCodebase(workspace);
    const firstButton = section.canvasSnapshot!.storyButtons![0]!;
    const target = playableStoryTreeSections(applied.tree!).find((item) => item.id === next.links[0]!.toSectionId)!;
    expect(after.graph.edges.find((edge) => edge.source.nodeId === source.id && edge.source.signal === firstButton.signal)!.targetNodeId)
      .toBe(target.canvasNodeId);
    expect(await readFile(path.join(workspace, source.source.html), "utf8")).toBe(html);
    expect(after.editorLayout).toEqual(before.editorLayout);
  });

  it("generates all three choice buttons and provisionally connects suggested routes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集", "1-1 选择", "选项一：【当场拆穿】",
      "选项二：【默默离开】", "选项三：【以身入局】",
      "第2集", "2-1A 当场拆穿", "分支剧情",
      "2-1B 默默离开", "分支剧情", "2-1C 以身入局", "分支剧情",
    ], "choices.txt").tree;
    const sections = playableStoryTreeSections(tree);
    tree.links = sections.slice(1).map((target, index) => ({
      id: `choice-${index}`,
      fromSectionId: sections[0]!.id,
      toSectionId: target.id,
      label: index === 0 ? "下一集" : target.title,
      status: "suggested",
    }));
    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const codebase = await readNodeCodebase(workspace);
    const generated = playableStoryTreeSections(result.tree!);
    const source = codebase.graph.nodes.find((node) => node.id === generated[0]!.canvasNodeId)!;
    const edges = codebase.graph.edges.filter((edge) => edge.source.nodeId === source.id);
    expect(source.signals.map((signal) => signal.label)).toEqual(
      sections.slice(1).map((section) => section.title),
    );
    expect(source.signals.some((signal) => signal.label === "下一集")).toBe(false);
    expect(edges).toHaveLength(3);
    expect(source.signals).toHaveLength(3);
    const html = await readFile(path.join(workspace, source.source.html), "utf8");
    for (const beat of sections[0]!.beats.filter((beat) => beat.kind === "choice")) {
      expect(html).toContain(`data-putenggame-story-tree-beat-id="${beat.id}"`);
    }
    expect(new Set(edges.map((edge) => edge.targetNodeId)).size).toBe(3);
    expect(result.pendingLinks).toBe(3);
    expect(result.tree!.links.every((link) => link.status === "suggested")).toBe(true);
    const repeated = await syncPlayableStoryTree(workspace, result.tree, result.tree!);
    expect(repeated).toMatchObject({ applied: true, addedNodes: 0, updatedNodes: 0 });
    expect(await readFile(path.join(workspace, source.source.html), "utf8")).toBe(html);
    expect((await readNodeCodebase(workspace)).graph).toEqual(codebase.graph);
  });

  it("imports renumbered scenes without rewriting existing buttons, assets, or canvas positions", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const originalTree = first.tree!;
    const oldSection = playableStoryTreeSections(originalTree)[0]!;
    const before = await readNodeCodebase(workspace);
    const oldNode = before.graph.nodes.find((node) => node.id === oldSection.canvasNodeId)!;
    const withAsset = addPlayableNodeAsset(before.graph, oldNode.id, {
      name: "custom-background.png",
      type: "image",
      source: { kind: "library", assetId: "user-background" },
    });
    const originalHtml = await readFile(path.join(workspace, oldNode.source.html), "utf8");
    const customHtml = `${setPlayableBackdrop(originalHtml, withAsset.assetId, "image")!}
<button data-user-button="kept" style="left:123px;top:234px;width:87px;height:43px;transform:scale(1.25)">Custom</button>`;
    const customCss = `${await readFile(path.join(workspace, oldNode.source.css), "utf8")}
[data-user-button] { transform-origin: center; }`;
    before.editorLayout.nodes[oldNode.id] = { x: 321, y: 654 };
    await writeNodeCodebase(workspace, {
      graph: withAsset.graph,
      editorLayout: before.editorLayout,
      sources: { [oldNode.source.html]: customHtml, [oldNode.source.css]: customCss },
    });
    const oldFiles = new Map<string, string>();
    for (const node of before.graph.nodes) {
      for (const file of Object.values(node.source)) {
        oldFiles.set(file, await readFile(path.join(workspace, file), "utf8"));
      }
    }
    const imported = parseScreenplayText([
      "第1集", "1-1 序幕", "新增剧情", "1-2 开场", "固定剧情", "1-3 选择", "结束剧情",
    ], "new.txt").tree;
    const reconciled = reconcilePlayableStoryTree(originalTree, imported).tree;
    const synced = await syncPlayableStoryTree(workspace, originalTree, reconciled, true);
    const after = await readNodeCodebase(workspace);

    expect(synced.addedNodes).toBe(1);
    expect(after.graph.nodes).toHaveLength(3);
    expect(after.graph.edges).toHaveLength(2);
    expect(after.graph.assets).toEqual(withAsset.graph.assets);
    expect(after.graph.nodes.find((node) => node.id === oldNode.id)?.assets)
      .toEqual(withAsset.graph.nodes.find((node) => node.id === oldNode.id)!.assets);
    expect(after.editorLayout.nodes).toMatchObject(before.editorLayout.nodes);
    for (const [file, content] of oldFiles) {
      expect(await readFile(path.join(workspace, file), "utf8")).toBe(content);
    }
    const importedAgain = reconcilePlayableStoryTree(synced.tree!, imported).tree;
    const repeated = await syncPlayableStoryTree(workspace, synced.tree, importedAgain);
    expect(repeated).toMatchObject({ applied: true, addedNodes: 0, updatedNodes: 0 });
    for (const [file, content] of oldFiles) {
      expect(await readFile(path.join(workspace, file), "utf8")).toBe(content);
    }
  });

  it("creates missing scenes and only overwrites changed titles after confirmation", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());

    expect(first.applied).toBe(true);
    expect(first.addedNodes).toBe(2);
    const generated = first.tree!;
    const sections = playableStoryTreeSections(generated);
    const codebase = await readNodeCodebase(workspace);
    expect(codebase.graph.entryNodeId).toBe(sections[0]?.canvasNodeId);
    expect(codebase.graph.nodes).toHaveLength(2);
    expect(codebase.graph.edges).toHaveLength(1);

    const firstNode = codebase.graph.nodes.find((node) => node.id === sections[0]?.canvasNodeId)!;
    const originalLayout = structuredClone(codebase.editorLayout);
    const editedSource = "<main>author's existing scene source</main>";
    await writeFile(path.join(workspace, firstNode.source.html), editedSource);

    const changedTree = structuredClone(generated);
    playableStoryTreeSections(changedTree)[0]!.title = "Revised title";
    const preview = await syncPlayableStoryTree(workspace, generated, changedTree);

    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: firstNode.id,
      changes: expect.arrayContaining(["The Scene title will be updated from the story tree."]),
    }));
    expect(await readFile(path.join(workspace, firstNode.source.html), "utf8")).toBe(editedSource);

    const applied = await syncPlayableStoryTree(workspace, generated, changedTree, true);
    const after = await readNodeCodebase(workspace);
    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(after.graph.nodes.find((node) => node.id === firstNode.id)?.title).toBe("Revised title");
    expect(after.editorLayout).toEqual(originalLayout);
    expect(await readFile(path.join(workspace, firstNode.source.html), "utf8")).toBe(editedSource);
  });

  it("recreates deleted story-tree scenes without disturbing ordinary canvas nodes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const codebase = await readNodeCodebase(workspace);
    const manualNode = {
      id: "manual-scene",
      title: "手动场景",
      source: {
        html: "nodes/manual-scene/index.html",
        css: "nodes/manual-scene/style.css",
        javascript: "nodes/manual-scene/node.js",
      },
      assets: [],
      signals: [],
    };
    const manualPosition = { x: 760, y: 240 };
    await mkdir(path.join(workspace, "nodes", manualNode.id), { recursive: true });
    await writeFile(path.join(workspace, manualNode.source.html), "<main>Manual scene</main>");
    await writeFile(path.join(workspace, manualNode.source.css), "");
    await writeFile(path.join(workspace, manualNode.source.javascript), "export function mount() {}");
    await writeNodeCodebase(workspace, {
      graph: {
        ...codebase.graph,
        entryNodeId: manualNode.id,
        nodes: [manualNode],
        edges: [],
      },
      editorLayout: {
        ...codebase.editorLayout,
        nodes: { [manualNode.id]: manualPosition },
      },
    });

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      first.tree!,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(2);
    expect(after.graph.nodes).toHaveLength(3);
    expect(after.graph.entryNodeId).toBe(manualNode.id);
    expect(after.graph.nodes.find((node) => node.id === manualNode.id)).toEqual(manualNode);
    expect(after.editorLayout.nodes[manualNode.id]).toEqual(manualPosition);
    expect(after.graph.edges).toHaveLength(1);
    expect(playableStoryTreeSections(result.tree!).every((section) =>
      after.graph.nodes.some((node) => node.id === section.canvasNodeId),
    )).toBe(true);
  });

  it("does not recreate a screenplay-removed scene after its canvas node was deleted", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = structuredClone(first.tree!);
    const sections = playableStoryTreeSections(tree);
    sections[1]!.sourceRemoved = true;

    const codebase = await readNodeCodebase(workspace);
    const removedNodeId = sections[1]!.canvasNodeId!;
    const graph = {
      ...codebase.graph,
      nodes: codebase.graph.nodes.filter((node) => node.id !== removedNodeId),
      edges: codebase.graph.edges.filter((edge) =>
        edge.source.nodeId !== removedNodeId &&
        edge.targetNodeId !== removedNodeId,
      ),
    };
    const editorLayout = structuredClone(codebase.editorLayout);
    delete editorLayout.nodes[removedNodeId];
    await writeNodeCodebase(workspace, { graph, editorLayout });

    const result = await syncPlayableStoryTree(workspace, first.tree, tree);
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(0);
    expect(after.graph.nodes.map((node) => node.id)).not.toContain(removedNodeId);
  });

  it("detaches a removed chapter but keeps its canvas nodes, edges, and positions", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = removePlayableStoryTreeChapter(first.tree!, first.tree!.chapters[0]!.id);
    const before = await readNodeCodebase(workspace);
    const detachedSections = playableStoryTreeSections(tree);
    const detachedNodeIds = detachedSections.map((section) => section.canvasNodeId!);
    const detachedPositions = Object.fromEntries(
      detachedNodeIds.map((nodeId) => [nodeId, before.editorLayout.nodes[nodeId]]),
    );
    const detachedNode = before.graph.nodes.find((node) => node.id === detachedNodeIds[0])!;
    const retainedSource = "<main>kept as an ordinary canvas scene</main>";
    await writeFile(path.join(workspace, detachedNode.source.html), retainedSource);
    const result = await syncPlayableStoryTree(workspace, first.tree, tree, true);
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.tree).toBeDefined();
    expect(playableStoryTreeSections(result.tree!)).toHaveLength(0);
    expect(after.graph.nodes).toHaveLength(2);
    expect(after.graph.nodes.every((node) => node.storyTreeDetached)).toBe(true);
    expect(after.graph.edges).toHaveLength(1);
    expect(after.editorLayout.nodes).toMatchObject(detachedPositions);
    expect(await readFile(path.join(workspace, detachedNode.source.html), "utf8"))
      .toBe(retainedSource);
  });

  it("creates newly synced scenes and connects confirmed routes without moving existing scenes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const nextTree = parseScreenplayText([
      "第1集",
      "1-1 开场",
      "固定剧情",
      "1-2 选择",
      "结束剧情",
      "1-3 新增场景",
      "新增内容",
    ], "screenplay.txt").tree;
    const newSection = playableStoryTreeSections(nextTree)[2]!;
    const reconciled = structuredClone(first.tree!);
    reconciled.chapters[0]!.episodes[0]!.sections.push(newSection);
    reconciled.links.push({
      id: "link-confirmed-new-scene",
      fromSectionId: playableStoryTreeSections(reconciled)[1]!.id,
      toSectionId: newSection.id,
      label: "继续",
      status: "confirmed",
    });
    const existingPositions = structuredClone((await readNodeCodebase(workspace)).editorLayout.nodes);

    const preview = await syncPlayableStoryTree(workspace, first.tree, reconciled);
    const result = await syncPlayableStoryTree(workspace, first.tree, reconciled, true);
    const after = await readNodeCodebase(workspace);
    const generatedSection = playableStoryTreeSections(result.tree!)[2]!;
    const generatedNode = after.graph.nodes.find(
      (node) => node.id === generatedSection.canvasNodeId,
    )!;

    expect(preview.applied).toBe(false);
    expect(preview.confirmations.some((item) =>
      item.changes.includes("The Scene's tree connections will be updated."),
    )).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(1);
    expect(after.graph.nodes).toHaveLength(3);
    expect(after.graph.edges).toHaveLength(2);
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === playableStoryTreeSections(result.tree!)[1]!.canvasNodeId &&
      edge.targetNodeId === generatedNode.id,
    )).toBe(true);
    for (const [nodeId, position] of Object.entries(existingPositions)) {
      expect(after.editorLayout.nodes[nodeId]).toEqual(position);
    }
    expect(after.editorLayout.nodes[generatedNode.id]).toBeDefined();
  });

  it("moves the managed game entry only when the story tree adds an earlier scene", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const original = first.tree!;
    const originalSections = playableStoryTreeSections(original);
    const before = await readNodeCodebase(workspace);
    const originalEntryId = before.graph.entryNodeId;
    const originalPositions = structuredClone(before.editorLayout.nodes);
    const updatedTree = structuredClone(original);
    const earlierScene = structuredClone(originalSections[0]!);
    earlierScene.id = "ep-01-scene-00-prologue";
    earlierScene.sceneNumber = 0;
    earlierScene.title = "新增序幕";
    earlierScene.scriptText = "新增开场内容";
    earlierScene.beats = [{
      id: `${earlierScene.id}-beat-1`,
      kind: "plot",
      text: "新增开场内容",
    }];
    earlierScene.sourceSnapshot = {
      heading: "1-0 新增序幕",
      body: "新增开场内容",
      title: "新增序幕",
      beats: structuredClone(earlierScene.beats),
    };
    delete earlierScene.canvasNodeId;
    delete earlierScene.canvasSnapshot;
    updatedTree.chapters[0]!.episodes[0]!.sections.unshift(earlierScene);
    updatedTree.links.push({
      id: "prologue-to-opening",
      fromSectionId: earlierScene.id,
      toSectionId: originalSections[0]!.id,
      label: "进入故事",
      status: "confirmed",
    });

    const preview = await syncPlayableStoryTree(workspace, original, updatedTree);
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      changes: expect.arrayContaining(["The story entry Scene will be updated."]),
    }));

    const applied = await syncPlayableStoryTree(
      workspace,
      original,
      updatedTree,
      true,
    );
    const after = await readNodeCodebase(workspace);
    const generatedEntry = playableStoryTreeSections(applied.tree!)
      .find((section) => section.id === earlierScene.id)!;
    expect(after.graph.entryNodeId).toBe(generatedEntry.canvasNodeId);
    for (const [nodeId, position] of Object.entries(originalPositions)) {
      expect(after.editorLayout.nodes[nodeId]).toEqual(position);
    }
    expect(after.graph.nodes.find((node) => node.id === originalEntryId)?.title)
      .toBe(originalSections[0]!.title);
  });

  it("updates only changed story beats and preserves unrelated source and scenes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 门外",
      "雨夜，主角来到门前。",
      "长按门把手进入",
      "1-2 门内",
      "屋内空无一人。",
      "1-3 走廊",
      "脚步声从走廊深处传来。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const initialTree = first.tree!;
    const initialSections = playableStoryTreeSections(initialTree);
    const codebase = await readNodeCodebase(workspace);
    const firstNode = codebase.graph.nodes.find(
      (node) => node.id === initialSections[0]!.canvasNodeId,
    )!;
    const untouchedNode = codebase.graph.nodes.find(
      (node) => node.id === initialSections[1]!.canvasNodeId,
    )!;
    const firstPath = path.join(workspace, firstNode.source.html);
    const untouchedPath = path.join(workspace, untouchedNode.source.html);
    const firstHtml = await readFile(firstPath, "utf8");
    const untouchedHtml = await readFile(untouchedPath, "utf8");
    const authorMarkup = '<aside data-author-content>作者手动添加，必须保留</aside>';
    await writeFile(
      firstPath,
      firstHtml.replace("</main>", `${authorMarkup}</main>`),
    );

    const updatedTree = structuredClone(initialTree);
    const updatedBeats = playableStoryTreeSections(updatedTree)[0]!.beats;
    updatedBeats[0]!.text = "雨夜，主角带着钥匙来到门前。";
    const preview = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
    );
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: firstNode.id,
      changes: expect.arrayContaining([
        "Story-tree scene content will be updated.",
      ]),
    }));
    expect(await readFile(firstPath, "utf8")).toBe(
      firstHtml.replace("</main>", `${authorMarkup}</main>`),
    );
    const applied = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
      true,
    );
    const after = await readNodeCodebase(workspace);
    const updatedHtml = await readFile(firstPath, "utf8");

    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(updatedHtml).toContain("雨夜，主角带着钥匙来到门前。");
    expect(updatedHtml).toContain("长按门把手进入");
    expect(updatedHtml).toContain(authorMarkup);
    expect(await readFile(untouchedPath, "utf8")).toBe(untouchedHtml);
    expect(after.editorLayout).toEqual(codebase.editorLayout);
    expect(after.graph.nodes.find((node) => node.id === untouchedNode.id))
      .toEqual(untouchedNode);
  });

  it("requires confirmation before replacing a story beat edited on the canvas", async () => {
    const workspace = await createWorkspace();
    const sourceTree = parseScreenplayText([
      "第1集",
      "1-1 线索",
      "找到一封信。",
      "主角决定继续调查。",
      "1-2 调查",
      "前往档案室。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, sourceTree);
    const initialTree = first.tree!;
    const firstSection = playableStoryTreeSections(initialTree)[0]!;
    const codebase = await readNodeCodebase(workspace);
    const node = codebase.graph.nodes.find(
      (candidate) => candidate.id === firstSection.canvasNodeId,
    )!;
    const htmlPath = path.join(workspace, node.source.html);
    const originalHtml = await readFile(htmlPath, "utf8");
    const editedHtml = originalHtml.replace(
      "找到一封信。",
      "我手动重写了这段。",
    );
    await writeFile(htmlPath, editedHtml);

    const updatedTree = structuredClone(initialTree);
    playableStoryTreeSections(updatedTree)[0]!.beats[0]!.text =
      "发现一封写着日期的信。";
    const preview = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
    );

    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: node.id,
      changes: expect.arrayContaining([
        "A story-tree beat was edited on the canvas and will be replaced.",
      ]),
    }));
    expect(await readFile(htmlPath, "utf8")).toBe(editedHtml);

    const applied = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
      true,
    );
    const finalHtml = await readFile(htmlPath, "utf8");
    expect(applied.applied).toBe(true);
    expect(finalHtml).toContain("发现一封写着日期的信。");
    expect(finalHtml).toContain("主角决定继续调查。");
    expect(finalHtml).not.toContain("我手动重写了这段。");
  });

  it("lays generated branches left to right on separate rows with fixed clearance", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 开始",
      "开始剧情",
      "1-2 分支A",
      "A路线",
      "1-3 分支B",
      "B路线",
      "1-4 A后续",
      "A后续",
      "1-5 B后续",
      "B后续",
      "1-6 汇合",
      "汇合剧情",
    ], "screenplay.txt").tree;
    const sections = playableStoryTreeSections(tree);
    const [start, branchA, branchB, afterA, afterB, merge] = sections;
    tree.links = [
      [start!, branchA!],
      [start!, branchB!],
      [branchA!, afterA!],
      [branchB!, afterB!],
      [afterA!, merge!],
      [afterB!, merge!],
    ].map(([from, to], index) => ({
      id: `route-${index}`,
      fromSectionId: from.id,
      toSectionId: to.id,
      label: "继续",
      status: "confirmed" as const,
    }));

    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const codebase = await readNodeCodebase(workspace);
    const positions = new Map(
      playableStoryTreeSections(result.tree!).map((section) => [
        section.id,
        codebase.editorLayout.nodes[section.canvasNodeId!]!,
      ]),
    );
    const gap = 140;
    const aspect = codebase.graph.viewport.width / codebase.graph.viewport.height;
    const stageWidth = 440 * Math.min(1, aspect);
    const stageHeight = 440 / Math.max(1, aspect);
    const columnStep = stageWidth + gap;
    const rowStep = stageHeight + 28 + gap;

    expect(positions.get(branchA!.id)!.x - positions.get(start!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(positions.get(branchA!.id)!.x).toBe(positions.get(branchB!.id)!.x);
    expect(Math.abs(positions.get(branchA!.id)!.y - positions.get(branchB!.id)!.y))
      .toBeGreaterThanOrEqual(rowStep);
    expect(positions.get(branchA!.id)!.y).toBe(positions.get(start!.id)!.y);
    expect(positions.get(branchA!.id)!.y).toBe(positions.get(afterA!.id)!.y);
    expect(positions.get(branchB!.id)!.y).toBe(positions.get(afterB!.id)!.y);
    expect(positions.get(afterA!.id)!.x - positions.get(branchA!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(positions.get(merge!.id)!.x - positions.get(afterA!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(positions.get(merge!.id)!.y).toBe(positions.get(start!.id)!.y);
    expect(codebase.graph.edges).toHaveLength(6);
  });

  it("generates missing nodes without overwriting existing canvas scenes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const existingTree = first.tree!;
    const existingSections = playableStoryTreeSections(existingTree);
    const before = await readNodeCodebase(workspace);
    const existingNode = before.graph.nodes.find(
      (node) => node.id === existingSections[0]!.canvasNodeId,
    )!;
    const graph = structuredClone(before.graph);
    graph.nodes.find((node) => node.id === existingNode.id)!.title = "画布手动修改";
    await writeNodeCodebase(workspace, {
      graph,
      editorLayout: before.editorLayout,
    });

    const nextTree = structuredClone(existingTree);
    const newSection = parseScreenplayText([
      "第1集",
      "1-3 新场景",
      "新内容",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections[0]!;
    nextTree.chapters[0]!.episodes[0]!.sections.push(newSection);
    nextTree.links.push({
      id: "new-scene-route",
      fromSectionId: newSection.id,
      toSectionId: existingSections[0]!.id,
      label: "回到开场",
      status: "confirmed",
    });

    const result = await syncPlayableStoryTree(
      workspace,
      existingTree,
      nextTree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const generated = playableStoryTreeSections(result.tree!).find(
      (section) => section.id === newSection.id,
    )!;

    expect(result.applied).toBe(true);
    expect(result.confirmations).toHaveLength(0);
    expect(result.addedNodes).toBe(1);
    expect(result.updatedNodes).toBe(0);
    expect(after.graph.nodes.find((node) => node.id === existingNode.id)?.title)
      .toBe("画布手动修改");
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === generated.canvasNodeId &&
      edge.targetNodeId === existingNode.id,
    )).toBe(true);
  });

  it("adds a selected Library video as the background of a generated scene", async () => {
    const workspace = await createWorkspace();
    const tree = simpleTree();
    const scene = playableStoryTreeSections(tree)[0]!;
    const result = await syncPlayableStoryTree(
      workspace,
      undefined,
      tree,
      false,
      "generate",
      {},
      {
        [scene.id]: {
          assetId: "library-opening-video",
          name: "第1集_开场.mp4",
        },
      },
    );
    const codebase = await readNodeCodebase(workspace);
    const linkedScene = playableStoryTreeSections(result.tree!).find(
      (candidate) => candidate.id === scene.id,
    )!;
    const node = codebase.graph.nodes.find(
      (candidate) => candidate.id === linkedScene.canvasNodeId,
    )!;
    const assetId = Object.entries(codebase.graph.assets).find(
      ([, asset]) =>
        asset.source.kind === "library" &&
        asset.source.assetId === "library-opening-video",
    )?.[0];
    const html = await readFile(path.join(workspace, node.source.html), "utf8");

    expect(result.addedVideos).toBe(1);
    expect(result.skippedVideoAssignments).toBe(0);
    expect(node.assets).toContain(assetId);
    expect(html).toContain(`data-asset="${assetId}" data-type="video"`);
  });

  it("preserves an existing scene background instead of replacing it with a matched video", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const section = playableStoryTreeSections(first.tree!)[0]!;
    const before = await readNodeCodebase(workspace);
    const node = before.graph.nodes.find(
      (candidate) => candidate.id === section.canvasNodeId,
    )!;
    const existing = addPlayableNodeAsset(before.graph, node.id, {
      name: "manual-background.mp4",
      type: "video",
      source: {
        kind: "library",
        assetId: "library-manual-background",
      },
    });
    const originalHtml = await readFile(path.join(workspace, node.source.html), "utf8");
    const htmlWithBackground = setPlayableBackdrop(
      originalHtml,
      existing.assetId,
      "video",
    )!;
    await writeNodeCodebase(workspace, {
      graph: existing.graph,
      editorLayout: before.editorLayout,
      sources: { [node.source.html]: htmlWithBackground },
    });

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      first.tree!,
      false,
      "generate",
      {},
      {
        [section.id]: {
          assetId: "library-matched-background",
          name: "第1集_开场.mp4",
        },
      },
    );
    const after = await readNodeCodebase(workspace);
    const updatedNode = after.graph.nodes.find(
      (candidate) => candidate.id === node.id,
    )!;
    const updatedHtml = await readFile(
      path.join(workspace, updatedNode.source.html),
      "utf8",
    );

    expect(result.addedVideos).toBe(0);
    expect(updatedNode.assets).toContain(existing.assetId);
    expect(updatedHtml).toContain(`data-asset="${existing.assetId}"`);
    expect(updatedHtml).not.toContain("library-matched-background");
    expect(
      Object.values(after.graph.assets).some(
        (asset) =>
          asset.source.kind === "library" &&
          asset.source.assetId === "library-matched-background",
      ),
    ).toBe(false);
  });

  it.each(["confirmed", "suggested"] as const)("adds %s routes from existing scenes to newly generated scenes", async (status) => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const existingTree = first.tree!;
    const existingSections = playableStoryTreeSections(existingTree);
    const before = await readNodeCodebase(workspace);
    const graphWithManualExit = structuredClone(before.graph);
    const existingSource = graphWithManualExit.nodes.find(
      (node) => node.id === existingSections[1]!.canvasNodeId,
    )!;
    graphWithManualExit.nodes
      .find((node) => node.id === existingSource.id)!
      .signals.push({ id: "manual-return", label: "手动返回" });
    graphWithManualExit.edges.push({
      id: "manual-return-edge",
      source: { nodeId: existingSource.id, signal: "manual-return" },
      targetNodeId: existingSections[0]!.canvasNodeId!,
      mode: "replace",
    });
    await writeNodeCodebase(workspace, {
      graph: graphWithManualExit,
      editorLayout: before.editorLayout,
    });
    const existingCodebase = await readNodeCodebase(workspace);
    const existingEdges = structuredClone(existingCodebase.graph.edges);
    const existingPositions = structuredClone(existingCodebase.editorLayout.nodes);
    const nextTree = structuredClone(existingTree);
    const newSection = parseScreenplayText([
      "第1集",
      "1-3 新场景",
      "新内容",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections[0]!;
    nextTree.chapters[0]!.episodes[0]!.sections.push(newSection);
    nextTree.links.push({
      id: "existing-to-new-scene",
      fromSectionId: existingSections[1]!.id,
      toSectionId: newSection.id,
      label: "继续",
      status,
    });

    const result = await syncPlayableStoryTree(
      workspace,
      existingTree,
      nextTree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const generated = playableStoryTreeSections(result.tree!).find(
      (section) => section.id === newSection.id,
    )!;

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(1);
    expect(after.graph.edges).toEqual(expect.arrayContaining(existingEdges));
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({ id: "manual-return-edge" }),
    );
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === existingSource.id &&
      edge.targetNodeId === generated.canvasNodeId,
    )).toBe(true);
    expect(after.editorLayout.nodes).toMatchObject(existingPositions);
  });

  it("adds positioned button presets for confirmed routes from an existing scene", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = structuredClone(first.tree!);
    const sections = playableStoryTreeSections(tree);
    const addedScenes = parseScreenplayText([
      "第1集",
      "1-3 左侧出口",
      "左侧剧情",
      "1-4 右侧出口",
      "右侧剧情",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections;
    sections[1]!.kind = "scene";
    tree.chapters[0]!.episodes[0]!.sections.push(...addedScenes);
    tree.links.push(
      {
        id: "confirmed-left-exit",
        fromSectionId: sections[1]!.id,
        toSectionId: addedScenes[0]!.id,
        label: "前往左侧",
        status: "confirmed",
      },
      {
        id: "confirmed-right-exit",
        fromSectionId: sections[1]!.id,
        toSectionId: addedScenes[1]!.id,
        label: "前往右侧",
        status: "confirmed",
      },
    );

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      tree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const sourceNode = after.graph.nodes.find(
      (node) => node.id === sections[1]!.canvasNodeId,
    )!;
    const sourceHtml = await readFile(
      path.join(workspace, sourceNode.source.html),
      "utf8",
    );
    const addedButtons = [...sourceHtml.matchAll(
      /<button\b(?=[^>]*data-putenggame-button-preset)(?=[^>]*data-signal="([^"]+)")[^>]*style="([^"]+)"/g,
    )];
    const addedNodeIds = new Set(
      playableStoryTreeSections(result.tree!)
        .filter((section) => addedScenes.some((added) => added.id === section.id))
        .map((section) => section.canvasNodeId),
    );
    const targetNodes = after.graph.nodes.filter((node) => addedNodeIds.has(node.id));
    const targetHtml = await Promise.all(targetNodes.map((node) =>
      readFile(path.join(workspace, node.source.html), "utf8"),
    ));

    expect(result.applied).toBe(true);
    expect(addedButtons).toHaveLength(2);
    expect(sourceHtml).toContain(">前往左侧</button>");
    expect(sourceHtml).toContain(">前往右侧</button>");
    expect(addedButtons[0]![2]).not.toBe(addedButtons[1]![2]);
    expect(after.graph.edges.filter((edge) =>
      edge.source.nodeId === sourceNode.id,
    )).toHaveLength(2);
    expect(targetHtml.every((content) =>
      !content.includes("data-putenggame-button-preset"),
    )).toBe(true);
  });

  it("composes a Choice scene from the actual action instead of retaining demo buttons", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 选择",
      "选择1：前往左侧",
      "1-2 左侧",
      "到达左侧",
    ], "screenplay.txt").tree;

    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const after = await readNodeCodebase(workspace);
    const sourceSection = playableStoryTreeSections(result.tree!)[0]!;
    const sourceNode = after.graph.nodes.find(
      (node) => node.id === sourceSection.canvasNodeId,
    )!;
    const html = await readFile(path.join(workspace, sourceNode.source.html), "utf8");

    expect(sourceNode.signals).toHaveLength(1);
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({
        source: { nodeId: sourceNode.id, signal: sourceNode.signals[0]!.id },
      }),
    );
    expect(html).toContain(`data-signal="${sourceNode.signals[0]!.id}"`);
    expect(html).toContain(">前往左侧</button>");
    expect(html).not.toContain("I had no choice.");
    expect(html).toContain("data-putenggame-button-preset");
  });

  it("updates only a changed generated operation button and preserves its custom attributes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 门外",
      "雨夜，主角来到门前。",
      "长按门把手2秒打开门",
      "1-2 门内",
      "屋内空无一人。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const generatedTree = first.tree!;
    const firstSection = playableStoryTreeSections(generatedTree)[0]!;
    const node = (await readNodeCodebase(workspace)).graph.nodes.find(
      (candidate) => candidate.id === firstSection.canvasNodeId,
    )!;
    const nextSection = playableStoryTreeSections(generatedTree)[1]!;
    const nextNode = (await readNodeCodebase(workspace)).graph.nodes.find(
      (candidate) => candidate.id === nextSection.canvasNodeId,
    )!;
    const htmlPath = path.join(workspace, node.source.html);
    const untouchedHtmlPath = path.join(workspace, nextNode.source.html);
    const initialHtml = await readFile(htmlPath, "utf8");
    const untouchedHtml = await readFile(untouchedHtmlPath, "utf8");
    expect(initialHtml).toContain('data-putenggame-motion="hold-charge"');
    expect(initialHtml).toContain('data-putenggame-motion-interaction="hold"');
    const customizedHtml = initialHtml.replace(
      'data-putenggame-story-tree-generated="true"',
      'data-putenggame-story-tree-generated="true" data-author-note="keep-this" data-putenggame-motion-press-effect="green-particle-burst" data-putenggame-motion-effect-color="#3478f6"',
    );
    await writeFile(htmlPath, customizedHtml);

    const updatedTree = structuredClone(generatedTree);
    playableStoryTreeSections(updatedTree)[0]!.beats[1]!.text =
      "向左滑动门把手后进入";
    const preview = await syncPlayableStoryTree(
      workspace,
      generatedTree,
      updatedTree,
    );
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: node.id,
      changes: expect.arrayContaining([
        "A generated story button will be updated.",
        "A generated story button was edited on the canvas.",
      ]),
    }));
    expect(await readFile(htmlPath, "utf8")).toBe(customizedHtml);

    const applied = await syncPlayableStoryTree(
      workspace,
      generatedTree,
      updatedTree,
      true,
    );
    const updatedHtml = await readFile(htmlPath, "utf8");
    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(updatedHtml).toContain('data-putenggame-motion="swipe-button"');
    expect(updatedHtml).toContain('data-putenggame-motion-interaction="swipe-left"');
    expect(updatedHtml).not.toContain('data-putenggame-motion="hold-charge"');
    expect(updatedHtml).toContain('data-author-note="keep-this"');
    expect(updatedHtml).toContain('data-putenggame-motion-press-effect="green-particle-burst"');
    expect(updatedHtml).toContain('data-putenggame-motion-effect-color="#3478f6"');
    expect(updatedHtml).toContain("雨夜，主角来到门前。");
    expect(updatedHtml).toContain("向左滑动门把手后进入");
    expect(await readFile(untouchedHtmlPath, "utf8")).toBe(untouchedHtml);
  });

  it("recommends presets for explicit choices and endings and applies overrides only to new nodes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 分岔点",
      "选择A1：走左边",
      "1-2 普通场景",
      "固定剧情",
      "1-3 结局展示",
      "主角离开",
    ], "screenplay.txt").tree;
    const sections = playableStoryTreeSections(tree);
    const result = await syncPlayableStoryTree(
      workspace,
      undefined,
      tree,
      false,
      "generate",
      { [sections[1]!.id]: "qte" },
    );
    const codebase = await readNodeCodebase(workspace);
    const generatedSections = playableStoryTreeSections(result.tree!);
    const signalsFor = (sectionIndex: number) =>
      codebase.graph.nodes.find(
        (node) => node.id === generatedSections[sectionIndex]!.canvasNodeId,
      )!.signals.map((signal) => signal.id);

    expect(result.addedNodes).toBe(3);
    expect(signalsFor(0)).toHaveLength(1);
    expect(signalsFor(1)).toEqual(expect.arrayContaining(["success", "fail"]));
    expect(signalsFor(2)).toEqual([]);
  });
});

describe("playable story tree storage", () => {
  it("persists valid trees and rejects stale revisions", async () => {
    const workspace = await createWorkspace();
    const original = await readPlayableStoryTree(workspace);
    const tree = simpleTree();
    const saved = await writePlayableStoryTree(workspace, tree, original.revision);

    expect((await readPlayableStoryTree(workspace)).tree).toEqual(tree);
    await expect(
      writePlayableStoryTree(workspace, tree, original.revision),
    ).rejects.toBeInstanceOf(PlayableStoryTreeConflictError);
    expect(saved.revision).not.toBe(original.revision);
  });
});
