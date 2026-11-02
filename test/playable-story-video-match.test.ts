import { describe, expect, it } from "vitest";
import { rankPlayableStoryVideos } from "../src/shared/playable-story-video-match.js";

describe("playable story video matching", () => {
  const context = {
    chapterTitle: "序章",
    episodeTitle: "第一集",
    episodeNumber: 1,
    sceneTitle: "初遇",
  };

  it("ranks videos by scene, episode, and chapter names", () => {
    const result = rankPlayableStoryVideos(context, [
      { id: "wrong-episode", name: "第2集_初遇.mp4" },
      { id: "exact", name: "序章_第1集_初遇.mp4" },
      { id: "episode-only", name: "序章_第1集_场景视频.mp4" },
    ]);

    expect(result.candidates.map(({ asset }) => asset.id)).toEqual([
      "exact",
      "wrong-episode",
      "episode-only",
    ]);
    expect(result.recommendedAssetId).toBe("exact");
  });

  it("does not recommend an ambiguous same-title match", () => {
    const result = rankPlayableStoryVideos(context, [
      { id: "one", name: "初遇_背景.mp4" },
      { id: "two", name: "初遇_镜头.mp4" },
    ]);

    expect(result.recommendedAssetId).toBeUndefined();
  });

  it("uses explicit episode markers without matching a longer episode number", () => {
    const result = rankPlayableStoryVideos(context, [
      { id: "ten", name: "第10集_其他场景.mp4" },
      { id: "one", name: "第1集_其他场景.mp4" },
    ]);

    expect(result.candidates[0]?.asset.id).toBe("one");
    expect(result.candidates[0]?.score).toBe(15);
    expect(result.candidates[1]?.score).toBe(0);
  });

  it("matches exact Chinese episode titles from filenames", () => {
    const result = rankPlayableStoryVideos(context, [
      { id: "first", name: "第一集_场景视频.mp4" },
    ]);

    expect(result.candidates[0]?.score).toBe(15);
  });
});
