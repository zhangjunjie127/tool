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
      const episodeMatch =
        (episodeTitle.length > 1 && name.includes(episodeTitle)) ||
        namesEpisode(asset.name, context.episodeNumber);
      const chapterMatch =
        chapterTitle.length > 1 && name.includes(chapterTitle);
      return {
        asset,
        score:
          (sceneMatch ? (name === sceneTitle ? 100 : 90) : 0) +
          (episodeMatch ? 15 : 0) +
          (chapterMatch ? 5 : 0),
        sceneMatch,
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
    (!second || first.score > second.score)
      ? first.asset.id
      : undefined;

  return {
    candidates: candidates.map(({ asset, score }) => ({ asset, score })),
    ...(recommendedAssetId ? { recommendedAssetId } : {}),
  };
}

function namesEpisode(name: string, episodeNumber: number): boolean {
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return false;
  const number = String(episodeNumber).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:第)?0*${number}(?:集|话|回|期|episode|ep)(?!\\d)`,
    "iu",
  ).test(name);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
