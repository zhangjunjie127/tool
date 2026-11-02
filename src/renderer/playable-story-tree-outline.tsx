import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  DangerTriangle,
  MousePointer2,
} from "./icons.js";
import { t } from "./i18n.js";
import {
  groupPlayableStoryTreeBeats,
  playableStoryTreeEpisodeHasInteraction,
  playableStoryTreeSections,
  type PlayableStoryTree,
  type PlayableStoryTreeBeat,
  type PlayableStoryTreeCanvasEdge,
  type PlayableStoryTreeSection,
} from "../shared/playable-story-tree.js";

export function PlayableStoryTreeOutline({
  tree,
  selectedSectionId,
  canvasNodeIds,
  canvasEdges,
  onSelectSection,
  onConfirmRoute,
  disabled = false,
}: {
  tree: PlayableStoryTree;
  selectedSectionId?: string;
  canvasNodeIds?: readonly string[];
  canvasEdges?: readonly PlayableStoryTreeCanvasEdge[];
  onSelectSection: (sectionId: string) => void;
  onConfirmRoute?: (routeId: string) => void;
  disabled?: boolean;
}) {
  const sections = playableStoryTreeSections(tree).filter(
    (section) => !section.sourceRemoved,
  );
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const activeLinks = tree.links.filter(
    (link) =>
      sectionById.has(link.fromSectionId) &&
      sectionById.has(link.toSectionId),
  );
  const sectionsWithIncomingRoute = new Set(
    activeLinks.map((link) => link.toSectionId),
  );
  const sectionsWithOutgoingRoute = new Set(
    activeLinks.map((link) => link.fromSectionId),
  );
  const firstSectionId = sections[0]?.id;
  const [collapsedEpisodes, setCollapsedEpisodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleEpisode(episodeId: string): void {
    setCollapsedEpisodes((current) => {
      const next = new Set(current);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });
  }

  function toggleBranchGroup(groupId: string): void {
    setCollapsedBranches((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className="story-tree-outline" aria-label={t("storyTree.structure")}>
      {tree.chapters.map((chapter) => {
        const episodes = chapter.episodes.filter((episode) =>
          episode.sections.some((section) => !section.sourceRemoved),
        );
        if (!episodes.length) return null;
        return (
          <div className="story-tree-outline-group" key={chapter.id}>
            <strong className="story-tree-outline-heading">
              {displayChapterTitle(chapter.title)}
            </strong>
            <div className="story-tree-outline-children">
              {episodes.map((episode) => {
                const episodeSections = episode.sections.filter(
                  (section) => !section.sourceRemoved,
                );
                const routeWarning = episodeRouteWarning(
                  episodeSections,
                  firstSectionId,
                  sectionById,
                  activeLinks,
                  sectionsWithIncomingRoute,
                  sectionsWithOutgoingRoute,
                  canvasNodeIds,
                  canvasEdges,
                );
                const outlineGroups = groupEpisodeSections(
                  episode.id,
                  episodeSections,
                );
                return (
                  <div className="story-tree-outline-group" key={episode.id}>
                    <button
                      type="button"
                      className="story-tree-outline-heading is-episode"
                      aria-expanded={!collapsedEpisodes.has(episode.id)}
                      onClick={() => toggleEpisode(episode.id)}
                    >
                      {collapsedEpisodes.has(episode.id) ? (
                        <ChevronRight size={14} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={14} aria-hidden="true" />
                      )}
                      <span className="story-tree-episode-title">
                        {t("storyTree.episodeLabel", { number: episode.number })}
                        {episode.title === `第${episode.number}集`
                          ? ""
                          : ` · ${episode.title}`}
                      </span>
                      {routeWarning ||
                      playableStoryTreeEpisodeHasInteraction(
                        episode,
                        activeLinks,
                      ) ? (
                        <span className="story-tree-episode-markers">
                          {routeWarning ? (
                            <span
                              className="story-tree-episode-warning"
                              role="img"
                              aria-label={`${t("storyTree.episodeRouteWarning")}: ${routeWarning}`}
                              title={routeWarning}
                            >
                              <DangerTriangle
                                size={16}
                                aria-hidden="true"
                              />
                            </span>
                          ) : null}
                          {playableStoryTreeEpisodeHasInteraction(
                            episode,
                            activeLinks,
                          ) ? (
                            <small
                              className="story-tree-interaction-marker"
                              title={t("storyTree.interactiveEpisode")}
                            >
                              <MousePointer2 size={12} aria-hidden="true" />
                              {t("storyTree.interactiveEpisode")}
                            </small>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                    {!collapsedEpisodes.has(episode.id) ? (
                      <div className="story-tree-outline-children">
                        {outlineGroups.map((group) =>
                          group.kind === "branches" ? (
                            <div
                              className="story-tree-outline-group story-tree-outline-branch-group"
                              key={group.id}
                            >
                              <button
                                type="button"
                                className="story-tree-outline-heading is-branch-group"
                                aria-expanded={!collapsedBranches.has(group.id)}
                                onClick={() => toggleBranchGroup(group.id)}
                              >
                                {collapsedBranches.has(group.id) ? (
                                  <ChevronRight size={14} aria-hidden="true" />
                                ) : (
                                  <ChevronDown size={14} aria-hidden="true" />
                                )}
                                <span>
                                  {t("storyTree.branchGroupCount", {
                                    count: group.sections.length,
                                  })}
                                </span>
                              </button>
                              {!collapsedBranches.has(group.id) ? (
                                <div className="story-tree-outline-children">
                                  {group.sections.map((section) => (
                                    <StoryTreeOutlineSection
                                      key={section.id}
                                      section={section}
                                      sectionsById={sectionById}
                                      links={activeLinks.filter(
                                        (link) =>
                                          link.fromSectionId === section.id,
                                      )}
                                      selected={
                                        section.id === selectedSectionId
                                      }
                                      onSelectSection={onSelectSection}
                                      onConfirmRoute={onConfirmRoute}
                                      disabled={disabled}
                                      missingIncoming={
                                        section.id !== sections[0]?.id &&
                                        !sectionsWithIncomingRoute.has(
                                          section.id,
                                        )
                                      }
                                      missingOutgoing={
                                        section.kind !== "ending" &&
                                        !sectionsWithOutgoingRoute.has(
                                          section.id,
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <StoryTreeOutlineSection
                              key={group.section.id}
                              section={group.section}
                              sectionsById={sectionById}
                              links={activeLinks.filter(
                                (link) =>
                                  link.fromSectionId === group.section.id,
                              )}
                              selected={
                                group.section.id === selectedSectionId
                              }
                              onSelectSection={onSelectSection}
                              onConfirmRoute={onConfirmRoute}
                              disabled={disabled}
                              missingIncoming={
                                group.section.id !== sections[0]?.id &&
                                !sectionsWithIncomingRoute.has(
                                  group.section.id,
                                )
                              }
                              missingOutgoing={
                                group.section.kind !== "ending" &&
                                !sectionsWithOutgoingRoute.has(
                                  group.section.id,
                                )
                              }
                            />
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function episodeRouteWarning(
  episodeSections: readonly PlayableStoryTreeSection[],
  firstSectionId: string | undefined,
  sectionById: ReadonlyMap<string, PlayableStoryTreeSection>,
  activeLinks: PlayableStoryTree["links"],
  sectionsWithIncomingRoute: ReadonlySet<string>,
  sectionsWithOutgoingRoute: ReadonlySet<string>,
  canvasNodeIds: readonly string[] | undefined,
  canvasEdges: readonly PlayableStoryTreeCanvasEdge[] | undefined,
): string | undefined {
  const episodeSectionIds = new Set(episodeSections.map((section) => section.id));
  const pendingRouteCount = activeLinks.filter(
    (link) =>
      episodeSectionIds.has(link.fromSectionId) &&
      link.status === "suggested",
  ).length;
  const missingIncomingCount = episodeSections.filter(
    (section) =>
      section.id !== firstSectionId &&
      !sectionsWithIncomingRoute.has(section.id),
  ).length;
  const missingOutgoingCount = episodeSections.filter(
    (section) =>
      section.kind !== "ending" &&
      !sectionsWithOutgoingRoute.has(section.id),
  ).length;
  const reasons: string[] = [];
  if (pendingRouteCount) {
    reasons.push(
      t("storyTree.episodeWarningPendingRoutes", {
        count: pendingRouteCount,
      }),
    );
  }
  if (missingIncomingCount) {
    reasons.push(
      t("storyTree.episodeWarningMissingIncoming", {
        count: missingIncomingCount,
      }),
    );
  }
  if (missingOutgoingCount) {
    reasons.push(
      t("storyTree.episodeWarningMissingOutgoing", {
        count: missingOutgoingCount,
      }),
    );
  }

  if (canvasNodeIds && canvasEdges) {
    const knownNodeIds = new Set(canvasNodeIds);
    const requiredRoutesByCanvasPair = new Map<
      string,
      { sourceNodeId: string; targetNodeId: string; count: number }
    >();
    let missingCanvasEdgeCount = 0;
    for (const link of activeLinks) {
      if (
        !episodeSectionIds.has(link.fromSectionId) ||
        link.status !== "confirmed"
      )
        continue;
      const source = sectionById.get(link.fromSectionId);
      const target = sectionById.get(link.toSectionId);
      const sourceNodeId = source?.canvasNodeId;
      const targetNodeId = target?.canvasNodeId;
      if (
        !sourceNodeId ||
        !targetNodeId ||
        !knownNodeIds.has(sourceNodeId) ||
        !knownNodeIds.has(targetNodeId)
      ) {
        missingCanvasEdgeCount += 1;
        continue;
      }
      const key = `${sourceNodeId}\u0000${targetNodeId}`;
      const route = requiredRoutesByCanvasPair.get(key);
      if (route) route.count += 1;
      else
        requiredRoutesByCanvasPair.set(key, {
          sourceNodeId,
          targetNodeId,
          count: 1,
        });
    }

    for (const route of requiredRoutesByCanvasPair.values()) {
      const canvasEdgeCount = canvasEdges.filter(
        (edge) =>
          edge.sourceNodeId === route.sourceNodeId &&
          edge.targetNodeId === route.targetNodeId &&
          edge.sourceSignalId,
      ).length;
      missingCanvasEdgeCount += Math.max(0, route.count - canvasEdgeCount);
    }
    if (missingCanvasEdgeCount) {
      reasons.push(
        t("storyTree.episodeWarningMissingCanvasEdges", {
          count: missingCanvasEdgeCount,
        }),
      );
    }
  }

  return reasons.length
    ? reasons.join(t("storyTree.episodeWarningSeparator"))
    : undefined;
}

function StoryTreeOutlineSection({
  section,
  sectionsById,
  links,
  selected,
  onSelectSection,
  onConfirmRoute,
  disabled,
  missingIncoming,
  missingOutgoing,
}: {
  section: PlayableStoryTreeSection;
  sectionsById: Map<string, PlayableStoryTreeSection>;
  links: PlayableStoryTree["links"];
  selected: boolean;
  onSelectSection: (sectionId: string) => void;
  onConfirmRoute?: (routeId: string) => void;
  disabled: boolean;
  missingIncoming: boolean;
  missingOutgoing: boolean;
}) {
  const hasDetails =
    links.length > 0 ||
    (selected &&
      Boolean(
        section.objective || section.prerequisite || section.beats.length,
      ));
  const visibleLinks = links.filter((link) =>
    sectionsById.has(link.toSectionId),
  );
  const choiceCount = section.beats.filter(
    (beat) => beat.kind === "choice",
  ).length;
  let nextChoiceIndex = 0;
  return (
    <div className="story-tree-outline-group">
      <div className="story-tree-outline-scene-row">
        <button
          type="button"
          className={`story-tree-outline-scene${selected ? " is-selected" : ""}`}
          aria-pressed={selected}
          onClick={() => onSelectSection(section.id)}
          title={section.title}
        >
          <span>{section.title}</span>
          {!section.canvasNodeId ? (
            <small className="story-tree-item-status is-pending-generation">
              {t("storyTree.pendingGeneration")}
            </small>
          ) : null}
        </button>
        <small className="story-tree-outline-kind">
          {sectionKindLabel(section.kind)}
        </small>
        {section.sourcePending ? (
          <small className="story-tree-outline-review">
            {t("storyTree.needsReview")}
          </small>
        ) : null}
        {missingIncoming ? (
          <small className="story-tree-route-missing">
            {t("storyTree.missingIncomingRoute")}
          </small>
        ) : null}
        {missingOutgoing ? (
          <small className="story-tree-route-missing">
            {t("storyTree.missingOutgoingRoute")}
          </small>
        ) : null}
      </div>
      {hasDetails ? (
        <div className="story-tree-outline-children story-tree-outline-details">
          {visibleLinks.map((link, index) => {
            const target = sectionsById.get(link.toSectionId);
            if (!target) return null;
            return (
              <div
                className="story-tree-outline-leaf story-tree-outline-route"
                key={link.id}
              >
                <span
                  className={
                    visibleLinks.length > 1 ? "story-tree-outline-option" : ""
                  }
                >
                  {visibleLinks.length > 1 ? optionPrefix(index) : ""}
                  {link.label || t("storyTree.unconfirmedRoute")}
                </span>
                <ArrowRight size={13} aria-hidden="true" />
                <button
                  className="story-tree-outline-target"
                  type="button"
                  aria-label={`${link.label || t("storyTree.unconfirmedRoute")} ${target.title} ${t(`storyTree.${link.status}`)}`}
                  onClick={() => onSelectSection(target.id)}
                >
                  {target.title}
                </button>
                <small
                  className={
                    link.status === "suggested" ? "is-pending-route" : undefined
                  }
                >
                  {t(`storyTree.${link.status}`)}
                </small>
                {link.status === "suggested" && onConfirmRoute ? (
                  <button
                    className="story-tree-route-confirm"
                    type="button"
                    disabled={disabled}
                    onClick={() => onConfirmRoute?.(link.id)}
                  >
                    <Check size={12} aria-hidden="true" />
                    {t("storyTree.confirmRoute")}
                  </button>
                ) : null}
              </div>
            );
          })}
          {selected && section.objective ? (
            <div className="story-tree-outline-leaf">
              <span>{t("storyTree.objective")}:</span> {section.objective}
            </div>
          ) : null}
          {selected && section.prerequisite ? (
            <div className="story-tree-outline-leaf">
              <span>{t("storyTree.prerequisite")}:</span> {section.prerequisite}
            </div>
          ) : null}
          {selected
            ? groupPlayableStoryTreeBeats(section.beats).flatMap(
                (group, groupIndex) =>
                  group.kind === "plot" && group.beats.length >= 3
                    ? [
                        <details
                          className="story-tree-outline-beat-group"
                          key={group.beats[0]?.id ?? groupIndex}
                        >
                          <summary className="story-tree-outline-beat-group-summary">
                            <small>{beatKindLabel(group.beats[0]!)}</small>
                            <span className="story-tree-outline-beat-count">
                              {t("storyTree.plotBeatCount", {
                                count: group.beats.length,
                              })}
                            </span>
                            <span className="story-tree-outline-beat-preview">
                              {group.beats[0]?.text}
                            </span>
                          </summary>
                          <div className="story-tree-outline-beat-group-items">
                            {group.beats.map((beat) => (
                              <div
                                className="story-tree-outline-leaf story-tree-outline-beat-detail"
                                key={beat.id}
                              >
                                <span>{beat.text}</span>
                              </div>
                            ))}
                          </div>
                        </details>,
                      ]
                    : group.beats.map((beat) => {
                        const choiceIndex =
                          beat.kind === "choice" && choiceCount > 1
                            ? nextChoiceIndex++
                            : undefined;
                        return (
                          <StoryTreeOutlineBeat
                            beat={beat}
                            choiceIndex={choiceIndex}
                            key={beat.id}
                          />
                        );
                      }),
              )
            : null}
        </div>
      ) : null}
    </div>
  );
}

function StoryTreeOutlineBeat({
  beat,
  choiceIndex,
}: {
  beat: PlayableStoryTreeBeat;
  choiceIndex?: number;
}) {
  const choicePrefix =
    beat.kind === "choice" && choiceIndex !== undefined
      ? optionPrefix(choiceIndex)
      : "";
  return (
    <div
      className={`story-tree-outline-leaf story-tree-outline-beat${beat.kind === "operation" || beat.kind === "choice" ? ` is-${beat.kind}` : ""}`}
    >
      <small>{beatKindLabel(beat)}</small>
      <span>
        {choicePrefix}
        {beat.text}
      </span>
    </div>
  );
}

type EpisodeOutlineGroup =
  | { kind: "section"; section: PlayableStoryTreeSection }
  | {
      kind: "branches";
      id: string;
      sections: PlayableStoryTreeSection[];
    };

function groupEpisodeSections(
  episodeId: string,
  sections: PlayableStoryTreeSection[],
): EpisodeOutlineGroup[] {
  const groups: EpisodeOutlineGroup[] = [];
  for (const section of sections) {
    const previous = groups.at(-1);
    if (section.kind === "branch" && previous?.kind === "branches") {
      previous.sections.push(section);
    } else if (section.kind === "branch") {
      groups.push({
        kind: "branches",
        id: `${episodeId}:${section.id}`,
        sections: [section],
      });
    } else {
      groups.push({ kind: "section", section });
    }
  }
  return groups;
}

function optionPrefix(index: number): string {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `${letters}_`;
}

function displayChapterTitle(title: string): string {
  if (title === "待命名篇章") return t("storyTree.untitledChapter");
  if (title === "未分章") return t("storyTree.unassignedChapter");
  return title;
}

function sectionKindLabel(kind: PlayableStoryTreeSection["kind"]): string {
  return t(
    kind === "branch"
      ? "storyTree.kindBranch"
      : kind === "merge"
        ? "storyTree.kindMerge"
        : kind === "ending"
          ? "storyTree.kindEnding"
          : "storyTree.kindScene",
  );
}

function beatKindLabel(beat: PlayableStoryTreeBeat): string {
  return t(
    beat.kind === "operation"
      ? "storyTree.beatOperation"
      : beat.kind === "choice"
        ? "storyTree.beatChoice"
        : beat.kind === "state"
          ? "storyTree.beatState"
          : "storyTree.beatPlot",
  );
}
