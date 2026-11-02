export interface PlayableStoryVideoAsset {
  id: string;
  name: string;
}

export interface PlayableStoryVideoMatchContext {
  chapterTitle: string;
  episodeTitle: string;
  episodeNumber: number;
  sceneTitle: string;
}

export interface RankedPlayableStoryVideo {
  asset: PlayableStoryVideoAsset;
  score: number;
}

export function rankPlayableStoryVideos(
  context: PlayableStoryVideoMatchContext,
  assets: readonly PlayableStoryVideoAsset[],
): {
  candidates: RankedPlayableStoryVideo[];
  recommendedAssetId?: string;
} {
  const sceneTitle = normalize(context.sceneTitle);
  const episodeTitle = normalize(context.episodeTitle);
  const chapterTitle = normalize(context.chapterTitle);
  const candidates = assets
    .map((asset) => {
      const name = normalize(asset.name.replace(/\.[^.]+$/u, ""));
      const sceneMatch =
        sceneTitle.length > 1 &&
        (name === sceneTitle || name.includes(sceneTitle));
      const episodes = namedEpisodes(asset.name);
      const episodeConflict = episodes.some((number) => number !== context.episodeNumber);
      const episodeMatch =
        !episodeConflict &&
        (episodes.includes(context.episodeNumber) ||
          (episodes.length === 0 && episodeTitle.length > 1 && name.includes(episodeTitle)));
      const chapterMatch =
        chapterTitle.length > 1 && name.includes(chapterTitle);
      return {
        asset,
        score:
          (sceneMatch ? (name === sceneTitle ? 100 : 90) : 0) +
          (episodeMatch ? 15 : 0) +
          (chapterMatch ? 5 : 0),
        sceneMatch,
        episodeConflict,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.asset.name.localeCompare(right.asset.name, "zh-CN"),
    );
  const first = candidates[0];
  const second = candidates[1];
  const recommendedAssetId =
    first?.sceneMatch &&
    !first.episodeConflict &&
    (!second || first.score > second.score)
      ? first.asset.id
      : undefined;

  return {
    candidates: candidates.map(({ asset, score }) => ({ asset, score })),
    ...(recommendedAssetId ? { recommendedAssetId } : {}),
  };
}

function namedEpisodes(name: string): number[] {
  const normalized = name.normalize("NFKC");
  const numbers: number[] = [];
  for (const match of normalized.matchAll(
    /(?<![0-9零〇一二两三四五六七八九十百千])(?:第\s*)?([0-9零〇一二两三四五六七八九十百千]+)\s*(?:集|话|回|期)|(?<![a-z0-9])(?:episode|ep)[\s_-]*(\d+)(?!\d)/giu,
  )) {
    const value = match[1] ?? match[2]!;
    if (/^\d+$/u.test(value)) {
      numbers.push(Number(value));
      continue;
    }
    const digits: Record<string, number> = {
      零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
      五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    };
    const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
    let total = 0;
    let digit = 0;
    for (const character of value) {
      if (units[character]) {
        total += (digit || 1) * units[character]!;
        digit = 0;
      } else {
        digit = digit * 10 + (digits[character] ?? 0);
      }
    }
    numbers.push(total + digit);
  }
  return numbers;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
