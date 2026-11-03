import {
  type PlayableStoryTree,
  type PlayableStoryTreeBeat,
  type PlayableStoryTreeSection,
} from "./playable-story-tree.js";

export function normalizePlayableStoryTreeActionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(
      /^(?:选项|选择|操作)\s*(?:[a-z]\s*\d*|[一二三四五六七八九十\d]+)?\s*[:：、.．-]?\s*/iu,
      "",
    )
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function uniquePlayableStoryTreeActions(
  beats: readonly PlayableStoryTreeBeat[],
): PlayableStoryTreeBeat[] {
  const seen = new Set<string>();
  return beats.filter((beat) => {
    if (beat.kind !== "choice" && beat.kind !== "operation") return false;
    const text = normalizePlayableStoryTreeActionText(beat.text);
    const key = `${beat.kind}\0${text || beat.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function playableStoryTreeChoiceLabel(text: string): string {
  const bracketed = text.match(/[【\[]([^】\]]+)[】\]]/u)?.[1];
  if (bracketed?.trim()) return bracketed.trim().slice(0, 240);
  return text
    .replace(
      /^(?:选项|选择|操作)\s*(?:[a-z]\s*\d*|[一二三四五六七八九十\d]+)?\s*[:：、.．-]?\s*/iu,
      "",
    )
    .trim()
    .slice(0, 240);
}

/** Fill structural gaps without replacing authored routes or chaining alternatives. */
export function completePlayableStoryTreeRoutes(
  tree: PlayableStoryTree,
): PlayableStoryTree {
  const episodes = tree.chapters.flatMap((chapter) => chapter.episodes);
  const sections = episodes.flatMap((episode) => episode.sections);
  const active = sections.filter((section) => !section.sourceRemoved);
  const links = deduplicateStoryTreeLinks(tree.links);
  const alternativeIds = new Set<string>();
  for (const section of active) {
    const targets = new Set(
      tree.links
        .filter((link) => link.fromSectionId === section.id)
        .map((link) => link.toSectionId),
    );
    if (targets.size > 1) targets.forEach((id) => alternativeIds.add(id));
  }
  const isBranch = (section: PlayableStoryTreeSection) =>
    section.kind === "branch" || alternativeIds.has(section.id);
  const outgoing = (section: PlayableStoryTreeSection) =>
    links.filter((link) => link.fromSectionId === section.id);
  const add = (
    from: PlayableStoryTreeSection,
    to: PlayableStoryTreeSection,
    label: string,
  ) => {
    if (
      from.id === to.id ||
      links.some(
        (link) => link.fromSectionId === from.id && link.toSectionId === to.id,
      )
    )
      return;
    const base = `inferred-${from.id}-to-${to.id}`;
    let id = base;
    for (let suffix = 2; links.some((link) => link.id === id); suffix += 1) {
      id = `${base}-${suffix}`;
    }
    links.push({
      id,
      fromSectionId: from.id,
      toSectionId: to.id,
      label,
      status: "suggested",
    });
  };
  const terminal = (section: PlayableStoryTreeSection) =>
    section.kind === "ending" ||
    section.beats.some((beat) =>
      /返回故事线|返回上一级|重新选择|【(?:游戏结束|结局|失败结局)|达成.{0,12}结局/u.test(
        beat.text,
      ),
    );

  for (const [episodeIndex, episode] of episodes.entries()) {
    for (const [index, section] of episode.sections.entries()) {
      if (section.sourceRemoved || terminal(section)) continue;
      const choices = uniquePlayableStoryTreeActions(section.beats)
        .filter((beat) => beat.kind === "choice");
      const following = episode.sections[index + 1];
      const nextEpisode = episodes[episodeIndex + 1];
      const next = following ?? nextEpisode?.sections[0];
      if (choices.length) {
        // Only inspect the immediately following branch group, even if its scene
        // numbers differ (e.g. 4-1A, 4-2B, 4-2C). Existing destinations win.
        const candidates = following
          ? episode.sections.slice(index + 1)
          : (nextEpisode?.sections ?? []);
        const branchEnd = candidates.findIndex(
          (item) => item.sourceRemoved || item.kind !== "branch",
        );
        const branches = candidates.slice(
          0,
          branchEnd < 0 ? candidates.length : branchEnd,
        );
        const existing = outgoing(section);
        relabelGenericChoiceRoutes(choices, existing, active);
        const remaining = Math.max(0, choices.length - existing.length);
        if (!remaining) continue;
        const unlinked = branches.filter(
          (branch) => !existing.some((link) => link.toSectionId === branch.id),
        );
        const usedChoices = new Set(
          existing.flatMap((link) => {
            const target = active.find((item) => item.id === link.toSectionId);
            return choices
              .filter((choice) =>
                matchesChoice(choice.text, target?.title ?? link.label),
              )
              .map((choice) => choice.id);
          }),
        );
        let added = 0;
        for (const branch of unlinked) {
          const matching = choices.filter(
            (choice) =>
              !usedChoices.has(choice.id) &&
              matchesChoice(choice.text, branch.title),
          );
          if (matching.length !== 1 || added >= remaining) continue;
          add(section, branch, matching[0]!.text.slice(0, 240));
          usedChoices.add(matching[0]!.id);
          added += 1;
        }
        // Positional mapping is only safe within one complete candidate group.
        if (
          branches.length === choices.length &&
          existing.every((link) =>
            branches.some((branch) => branch.id === link.toSectionId),
          )
        ) {
          for (const branch of branches) {
            if (outgoing(section).length >= choices.length) break;
            add(section, branch, branch.title.slice(0, 240));
          }
        }
        continue;
      }
      if (outgoing(section).length) continue;
      // A previously generated exit removed by the author is not a missing route.
      if (section.canvasSnapshot?.exits.length) continue;
      const text = section.beats.map((beat) => beat.text).join("\n");
      const references = [
        ...text.matchAll(
          /(?:后续接|接续|接入|跳转到|转至)\s*(\d+)\s*[-－—]\s*(\d+)\s*([A-Za-z])?/gu,
        ),
      ];
      if (references.length) {
        const targets = references.flatMap((match) =>
          active.filter(
            (item) =>
              item.episodeNumber === Number(match[1]) &&
              item.sceneNumber === Number(match[2]) &&
              (item.sceneSuffix ?? "").toUpperCase() ===
                (match[3] ?? "").toUpperCase(),
          ),
        );
        if (targets.length === 1) add(section, targets[0]!, "后续接");
        continue;
      }
      if (isBranch(section)) {
        const rest = episode.sections.slice(index + 1);
        const merge =
          rest.find((item) => !isBranch(item) || item.sourceRemoved) ??
          nextEpisode?.sections[0];
        if (merge && !merge.sourceRemoved && !isBranch(merge)) {
          add(section, merge, "主线汇合");
        }
      } else if (next && !next.sourceRemoved && !isBranch(next)) {
        add(section, next, following ? "继续" : "下一集");
      }
    }
  }
  const expanded = expandSingleGenericChoiceRoutes(active, links);
  return sameStoryTreeLinks(tree.links, expanded)
    ? tree
    : { ...tree, links: expanded };
}

function relabelGenericChoiceRoutes(
  choices: readonly PlayableStoryTreeBeat[],
  outgoing: readonly PlayableStoryTree["links"][number][],
  active: readonly PlayableStoryTreeSection[],
): void {
  if (choices.length < 2 || outgoing.length !== choices.length) return;

  const assigned = new Set<string>();
  const generic = outgoing.filter((link) => isGenericStoryRoute(link.label));
  for (const link of generic) {
    const targetTitle = active.find((item) => item.id === link.toSectionId)?.title;
    const matches = choices.filter(
      (choice) =>
        !assigned.has(choice.id) &&
        targetTitle &&
        matchesChoice(choice.text, targetTitle),
    );
    if (matches.length === 1) {
      link.label = playableStoryTreeChoiceLabel(matches[0]!.text);
      assigned.add(matches[0]!.id);
    }
  }

  for (const link of generic) {
    if (!isGenericStoryRoute(link.label)) continue;
    const choice = choices.find((item) => !assigned.has(item.id));
    if (!choice) break;
    link.label = playableStoryTreeChoiceLabel(choice.text);
    assigned.add(choice.id);
  }
}

export function playableStoryTreeExitLabel(
  label: string,
  targetTitle?: string,
): string {
  const normalized = label.trim();
  const isGeneric =
    !normalized || ["继续", "下一集", "主线汇合"].includes(normalized);
  return (isGeneric ? targetTitle || normalized || "继续" : normalized).slice(
    0,
    120,
  );
}

function matchesChoice(text: string, title: string): boolean {
  const action = normalizePlayableStoryTreeActionText(text);
  const target = normalizePlayableStoryTreeActionText(title);
  return Boolean(
    action && target && (action === target || action.endsWith(target)),
  );
}

function deduplicateStoryTreeLinks(
  links: readonly PlayableStoryTree["links"][number][],
): PlayableStoryTree["links"] {
  const seen = new Set<string>();
  return links
    .filter((link) => {
      const key = `${link.fromSectionId}\0${link.toSectionId}\0${normalizePlayableStoryTreeActionText(link.label)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((link) => ({ ...link }));
}

function expandSingleGenericChoiceRoutes(
  sections: readonly PlayableStoryTreeSection[],
  links: PlayableStoryTree["links"],
): PlayableStoryTree["links"] {
  const result = [...links];
  for (const section of sections) {
    const choices = uniquePlayableStoryTreeActions(section.beats)
      .filter((beat) => beat.kind === "choice");
    if (choices.length < 2) continue;
    const outgoing = result.filter((link) => link.fromSectionId === section.id);
    if (outgoing.length !== 1 || !isGenericStoryRoute(outgoing[0]!.label)) continue;
    const original = outgoing[0]!;
    const index = result.indexOf(original);
    const ids = new Set(result.map((link) => link.id));
    const expanded = choices.map((choice, choiceIndex) => {
      const label = choice.text.trim().slice(0, 240);
      if (choiceIndex === 0) {
        return { ...original, label, status: "suggested" as const };
      }
      const baseId = `${original.id}-choice-${choiceIndex + 1}`.slice(0, 120);
      let id = baseId;
      for (let suffix = 2; ids.has(id); suffix += 1) {
        id = `${baseId.slice(0, 120 - String(suffix).length - 1)}-${suffix}`;
      }
      ids.add(id);
      const { sourceSnapshot: _sourceSnapshot, ...link } = original;
      return {
        ...link,
        id,
        label,
        status: "suggested" as const,
      };
    });
    result.splice(index, 1, ...expanded);
  }
  return result;
}

function isGenericStoryRoute(label: string): boolean {
  return !label.trim() || ["继续", "下一集", "主线汇合"].includes(label.trim());
}

function sameStoryTreeLinks(
  left: readonly PlayableStoryTree["links"][number][],
  right: readonly PlayableStoryTree["links"][number][],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
