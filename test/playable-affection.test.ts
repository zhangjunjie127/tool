import { describe, expect, it } from "vitest";
import {
  readPlayableAffectionConfig,
  writePlayableAffectionConfig,
  type PlayableAffectionConfig,
} from "../src/shared/playable-affection.js";

describe("Playable affection config", () => {
  it("round-trips author settings without allowing script text to break out", () => {
    const html = '<main><script type="application/json" data-affection-config>{"characters":[],"choices":[]}</script></main>';
    const config: PlayableAffectionConfig = {
      characters: [{ id: "affection_lan", name: "</script>$&", initial: 4 }],
      choices: [{
        id: "choice_1",
        label: "Stay close",
        characterId: "affection_lan",
        delta: 2,
        threshold: 5,
        successSignal: "closer",
        fallbackSignal: "distant",
      }],
    };
    const updated = writePlayableAffectionConfig(html, config)!;

    expect(updated).not.toContain("</script>$&");
    expect(readPlayableAffectionConfig(updated)).toEqual(config);
  });

  it("leaves source unchanged when the template config block is missing", () => {
    expect(writePlayableAffectionConfig("<main></main>", { characters: [], choices: [] })).toBeUndefined();
    expect(readPlayableAffectionConfig("<main></main>")).toBeUndefined();
  });
});
