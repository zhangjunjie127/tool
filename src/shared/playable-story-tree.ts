export type PlayableStoryTreeBeatKind =
  | "plot"
  | "operation"
  | "state"
  | "choice";

export interface PlayableStoryTreeBeat {
  id: string;
  kind: PlayableStoryTreeBeatKind;
  text: string;
}

export interface PlayableStoryTreeBeatGroup {
  kind: PlayableStoryTreeBeatKind;
  beats: PlayableStoryTreeBeat[];
}

export interface PlayableStoryTreeSourceSnapshot {
  heading: string;
  body: string;
  title: string;
  beats: PlayableStoryTreeBeat[];
}

export interface PlayableStoryTreePendingSource {
  heading: string;
  body: string;
  title: string;
  beats: PlayableStoryTreeBeat[];
}

export interface PlayableStoryTreeCanvasSnapshot {
  title: string;
  exits: Array<{
    id: string;
    label: string;
    targetSectionId: string;
  }>;
  beats?: Array<{
    id: string;
    signature: string;
  }>;
  storyButtons?: Array<{
    signal: string;
    beatId?: string;
    signature: string;
  }>;
}

export interface PlayableStoryTreeSection {
  id: string;
  episodeNumber: number;
  sceneNumber: number;
  sceneSuffix?: string;
  title: string;
  kind: "scene" | "branch" | "merge" | "ending";
  objective: string;
  prerequisite: string;
  beats: PlayableStoryTreeBeat[];
  scriptText: string;
  sourceManaged?: boolean;
  sourceSnapshot: PlayableStoryTreeSourceSnapshot;
  analysisFingerprint?: string;
  sourcePending?: PlayableStoryTreePendingSource;
  sourceRemoved?: boolean;
  canvasNodeId?: string;
  canvasSnapshot?: PlayableStoryTreeCanvasSnapshot;
}

export interface PlayableStoryTreeEpisode {
  id: string;
  number: number;
  title: string;
  sourceTitle?: string;
  sourceHeading?: string;
  sections: PlayableStoryTreeSection[];
}

export interface PlayableStoryTreeChapter {
  id: string;
  title: string;
  sourceTitle?: string;
  sourceHeading?: string;
  episodes: PlayableStoryTreeEpisode[];
}

export interface PlayableStoryTreeLink {
  id: string;
  fromSectionId: string;
  toSectionId: string;
  label: string;
  status: "confirmed" | "suggested";
  sourceSnapshot?: {
    fromSectionId: string;
    toSectionId: string;
    label: string;
    status?: "confirmed" | "suggested";
  };
}

export interface PlayableStoryTree {
  version: 1;
  source?: {
    fileName: string;
    fingerprint: string;
  };
  chapters: PlayableStoryTreeChapter[];
  links: PlayableStoryTreeLink[];
}

export interface ParsedPlayableStoryTree {
  tree: PlayableStoryTree;
  warnings: PlayableStoryTreeWarning[];
}

export type PlayableStoryTreeWarning =
  | "no-scenes"
  | "unnamed-chapter"
  | "routes-need-review";

export interface PlayableStoryTreeDiff {
  added: string[];
  changed: string[];
  unchanged: string[];
  removed: string[];
  changedLinks: string[];
}

export interface PlayableStoryTreeCanvasStatus {
  pendingRemovalNodeIds: string[];
  pendingGenerationCount: number;
}

export interface PlayableStoryTreeCanvasEdge {
  sourceNodeId: string;
  sourceSignalId: string;
  targetNodeId: string;
}

const MAX_CHAPTERS = 100;
const MAX_EPISODES = 1_000;
const MAX_SECTIONS = 500;
const MAX_LINKS = 2_000;
const MAX_SCRIPT_TEXT = 1_000_000;

export function playableStoryTreeSections(
  tree: PlayableStoryTree,
): PlayableStoryTreeSection[] {
  return tree.chapters.flatMap((chapter) =>
    chapter.episodes.flatMap((episode) => episode.sections),
  );
}

export function playableStoryTreeNeedsRouteReview(
  tree: PlayableStoryTree,
): boolean {
  const sections = playableStoryTreeSections(tree).filter(
    (section) => !section.sourceRemoved,
  );
  const sectionIds = new Set(sections.map((section) => section.id));
  const links = tree.links.filter(
    (link) =>
      sectionIds.has(link.fromSectionId) && sectionIds.has(link.toSectionId),
  );
  return (
    links.some((link) => link.status === "suggested") ||
    sections.some(
      (section, index) =>
        section.kind === "branch" &&
        (
          !links.some((link) => link.toSectionId === section.id) ||
          (index < sections.length - 1 &&
            !links.some((link) => link.fromSectionId === section.id))
        ),
    )
  );
}

export function playableStoryTreeEpisodeHasInteraction(
  episode: PlayableStoryTreeEpisode,
  links: readonly PlayableStoryTreeLink[],
): boolean {
  const sections = episode.sections.filter((section) => !section.sourceRemoved);
  const sectionIds = new Set(sections.map((section) => section.id));
  if (
    sections.some(
      (section) =>
        section.kind === "branch" ||
        section.beats.some(
          (beat) => beat.kind === "operation" || beat.kind === "choice",
        ),
    )
  )
    return true;

  const outgoingCounts = new Map<string, number>();
  for (const link of links) {
    if (!sectionIds.has(link.fromSectionId)) continue;
    outgoingCounts.set(
      link.fromSectionId,
      (outgoingCounts.get(link.fromSectionId) ?? 0) + 1,
    );
  }
  return [...outgoingCounts.values()].some((count) => count > 1);
}

export function recommendedPlayableStoryTreeNodePreset(
  section: PlayableStoryTreeSection,
): "blank" | "choice" | "ending" {
  if (section.kind === "ending") return "ending";
  if (section.beats.some((beat) => beat.kind === "choice")) return "choice";
  return "blank";
}

export function playableStoryTreeAnalysisFingerprint(
  chapter: PlayableStoryTreeChapter,
  episode: PlayableStoryTreeEpisode,
  section: PlayableStoryTreeSection,
): string {
  const index = episode.sections.findIndex((item) => item.id === section.id);
  const source = section.sourcePending ?? {
    heading: section.sourceSnapshot.heading,
    body: section.scriptText,
    title: section.title,
    beats: section.beats,
  };
  return fingerprint(JSON.stringify({
    chapter: { id: chapter.id, title: chapter.title },
    episode: { id: episode.id, number: episode.number, title: episode.title },
    section: {
      id: section.id,
      title: section.title,
      kind: section.kind,
      heading: source.heading,
      body: source.body,
      previous: episode.sections[index - 1]?.id,
      next: episode.sections[index + 1]?.id,
    },
  }));
}

export function playableStoryTreeCanvasStatus(
  tree: PlayableStoryTree,
  existingCanvasNodeIds?: ReadonlySet<string>,
): PlayableStoryTreeCanvasStatus {
  const sections = playableStoryTreeSections(tree);
  return {
    pendingRemovalNodeIds: [...new Set(sections
      .filter((section) =>
        section.sourceRemoved &&
        section.canvasNodeId &&
        (!existingCanvasNodeIds || existingCanvasNodeIds.has(section.canvasNodeId)),
      )
      .map((section) => section.canvasNodeId!))],
    pendingGenerationCount: sections.filter(
      (section) =>
        !section.sourceRemoved &&
        (!section.canvasNodeId ||
          (existingCanvasNodeIds && !existingCanvasNodeIds.has(section.canvasNodeId))),
    ).length,
  };
}

/** Marks linked Scenes for detaching while discarding additions that never reached the canvas. */
export function removePlayableStoryTreeChapter(
  tree: PlayableStoryTree,
  chapterId: string,
): PlayableStoryTree {
  const chapter = tree.chapters.find((item) => item.id === chapterId);
  if (!chapter) return tree;
  const removedIds = new Set(
    chapter.episodes.flatMap((episode) =>
      episode.sections.map((section) => section.id),
    ),
  );
  const chapters = tree.chapters.flatMap((item) => {
    const episodes = item.episodes.flatMap((episode) => {
      const sections = episode.sections.flatMap((section) => {
        if (item.id !== chapterId) return [section];
        return section.canvasNodeId
          ? [{ ...section, sourceRemoved: true }]
          : [];
      });
      return sections.length ? [{ ...episode, sections }] : [];
    });
    return episodes.length ? [{ ...item, episodes }] : [];
  });
  return {
    ...tree,
    chapters,
    links: tree.links.filter(
      (link) => !removedIds.has(link.fromSectionId) && !removedIds.has(link.toSectionId),
    ),
  };
}

/** Removes an Episode from the tree while retaining linked Scenes for detaching. */
export function removePlayableStoryTreeEpisode(
  tree: PlayableStoryTree,
  chapterId: string,
  episodeId: string,
): PlayableStoryTree {
  const chapter = tree.chapters.find((item) => item.id === chapterId);
  const episode = chapter?.episodes.find((item) => item.id === episodeId);
  if (!chapter || !episode) return tree;

  const removedIds = new Set(episode.sections.map((section) => section.id));
  const chapters = tree.chapters.map((item) =>
    item.id !== chapterId
      ? item
      : {
          ...item,
          episodes: item.episodes.flatMap((current) => {
            if (current.id !== episodeId) return [current];
            const sections = current.sections.flatMap((section) =>
              section.canvasNodeId
                ? [{ ...section, sourceRemoved: true }]
                : [],
            );
            return sections.length ? [{ ...current, sections }] : [];
          }),
        },
  );
  return {
    ...tree,
    chapters,
    links: tree.links.filter(
      (link) =>
        !removedIds.has(link.fromSectionId) &&
        !removedIds.has(link.toSectionId),
    ),
  };
}

/** Removes a Scene from the tree while retaining linked canvas Nodes for detaching. */
export function removePlayableStoryTreeSection(
  tree: PlayableStoryTree,
  chapterId: string,
  episodeId: string,
  sectionId: string,
): PlayableStoryTree {
  const chapter = tree.chapters.find((item) => item.id === chapterId);
  const episode = chapter?.episodes.find((item) => item.id === episodeId);
  const section = episode?.sections.find((item) => item.id === sectionId);
  if (!chapter || !episode || !section) return tree;

  const chapters = tree.chapters.map((item) =>
    item.id !== chapterId
      ? item
      : {
          ...item,
          episodes: item.episodes.map((current) =>
            current.id !== episodeId
              ? current
              : {
                  ...current,
                  sections: current.sections.flatMap((currentSection) => {
                    if (currentSection.id !== sectionId) return [currentSection];
                    return currentSection.canvasNodeId
                      ? [{ ...currentSection, sourceRemoved: true }]
                      : [];
                  }),
                },
          ),
        },
  );
  return {
    ...tree,
    chapters,
    links: tree.links.filter(
      (link) =>
        link.fromSectionId !== sectionId && link.toSectionId !== sectionId,
    ),
  };
}

/** Removes detached Scene records after sync; their ordinary canvas Nodes remain. */
export function finalizePlayableStoryTreeRemovals(
  tree: PlayableStoryTree,
): PlayableStoryTree {
  const removedIds = new Set(
    playableStoryTreeSections(tree)
      .filter((section) => section.sourceRemoved)
      .map((section) => section.id),
  );
  if (!removedIds.size) return tree;
  const chapters = tree.chapters.flatMap((chapter) => {
    const episodes = chapter.episodes.flatMap((episode) => {
      const sections = episode.sections.filter((section) => !section.sourceRemoved);
      return sections.length ? [{ ...episode, sections }] : [];
    });
    return episodes.length ? [{ ...chapter, episodes }] : [];
  });
  return {
    ...tree,
    chapters,
    links: tree.links.filter(
      (link) => !removedIds.has(link.fromSectionId) && !removedIds.has(link.toSectionId),
    ),
  };
}

export function isPlayableStoryTree(value: unknown): value is PlayableStoryTree {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.chapters) || !Array.isArray(value.links)) {
    return false;
  }
  if (value.chapters.length > MAX_CHAPTERS || value.links.length > MAX_LINKS) return false;
  if (
    value.source !== undefined &&
    (!isRecord(value.source) ||
      typeof value.source.fileName !== "string" ||
      value.source.fileName.length > 240 ||
      typeof value.source.fingerprint !== "string" ||
      value.source.fingerprint.length > 128)
  ) return false;

  let episodeCount = 0;
  let sectionCount = 0;
  const sectionIds = new Set<string>();
  const chapterIds = new Set<string>();
  const episodeIds = new Set<string>();
  for (const chapter of value.chapters) {
    if (
      !isRecord(chapter) ||
      !validText(chapter.id, 120) ||
      chapterIds.has(chapter.id) ||
      !validText(chapter.title, 240) ||
      (chapter.sourceTitle !== undefined && !validText(chapter.sourceTitle, 240)) ||
      (chapter.sourceHeading !== undefined && !validText(chapter.sourceHeading, 2_000)) ||
      !Array.isArray(chapter.episodes)
    ) return false;
    chapterIds.add(chapter.id);
    episodeCount += chapter.episodes.length;
    if (episodeCount > MAX_EPISODES) return false;
    for (const episode of chapter.episodes) {
      if (
        !isRecord(episode) ||
        !validText(episode.id, 120) ||
        episodeIds.has(episode.id) ||
        !Number.isInteger(episode.number) ||
        (episode.number as number) < 0 ||
        !validText(episode.title, 240) ||
        (episode.sourceTitle !== undefined && !validText(episode.sourceTitle, 240)) ||
        (episode.sourceHeading !== undefined && !validText(episode.sourceHeading, 2_000)) ||
        !Array.isArray(episode.sections)
      ) return false;
      episodeIds.add(episode.id);
      sectionCount += episode.sections.length;
      if (sectionCount > MAX_SECTIONS) return false;
      for (const section of episode.sections) {
        if (
          !isStorySection(section) ||
          section.episodeNumber !== episode.number ||
          section.episodeNumber < 0 ||
          section.sceneNumber < 0 ||
          sectionIds.has(section.id)
        ) return false;
        sectionIds.add(section.id);
      }
    }
  }

  const linkIds = new Set<string>();
  for (const link of value.links) {
    if (
      !isRecord(link) ||
      !validText(link.id, 240) ||
      linkIds.has(link.id) ||
      !validText(link.fromSectionId, 120) ||
      !validText(link.toSectionId, 120) ||
      !validText(link.label, 240) ||
      (link.status !== "confirmed" && link.status !== "suggested") ||
      (link.sourceSnapshot !== undefined &&
        (!isRecord(link.sourceSnapshot) ||
          !validText(link.sourceSnapshot.fromSectionId, 120) ||
          !validText(link.sourceSnapshot.toSectionId, 120) ||
          !validText(link.sourceSnapshot.label, 240) ||
          (link.sourceSnapshot.status !== undefined &&
            link.sourceSnapshot.status !== "confirmed" &&
            link.sourceSnapshot.status !== "suggested")))
    ) return false;
    linkIds.add(link.id);
    if (!sectionIds.has(link.fromSectionId) || !sectionIds.has(link.toSectionId)) return false;
  }
  return true;
}

function isStorySection(value: unknown): value is PlayableStoryTreeSection {
  if (
    !isRecord(value) ||
    !validText(value.id, 120) ||
    !Number.isInteger(value.episodeNumber) ||
    !Number.isInteger(value.sceneNumber) ||
    (value.sceneSuffix !== undefined && !validText(value.sceneSuffix, 4)) ||
    !validText(value.title, 240) ||
    !["scene", "branch", "merge", "ending"].includes(String(value.kind)) ||
    !validText(value.objective, 2_000) ||
    !validText(value.prerequisite, 2_000) ||
    !isBeatList(value.beats) ||
    !validText(value.scriptText, MAX_SCRIPT_TEXT) ||
    !isSourceSnapshot(value.sourceSnapshot)
  ) return false;
  if (value.canvasNodeId !== undefined && !validText(value.canvasNodeId, 120)) return false;
  if (value.analysisFingerprint !== undefined && !validText(value.analysisFingerprint, 128)) return false;
  if (value.sourceManaged !== undefined && typeof value.sourceManaged !== "boolean") return false;
  if (value.canvasSnapshot !== undefined && !isCanvasSnapshot(value.canvasSnapshot)) return false;
  if (value.sourcePending !== undefined && !isPendingSource(value.sourcePending)) return false;
  if (value.sourceRemoved !== undefined && typeof value.sourceRemoved !== "boolean") return false;
  return true;
}

function isSourceSnapshot(value: unknown): value is PlayableStoryTreeSourceSnapshot {
  return isRecord(value) &&
    validText(value.heading, 2_000) &&
    validText(value.body, MAX_SCRIPT_TEXT) &&
    validText(value.title, 240) &&
    isBeatList(value.beats);
}

function isPendingSource(value: unknown): value is PlayableStoryTreePendingSource {
  return isRecord(value) &&
    validText(value.heading, 2_000) &&
    validText(value.body, MAX_SCRIPT_TEXT) &&
    validText(value.title, 240) &&
    isBeatList(value.beats);
}

function isCanvasSnapshot(value: unknown): value is PlayableStoryTreeCanvasSnapshot {
  return isRecord(value) &&
    validText(value.title, 240) &&
    Array.isArray(value.exits) &&
    value.exits.length <= MAX_LINKS &&
    value.exits.every((exit) => isRecord(exit) &&
      validText(exit.id, 120) &&
      validText(exit.label, 240) &&
      validText(exit.targetSectionId, 120)) &&
    (value.beats === undefined ||
      (Array.isArray(value.beats) &&
        value.beats.length <= 10_000 &&
        value.beats.every((beat) => isRecord(beat) &&
          validText(beat.id, 160) &&
          validText(beat.signature, 128)))) &&
    (value.storyButtons === undefined ||
      (Array.isArray(value.storyButtons) &&
        value.storyButtons.length <= 100 &&
        value.storyButtons.every((button) => isRecord(button) &&
          validText(button.signal, 120) &&
          (button.beatId === undefined || validText(button.beatId, 160)) &&
          validText(button.signature, 128))));
}

function isBeatList(value: unknown): value is PlayableStoryTreeBeat[] {
  return Array.isArray(value) &&
    value.length <= 10_000 &&
    value.every((beat) => isRecord(beat) &&
      validText(beat.id, 160) &&
      ["plot", "operation", "state", "choice"].includes(String(beat.kind)) &&
      validText(beat.text, 20_000));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function diffPlayableStoryTrees(
  previous: PlayableStoryTree,
  next: PlayableStoryTree,
): PlayableStoryTreeDiff {
  const before = new Map(playableStoryTreeSections(previous).map((section) => [section.id, section]));
  const after = new Map(playableStoryTreeSections(next).map((section) => [section.id, section]));
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const removed: string[] = [];
  for (const [id, section] of after) {
    const old = before.get(id);
    if (section.sourceRemoved) {
      removed.push(id);
      continue;
    }
    if (!old) {
      added.push(id);
      continue;
    }
    if (section.sourcePending || !sameSectionContent(old, section)) changed.push(id);
    else unchanged.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  const previousLinks = new Map(previous.links.map((link) => [link.id, link]));
  const nextLinks = new Map(next.links.map((link) => [link.id, link]));
  const changedLinkIds = new Set(
    next.links
      .filter((link) => !sameLink(previousLinks.get(link.id), link))
      .map((link) => link.id),
  );
  for (const id of previousLinks.keys()) {
    if (!nextLinks.has(id)) changedLinkIds.add(id);
  }
  const changedLinks = [...changedLinkIds];
  return { added, changed, unchanged, removed, changedLinks };
}

function sameSectionContent(
  left: PlayableStoryTreeSection,
  right: PlayableStoryTreeSection,
): boolean {
  return left.title === right.title &&
    left.kind === right.kind &&
    left.objective === right.objective &&
    left.prerequisite === right.prerequisite &&
    left.scriptText === right.scriptText &&
    JSON.stringify(left.beats) === JSON.stringify(right.beats);
}

function sameLink(
  left: PlayableStoryTreeLink | undefined,
  right: PlayableStoryTreeLink,
): boolean {
  return Boolean(left) &&
    left!.fromSectionId === right.fromSectionId &&
    left!.toSectionId === right.toSectionId &&
    left!.label === right.label &&
    left!.status === right.status;
}

export function reconcilePlayableStoryTree(
  previous: PlayableStoryTree,
  incoming: PlayableStoryTree,
): { tree: PlayableStoryTree; diff: PlayableStoryTreeDiff } {
  const previousSections = new Map(playableStoryTreeSections(previous).map((section) => [section.id, section]));
  const incomingSections = playableStoryTreeSections(incoming);
  const incomingIds = new Set(incomingSections.map((section) => section.id));
  const mergedById = new Map<string, PlayableStoryTreeSection>();
  for (const section of incomingSections) {
    const old = previousSections.get(section.id);
    if (!old) {
      mergedById.set(section.id, section);
      continue;
    }
    const sourceUnchanged =
      old.sourceSnapshot.heading === section.sourceSnapshot.heading &&
      old.sourceSnapshot.body === section.sourceSnapshot.body;
    if (sourceUnchanged) {
      mergedById.set(section.id, old);
      continue;
    }
    const hasManualSourceEdits =
      old.title !== old.sourceSnapshot.title ||
      old.scriptText !== old.sourceSnapshot.body ||
      JSON.stringify(old.beats) !== JSON.stringify(old.sourceSnapshot.beats);
    if (hasManualSourceEdits) {
      mergedById.set(section.id, {
        ...old,
        sourcePending: {
          heading: section.sourceSnapshot.heading,
          body: section.sourceSnapshot.body,
          title: section.sourceSnapshot.title,
          beats: section.sourceSnapshot.beats,
        },
      });
      continue;
    }
    mergedById.set(section.id, {
      ...section,
      objective: old.objective,
      prerequisite: old.prerequisite,
      ...(old.canvasNodeId ? { canvasNodeId: old.canvasNodeId } : {}),
      ...(old.canvasSnapshot ? { canvasSnapshot: old.canvasSnapshot } : {}),
    });
  }

  for (const [id, section] of previousSections) {
    if (!incomingIds.has(id)) {
      mergedById.set(
        id,
        section.sourceManaged === false
          ? section
          : { ...section, sourceRemoved: true },
      );
    }
  }

  const previousChapters = new Map(previous.chapters.map((chapter) => [chapter.id, chapter]));
  const previousEpisodes = new Map(
    previous.chapters.flatMap((chapter) =>
      chapter.episodes.map((episode) => [episode.id, { chapter, episode }] as const),
    ),
  );
  const incomingEpisodes = new Map(
    incoming.chapters.flatMap((chapter) =>
      chapter.episodes.map((episode) => [episode.id, { chapter, episode }] as const),
    ),
  );
  const episodeIds = new Set(incomingEpisodes.keys());
  const chapters: PlayableStoryTreeChapter[] = incoming.chapters.map((chapter) => {
    const old = previousChapters.get(chapter.id);
    const titleWasEdited = old && (
      old.sourceTitle === undefined || old.title !== old.sourceTitle
    );
    return {
      ...chapter,
      title: titleWasEdited ? old.title : chapter.title,
      sourceTitle: chapter.sourceTitle ?? chapter.title,
      episodes: [],
    };
  });

  for (const { chapter, episode } of incomingEpisodes.values()) {
    const oldRecord = previousEpisodes.get(episode.id);
    const old = oldRecord?.episode;
    const titleWasEdited = old && (
      old.sourceTitle === undefined || old.title !== old.sourceTitle
    );
    const targetChapter = chapters.find((item) => item.id === chapter.id);
    if (!targetChapter) continue;
    targetChapter.episodes.push({
      ...episode,
      title: titleWasEdited ? old.title : episode.title,
      sourceTitle: episode.sourceTitle ?? episode.title,
      sections: [
        ...episode.sections.map((section) => mergedById.get(section.id)!),
        ...[...(old?.sections ?? [])]
          .filter((section) => {
            const merged = mergedById.get(section.id);
            return (merged?.sourceRemoved || merged?.sourceManaged === false) &&
              !episode.sections.some((current) => current.id === section.id);
          })
          .map((section) => mergedById.get(section.id)!),
      ],
    });
  }

  for (const { chapter: oldChapter, episode } of previousEpisodes.values()) {
    if (episodeIds.has(episode.id)) continue;
    const retainedSections = episode.sections
      .map((section) => mergedById.get(section.id))
      .filter((section): section is PlayableStoryTreeSection => Boolean(section));
    if (!retainedSections.length) continue;
    let targetChapter = chapters.find((chapter) => chapter.id === oldChapter.id);
    if (!targetChapter) {
      targetChapter = { ...oldChapter, episodes: [] };
      chapters.push(targetChapter);
    }
    targetChapter.episodes.push({ ...episode, sections: retainedSections });
  }

  const incomingLinks = new Map(incoming.links.map((link) => [link.id, link]));
  const previousLinks = new Map(previous.links.map((link) => [link.id, link]));
  const links = incoming.links.map((link) => {
    const old = previousLinks.get(link.id);
    if (!old) return link;
    const untouched =
      old.sourceSnapshot?.status !== undefined &&
      old.fromSectionId === old.sourceSnapshot?.fromSectionId &&
      old.toSectionId === old.sourceSnapshot?.toSectionId &&
      old.label === old.sourceSnapshot?.label &&
      old.status === old.sourceSnapshot?.status;
    return untouched ? link : old;
  });
  for (const old of previous.links) {
    if (incomingLinks.has(old.id) || !mergedById.has(old.fromSectionId) || !mergedById.has(old.toSectionId)) continue;
    if (old.sourceSnapshot && !incomingIds.has(old.fromSectionId)) continue;
    links.push(old);
  }

  const tree: PlayableStoryTree = {
    version: 1,
    ...(incoming.source ? { source: incoming.source } : {}),
    chapters: chapters.filter((item) => item.episodes.length > 0),
    links,
  };
  return { tree, diff: diffPlayableStoryTrees(previous, tree) };
}

export function acceptPlayableStoryTreeSource(
  section: PlayableStoryTreeSection,
): PlayableStoryTreeSection {
  if (!section.sourcePending) return section;
  const pending = section.sourcePending;
  return {
    ...section,
    title: pending.title,
    scriptText: pending.body,
    beats: pending.beats,
    sourceSnapshot: {
      heading: pending.heading,
      body: pending.body,
      title: pending.title,
      beats: pending.beats,
    },
    sourceManaged: true,
    sourcePending: undefined,
  };
}

export function formatPlayableStoryTreeText(tree: PlayableStoryTree): string {
  const sections = playableStoryTreeSections(tree);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const chapters: PlayableStoryTreeTextNode[] = tree.chapters.map((chapter) => ({
    label: chapter.title || "未命名篇章",
    children: chapter.episodes.map((episode) => ({
      label: `【${String(episode.number).padStart(2, "0")}｜${episode.title}｜第${episode.number}集】`,
      children: episode.sections.map((section) => {
        const children = [
          `目标：${section.objective || "【待校对】"}`,
          `前置：${section.prerequisite || "【待校对】"}`,
          ...groupPlayableStoryTreeBeats(section.beats).flatMap<
            PlayableStoryTreeTextNode | string
          >((group): (PlayableStoryTreeTextNode | string)[] => {
            const label = `【${storyTreeBeatLabel(group.kind)}】`;
            return group.kind === "plot" && group.beats.length > 1
              ? [{ label, children: group.beats.map((beat) => beat.text) }]
              : group.beats.map((beat) => `${label}${beat.text}`);
          }),
          ...tree.links
            .filter((link) => link.fromSectionId === section.id)
            .map((link) => {
              const target = sectionById.get(link.toSectionId);
              return `${link.label || "继续"} →【${target?.title ?? "目标待校对"}】${link.status === "suggested" ? "【待确认】" : ""}`;
            }),
        ];
        if (section.sourcePending) children.push("【剧本有更新待确认】");
        if (section.sourceRemoved) children.push("【剧本中已移除，待确认是否删除】");
        return {
          label: section.title || "未命名场景",
          children,
        };
      }),
    })),
  }));
  return renderPlayableStoryTreeLines(chapters).join("\n");
}

export function formatPlayableStoryTreeMarkdown(tree: PlayableStoryTree): string {
  const content = formatPlayableStoryTreeText(tree);
  let longestBacktickRun = 0;
  for (const [run] of content.matchAll(/`+/gu)) {
    longestBacktickRun = Math.max(longestBacktickRun, run.length);
  }
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `# ${tree.source?.fileName ?? "剧情树"}\n\n${fence}text\n${content}\n${fence}\n`;
}

export function groupPlayableStoryTreeBeats(
  beats: readonly PlayableStoryTreeBeat[],
): PlayableStoryTreeBeatGroup[] {
  const groups: PlayableStoryTreeBeatGroup[] = [];
  for (const beat of beats) {
    const current = groups.at(-1);
    if (current?.kind === beat.kind) current.beats.push(beat);
    else groups.push({ kind: beat.kind, beats: [beat] });
  }
  return groups;
}

interface PlayableStoryTreeTextNode {
  label: string;
  children?: readonly (PlayableStoryTreeTextNode | string)[];
}

function renderPlayableStoryTreeLines(
  nodes: readonly (PlayableStoryTreeTextNode | string)[],
  prefix = "",
  maxWidth = 82,
): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const marker = isLast ? "└── " : "├── ";
    const label = typeof node === "string" ? node : node.label;
    const continuationPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    const wrapped = wrapStoryTreeLabel(
      label,
      Math.max(16, maxWidth - treeDisplayWidth(`${prefix}${marker}`)),
    );
    const lines = [
      `${prefix}${marker}${wrapped[0] ?? ""}`,
      ...wrapped.slice(1).map((line) => `${continuationPrefix}    ${line}`),
    ];
    if (typeof node !== "string" && node.children?.length) {
      lines.push(
        ...renderPlayableStoryTreeLines(
          node.children,
          continuationPrefix,
          maxWidth,
        ),
      );
    }
    return lines;
  });
}

function wrapStoryTreeLabel(value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const character of value) {
    const characterWidth = treeDisplayWidth(character);
    if (line && width + characterWidth > maxWidth) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += character;
    width += characterWidth;
  }
  lines.push(line);
  return lines;
}

function treeDisplayWidth(value: string): number {
  return Array.from(value).reduce(
    (width, character) =>
      width + (/[\u0000-\u00ff]/u.test(character) ? 1 : 2),
    0,
  );
}

function storyTreeBeatLabel(
  kind: PlayableStoryTreeBeatKind,
): string {
  return kind === "operation"
    ? "操作"
    : kind === "state"
      ? "状态变化"
      : kind === "choice"
        ? "选择"
        : "固定剧情";
}

export function parseScreenplayText(
  paragraphs: readonly string[],
  fileName: string,
): ParsedPlayableStoryTree {
  const warnings: PlayableStoryTreeWarning[] = [];
  const chapters: PlayableStoryTreeChapter[] = [];
  let chapterNumber = 1;
  let currentChapter: PlayableStoryTreeChapter = {
    id: `chapter-${chapterNumber}`,
    title: "未分章",
    sourceTitle: "未分章",
    episodes: [],
  };
  let currentEpisode: PlayableStoryTreeEpisode | undefined;
  let currentSection: {
    heading: string;
    episodeNumber: number;
    sceneNumber: number;
    sceneSuffix?: string;
    sceneRef: string;
    title: string;
    kind: PlayableStoryTreeSection["kind"];
    branchLabel: string;
    lines: string[];
  } | undefined;
  const occurrences = new Map<string, number>();
  const episodeOccurrences = new Map<string, number>();
  let chapterEndPending = false;

  const flushSection = () => {
    if (!currentSection || !currentEpisode) return;
    const id = uniqueSectionId(
      currentSection.episodeNumber,
      currentSection.sceneNumber,
      currentSection.sceneSuffix,
      occurrences,
    );
    const scriptText = currentSection.lines.join("\n");
    const beats = classifyStoryTreeBeats(id, currentSection.lines);
    const section: PlayableStoryTreeSection = {
      id,
      episodeNumber: currentSection.episodeNumber,
      sceneNumber: currentSection.sceneNumber,
      ...(currentSection.sceneSuffix ? { sceneSuffix: currentSection.sceneSuffix } : {}),
      title: currentSection.title || `场次 ${currentSection.sceneRef}`,
      kind: currentSection.kind,
      objective: "",
      prerequisite: "",
      beats,
      scriptText,
      sourceManaged: true,
      sourceSnapshot: {
        heading: currentSection.heading,
        body: scriptText,
        title: currentSection.title || `场次 ${currentSection.sceneRef}`,
        beats: structuredClone(beats),
      },
    };
    if (currentSection.branchLabel) {
      section.title = currentSection.branchLabel;
      section.sourceSnapshot.title = currentSection.branchLabel;
    }
    currentEpisode.sections.push(section);
    currentSection = undefined;
  };

  const pushEpisode = () => {
    if (currentEpisode?.sections.length) currentChapter.episodes.push(currentEpisode);
    currentEpisode = undefined;
  };

  const pushChapter = () => {
    pushEpisode();
    if (currentChapter.episodes.length) chapters.push(currentChapter);
  };

  const openFollowingChapter = (
    title = "待命名篇章",
    sourceHeading?: string,
  ) => {
    pushChapter();
    chapterNumber += 1;
    currentChapter = {
      id: `chapter-${chapterNumber}`,
      title,
      sourceTitle: title,
      ...(sourceHeading ? { sourceHeading } : {}),
      episodes: [],
    };
    chapterEndPending = false;
  };

  const startChapter = (title: string, sourceHeading: string) => {
    if (currentChapter.episodes.length) {
      pushChapter();
      chapterNumber += 1;
      currentChapter = {
        id: `chapter-${chapterNumber}`,
        title: title || "待命名篇章",
        sourceTitle: title || "待命名篇章",
        sourceHeading,
        episodes: [],
      };
      return;
    }
    currentChapter.title = title || currentChapter.title;
    currentChapter.sourceTitle = currentChapter.title;
    currentChapter.sourceHeading ??= sourceHeading;
  };

  const startEpisode = (
    number: number,
    title: string,
    sourceHeading?: string,
  ) => {
    const baseId = `${currentChapter.id}-episode-${number}`;
    const occurrence = episodeOccurrences.get(baseId) ?? 0;
    episodeOccurrences.set(baseId, occurrence + 1);
    currentEpisode = {
      id: occurrence ? `${baseId}-${occurrence + 1}` : baseId,
      number,
      title,
      sourceTitle: title,
      ...(sourceHeading ? { sourceHeading } : {}),
      sections: [],
    };
  };

  for (const paragraph of paragraphs) {
    for (const line of paragraph.split(/\r?\n/u)) {
      const text = line.trim();
      if (!text) {
        if (currentSection) currentSection.lines.push(line);
        continue;
      }
      const chapterMatch = text.match(
        /^第([一二三四五六七八九十百\d]+)篇章(?:[，,、：:\s]+)?(.*)$/u,
      );
      if (chapterMatch) {
        flushSection();
        const title = chapterMatch[2]!
          .replace(/[，,。；;]?\s*结束[。！!]?$/u, "")
          .replace(/^[，,、：:\s]+|[，,、：:\s]+$/gu, "")
          .trim();
        if (/结束/u.test(text)) {
          currentChapter.title = title || `第${chapterMatch[1]}篇章`;
          currentChapter.sourceTitle = currentChapter.title;
          currentChapter.sourceHeading ??= line;
          chapterEndPending = true;
        } else if (chapterEndPending) {
          pushEpisode();
          openFollowingChapter(title, line);
        } else if (currentChapter.episodes.length) {
          startChapter(title, line);
        } else if (title) {
          currentChapter.title = title;
          currentChapter.sourceTitle = title;
          currentChapter.sourceHeading ??= line;
        }
        continue;
      }
      const episodeMatch = text.match(/^第\s*(\d+)\s*集(?:\s*[:：|｜]\s*(.+))?/u);
      if (episodeMatch) {
        flushSection();
        pushEpisode();
        if (chapterEndPending) openFollowingChapter();
        const number = Number(episodeMatch[1]);
        startEpisode(number, episodeMatch[2]?.trim() || `第${number}集`, line);
        continue;
      }
      const sceneMatch = text.match(/^(\d+)[-－](\d+)([A-Z])?\s*(.*)$/u);
      if (sceneMatch) {
        flushSection();
        const episodeNumber = Number(sceneMatch[1]);
        const sceneNumber = Number(sceneMatch[2]);
        const suffix = sceneMatch[3]?.toUpperCase();
        const headingTitle = sceneMatch[4]?.trim() ?? "";
        if (!currentEpisode || currentEpisode.number !== episodeNumber) {
          pushEpisode();
          if (chapterEndPending) openFollowingChapter();
          startEpisode(episodeNumber, `第${episodeNumber}集`);
        }
        const branchLabel = extractBranchLabel(headingTitle, suffix);
        currentSection = {
          heading: line,
          episodeNumber,
          sceneNumber,
          ...(suffix ? { sceneSuffix: suffix } : {}),
          sceneRef: `${episodeNumber}-${sceneNumber}${suffix ?? ""}`,
          title: cleanSceneTitle(headingTitle),
          kind: /结局|失败展示/u.test(headingTitle)
            ? "ending"
            : suffix || /选项|分支|剧情分支/u.test(headingTitle)
              ? "branch"
              : "scene",
          branchLabel,
          lines: [],
        };
        continue;
      }
      if (currentSection) currentSection.lines.push(line);
    }
  }
  flushSection();
  pushEpisode();
  if (currentChapter.episodes.length) chapters.push(currentChapter);
  if (!chapters.length) {
    return {
      tree: { version: 1, source: { fileName, fingerprint: fingerprint(paragraphs.join("\n")) }, chapters: [], links: [] },
      warnings: ["no-scenes"],
    };
  }
  if (chapters.some((chapter) => chapter.title === "待命名篇章")) {
    warnings.push("unnamed-chapter");
  }
  const links = suggestStoryTreeLinks(chapters);
  const tree: PlayableStoryTree = {
    version: 1,
    source: { fileName, fingerprint: fingerprint(paragraphs.join("\n")) },
    chapters,
    links,
  };
  if (playableStoryTreeNeedsRouteReview(tree)) {
    warnings.push("routes-need-review");
  }
  return { tree, warnings };
}

function classifyStoryTreeBeats(
  sectionId: string,
  lines: readonly string[],
): PlayableStoryTreeBeat[] {
  return lines.filter((line) => line.trim().length > 0).map((text, index) => ({
    id: `${sectionId}-beat-${index + 1}`,
    kind: /选项\s*[一二三四五六七八九十\d]|选择\s*[A-Z]?\d+/u.test(text)
      ? "choice"
      : /按钮\s*[:：]|【操作|操作\s*[A-Z]?\d+\s*[:：]|点击|点按|长按|按住|按下|滑动|拖动|触摸|输入|敲击|完成(?:限时)?(?:操作|挑战|QTE)|进行(?:操作|互动)/u.test(text)
        ? "operation"
        : /好感度|好感\s*[+\-＋－]\s*\d/u.test(text)
          ? "state"
          : "plot",
    text,
  }));
}

function cleanSceneTitle(value: string): string {
  return value
    .replace(/\s*人物\s*[:：].*$/u, "")
    .replace(/(?:—|－|-|·)?\s*(?:延展剧情|剧情分支).*/u, "")
    .replace(/\s*选项[一二三四五六七八九十\d]+[:：]?.*$/u, "")
    .replace(/\s*【分支[:：].*$/u, "")
    .replace(/\s*(?:日|夜|晨|早|晚|午|黄昏|清晨)\s*(?:内|外)?$/u, "")
    .trim();
}

function extractBranchLabel(title: string, suffix: string | undefined): string {
  const explicit = title.match(/(?:选项[一二三四五六七八九十\d]+[:：]?\s*|【分支[:：])【?([^】\]]+)[】\]]?/u)?.[1]?.trim();
  if (explicit) return explicit;
  const numberedBranch = title.match(/剧情分支\s*([\d.]+)/u)?.[1];
  if (numberedBranch) return `剧情分支${numberedBranch}`;
  return suffix ? `${suffix}分支` : "";
}

function uniqueSectionId(
  episode: number,
  scene: number,
  suffix: string | undefined,
  occurrences: Map<string, number>,
): string {
  const base = `ep-${String(episode).padStart(2, "0")}-scene-${String(scene).padStart(2, "0")}${suffix ? `-${suffix.toLowerCase()}` : ""}`;
  const count = occurrences.get(base) ?? 0;
  occurrences.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

function suggestStoryTreeLinks(
  chapters: readonly PlayableStoryTreeChapter[],
): PlayableStoryTreeLink[] {
  const links: PlayableStoryTreeLink[] = [];
  const add = (
    from: PlayableStoryTreeSection,
    to: PlayableStoryTreeSection,
    label: string,
    status: PlayableStoryTreeLink["status"],
  ) => {
    const id = `link-${from.id}-to-${to.id}`;
    if (links.some((link) => link.id === id)) return;
    links.push({
      id,
      fromSectionId: from.id,
      toSectionId: to.id,
      label,
      status,
      sourceSnapshot: {
        fromSectionId: from.id,
        toSectionId: to.id,
        label,
        status,
      },
    });
  };

  const episodes = chapters.flatMap((chapter, chapterIndex) =>
    chapter.episodes.map((episode) => ({ chapterIndex, episode })),
  );
  for (const [episodeIndex, entry] of episodes.entries()) {
    const episode = entry.episode;
    const sections = episode.sections;
    let index = 0;
    while (index < sections.length) {
      const section = sections[index]!;
      if (section.kind === "branch") {
        let branchEnd = index + 1;
        while (branchEnd < sections.length && sections[branchEnd]!.kind === "branch") branchEnd += 1;
        let source = sections.slice(0, index).findLast((item) => item.kind !== "branch");
        const previousEpisode = episodes[episodeIndex - 1]?.episode;
        if (
          !source &&
          previousEpisode?.sections.length &&
          previousEpisode.sections.every((item) => item.kind !== "branch")
        ) {
          source = previousEpisode.sections.at(-1);
        }
        if (source) {
          for (const branch of sections.slice(index, branchEnd)) {
            add(source, branch, branch.title || branch.sceneSuffix || "分支", "suggested");
          }
        }
        const merge = sections[branchEnd];
        if (merge) {
          for (const branch of sections.slice(index, branchEnd)) {
            add(branch, merge, "主线汇合", "suggested");
          }
        }
        index = branchEnd;
        continue;
      }
      const next = sections[index + 1];
      if (next && next.kind !== "branch") add(section, next, "继续", "confirmed");
      index += 1;
    }
    if (episodeIndex < episodes.length - 1) {
      const nextEntry = episodes[episodeIndex + 1]!;
      const nextEpisode = nextEntry.episode;
      const target = nextEpisode.sections[0];
      if (!target) continue;
      const terminal = sections.at(-1);
      if (terminal && terminal.kind !== "branch") {
        const uncertain =
          sections.some((section) => section.kind === "branch") ||
          nextEpisode.sections.some((section) => section.kind === "branch") ||
          entry.chapterIndex !== nextEntry.chapterIndex;
        add(terminal, target, "下一集", uncertain ? "suggested" : "confirmed");
      } else if (terminal) {
        let branchStart = sections.length - 1;
        while (
          branchStart > 0 &&
          sections[branchStart - 1]!.kind === "branch"
        ) {
          branchStart -= 1;
        }
        for (const branch of sections.slice(branchStart)) {
          add(branch, target, "下一集", "suggested");
        }
      }
    }
  }
  return links;
}

export function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}-${value.length}`;
}
