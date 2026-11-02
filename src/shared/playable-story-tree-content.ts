import { fingerprint } from "./playable-story-tree.js";
import type {
  PlayableStoryTreeBeat,
  PlayableStoryTreeCanvasSnapshot,
  PlayableStoryTreeSection,
} from "./playable-story-tree.js";

export interface PlayableStoryTreeContentSync {
  html: string;
  beats: NonNullable<PlayableStoryTreeCanvasSnapshot["beats"]>;
  changed: boolean;
  editedBeatIds: string[];
}

const PANEL_STYLE = [
  "position:absolute",
  "left:5cqw",
  "top:7cqh",
  "width:90cqw",
  "max-height:42cqh",
  "overflow:auto",
  "display:grid",
  "align-content:start",
  "gap:0.8cqh",
  "box-sizing:border-box",
  "padding:1.2cqh 1.5cqw",
  "border:1px solid rgba(226,242,255,.36)",
  "border-radius:8px",
  "background:rgba(8,16,24,.72)",
  "color:#fff",
  "font:inherit",
  "z-index:3",
].join(";");

export function syncPlayableStoryTreeContent(
  html: string,
  sectionId: string,
  previousSection: PlayableStoryTreeSection | undefined,
  nextSection: PlayableStoryTreeSection,
  previousSnapshots: NonNullable<PlayableStoryTreeCanvasSnapshot["beats"]> = [],
  confirmEditedBeats = false,
): PlayableStoryTreeContentSync {
  let nextHtml = html;
  let changed = false;
  const editedBeatIds: string[] = [];
  const snapshots = new Map(previousSnapshots.map((item) => [item.id, item]));
  const oldBeats = new Map((previousSection?.beats ?? []).map((beat) => [beat.id, beat]));
  const nextBeats = new Map(nextSection.beats.map((beat) => [beat.id, beat]));
  const retainedSnapshots = new Map<string, string>();

  for (const beat of previousSection?.beats ?? []) {
    if (nextBeats.has(beat.id)) continue;
    const live = findBeat(nextHtml, beat.id);
    const baseline = snapshots.get(beat.id);
    if (!live) continue;
    if (baseline && fingerprint(live.markup) !== baseline.signature) {
      editedBeatIds.push(beat.id);
      if (!confirmEditedBeats) {
        retainedSnapshots.set(beat.id, baseline.signature);
        continue;
      }
    }
    nextHtml = replaceRange(nextHtml, live.start, live.end, "");
    changed = true;
  }

  const insertions: string[] = [];
  for (const beat of nextSection.beats) {
    const previous = oldBeats.get(beat.id);
    const sourceChanged = !previous ||
      previous.kind !== beat.kind ||
      previous.text !== beat.text;
    const live = findBeat(nextHtml, beat.id);
    const baseline = snapshots.get(beat.id);

    if (!sourceChanged) {
      if (live) {
        retainedSnapshots.set(beat.id, baseline?.signature ?? fingerprint(live.markup));
      } else if (baseline) {
        retainedSnapshots.set(beat.id, baseline.signature);
      } else {
        insertions.push(renderBeat(beat));
      }
      continue;
    }

    if (live && baseline && fingerprint(live.markup) !== baseline.signature) {
      editedBeatIds.push(beat.id);
      if (!confirmEditedBeats) {
        retainedSnapshots.set(beat.id, baseline.signature);
        continue;
      }
    } else if (!live && baseline) {
      editedBeatIds.push(beat.id);
      if (!confirmEditedBeats) {
        retainedSnapshots.set(beat.id, baseline.signature);
        continue;
      }
    }

    const markup = renderBeat(beat);
    if (live) nextHtml = replaceRange(nextHtml, live.start, live.end, markup);
    else insertions.push(markup);
    retainedSnapshots.set(beat.id, fingerprint(markup));
    changed = true;
  }

  for (const [id, signature] of retainedSnapshots) {
    if (!nextBeats.has(id)) continue;
    if (!snapshots.has(id)) continue;
    retainedSnapshots.set(id, signature);
  }

  if (insertions.length) {
    const panel = findPanel(nextHtml, sectionId);
    if (panel) {
      nextHtml = replaceRange(
        nextHtml,
        panel.closeStart,
        panel.closeStart,
        insertions.join(""),
      );
    } else {
      const created = createPanel(sectionId, insertions);
      const inserted = appendToRoot(nextHtml, created);
      if (inserted) nextHtml = inserted;
    }
    changed = nextHtml !== html;
  }

  const nextSnapshots = new Map<string, string>();
  for (const beat of nextSection.beats) {
    const retained = retainedSnapshots.get(beat.id);
    if (retained) {
      nextSnapshots.set(beat.id, retained);
      continue;
    }
    const live = findBeat(nextHtml, beat.id);
    if (live) nextSnapshots.set(beat.id, fingerprint(live.markup));
  }
  for (const [id, signature] of retainedSnapshots) {
    if (!nextBeats.has(id) && editedBeatIds.includes(id) && !confirmEditedBeats) {
      nextSnapshots.set(id, signature);
    }
  }

  return {
    html: nextHtml,
    beats: [...nextSnapshots].map(([id, signature]) => ({ id, signature })),
    changed,
    editedBeatIds: [...new Set(editedBeatIds)],
  };
}

function renderBeat(beat: PlayableStoryTreeBeat): string {
  return `<p data-putenggame-story-tree-beat-id="${escapeAttribute(beat.id)}" data-kind="${beat.kind}" style="margin:0;overflow-wrap:anywhere;color:${beat.kind === "operation" || beat.kind === "choice" ? "#ffd166" : "#fff"};line-height:1.45">${escapeHtml(beat.text)}</p>`;
}

function createPanel(sectionId: string, beats: readonly string[]): string {
  return `<section data-putenggame-story-tree-content="${escapeAttribute(sectionId)}" aria-label="Story content" style="${PANEL_STYLE}">${beats.join("")}</section>`;
}

function findBeat(
  html: string,
  id: string,
): { start: number; end: number; markup: string } | undefined {
  const marker = escapeAttribute(id);
  const expression = new RegExp(
    `<p\\b(?=[^>]*\\bdata-putenggame-story-tree-beat-id=(["'])${escapeRegExp(marker)}\\1)[^>]*>[\\s\\S]*?<\\/p\\s*>`,
    "i",
  );
  const match = expression.exec(html);
  if (!match || match.index === undefined) return undefined;
  return {
    start: match.index,
    end: match.index + match[0].length,
    markup: match[0],
  };
}

function findPanel(
  html: string,
  sectionId: string,
): { closeStart: number } | undefined {
  const marker = escapeRegExp(escapeAttribute(sectionId));
  const opening = new RegExp(
    `<section\\b(?=[^>]*\\bdata-putenggame-story-tree-content=(["'])${marker}\\1)[^>]*>`,
    "i",
  ).exec(html);
  if (!opening || opening.index === undefined) return undefined;
  const closeStart = html.indexOf("</section", opening.index + opening[0].length);
  return closeStart < 0 ? undefined : { closeStart };
}

function appendToRoot(html: string, content: string): string | undefined {
  const root = /<([a-z][\w-]*)\b[^>]*>/i.exec(html);
  if (!root) return undefined;
  const closing = new RegExp(`<\\/\\s*${root[1]}\\s*>`, "gi");
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = closing.exec(html))) last = match;
  if (!last || last.index === undefined) return undefined;
  return `${html.slice(0, last.index)}${content}${html.slice(last.index)}`;
}

function replaceRange(html: string, start: number, end: number, value: string): string {
  return `${html.slice(0, start)}${value}${html.slice(end)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
