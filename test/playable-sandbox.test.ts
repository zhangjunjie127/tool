import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  assertPlayableSandboxDocument,
  installPlayableSandboxCsp,
  PLAYABLE_IFRAME_SANDBOX,
  PLAYABLE_SANDBOX_CSP,
} from "../src/shared/playable-sandbox.js";
import {
  isPlayableFrameMessage,
  isPlayableHostMessage,
} from "../src/shared/playable-player-protocol.js";

describe("Playable sandbox", () => {
  it("keeps renderer and published sandbox documents on the Runtime CSP", async () => {
    for (const file of [
      "playable-sandbox.html",
      "player/playable-sandbox.html",
    ]) {
      const html = await readFile(file, "utf8");
      expect(html).toContain(`content="${PLAYABLE_SANDBOX_CSP}"`);
      expect(html).toContain('data-playable-sandbox-csp="true"');
      expect(html).toContain('src="./assets/playable-sandbox.js"');
      expect(html).toContain("vite-ignore");
      expect(html).not.toContain('type="module"');
    }
  });

  it("requires a dedicated opaque-origin iframe document", () => {
    const iframeDocument = {
      defaultView: {
        origin: "null",
        top: {},
      },
    } as unknown as Document;
    const topLevelDocument = {
      defaultView: undefined as unknown as Window,
    } as Document;
    const sameOriginFrame = {
      defaultView: {
        origin: "https://example.test",
        top: {},
      },
    } as unknown as Document;

    expect(() => assertPlayableSandboxDocument(iframeDocument)).not.toThrow();
    expect(() => assertPlayableSandboxDocument(topLevelDocument)).toThrow(
      'sandbox="allow-scripts"',
    );
    expect(() => assertPlayableSandboxDocument(sameOriginFrame)).toThrow(
      'sandbox="allow-scripts"',
    );
  });

  it("installs the required CSP before authored surfaces load", () => {
    let installed: FakeMeta | undefined;
    let contentAtInsertion: string | undefined;
    const document = {
      head: {
        querySelector() {
          return installed;
        },
        prepend(meta: FakeMeta) {
          contentAtInsertion = meta.content;
          installed = meta;
        },
      },
      createElement() {
        return { content: "", dataset: {}, httpEquiv: "" } satisfies FakeMeta;
      },
    } as unknown as Document;

    installPlayableSandboxCsp(document);
    const first = installed;
    installPlayableSandboxCsp(document);

    expect(installed).toBe(first);
    expect(contentAtInsertion).toBe(PLAYABLE_SANDBOX_CSP);
    expect(installed).toEqual({
      content: PLAYABLE_SANDBOX_CSP,
      dataset: { playableSandboxCsp: "true" },
      httpEquiv: "Content-Security-Policy",
    });
    expect(PLAYABLE_IFRAME_SANDBOX).toBe("allow-scripts");
  });

  it("rejects a sandbox document whose installed Runtime policy was changed", () => {
    const installed = {
      content: "default-src *",
      dataset: { playableSandboxCsp: "true" },
      httpEquiv: "Content-Security-Policy",
    };
    const document = {
      head: {
        querySelector() {
          return installed;
        },
      },
    } as unknown as Document;

    expect(() => installPlayableSandboxCsp(document)).toThrow(
      "Playable sandbox CSP does not match the Runtime policy.",
    );
  });

  it("keeps diagnostics distinct from fatal Player errors", () => {
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:diagnostic",
        instanceId: "instance",
        error: "Cleanup failed",
      }),
    ).toBe(true);
    expect(
      isPlayableFrameMessage({
        kind: "putenggame:playable:diagnostic",
        instanceId: "instance",
        error: 42,
      }),
    ).toBe(false);
  });

  it("accepts moves for a button label without changing the move protocol shape", () => {
    const message = {
      kind: "putenggame:playable:moved",
      instanceId: "instance",
      move: {
        pick: {
          nodeId: "choice",
          source: "nodes/choice/index.html:2:1",
          cssPath: "main > button",
          tag: "button",
          buttonAssetId: "button-background",
          text: "Continue",
          box: { x: 0, y: 0, width: 100, height: 40 },
        },
        part: "button-label",
        translate: { x: 4, y: -2 },
        inPlace: true,
      },
    };

    expect(isPlayableFrameMessage(message)).toBe(true);
    expect(
      isPlayableFrameMessage({
        ...message,
        move: { ...message.move, part: "button-image" },
      }),
    ).toBe(false);
  });

  it("validates progress-material previews without a motion remount command", () => {
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: {
          command: "motion-progress-preview",
          nodeId: "choice",
          cssPath: "main > button",
          source: "nodes/choice/index.html:2:1",
          scale: 150,
          offsetX: 24,
          offsetY: -12,
          asset: {
            contentType: "image/png",
            bytes: new ArrayBuffer(4),
          },
        },
      }),
    ).toBe(true);
    const invalid = {
      kind: "putenggame:playable:media-command",
      instanceId: "instance",
      command: {
        command: "motion-progress-preview",
        nodeId: "choice",
        cssPath: "main > button",
        source: "nodes/choice/index.html:2:1",
        scale: 150,
        offsetX: 101,
        asset: {
          contentType: "image/png",
          bytes: new ArrayBuffer(4),
        },
      },
    };
    expect(isPlayableHostMessage(invalid)).toBe(false);
  });

  it("validates in-place appearance timing commands", () => {
    const message = {
      kind: "putenggame:playable:appearance-timing",
      instanceId: "instance",
      command: {
        sequence: 1,
        updates: [
          {
            pick: {
              nodeId: "choice",
              source: "nodes/choice/index.html:2:1",
              cssPath: "main > button",
              tag: "button",
            },
            delaySeconds: 80,
            endSeconds: 120,
          },
        ],
      },
    };

    expect(isPlayableHostMessage(message)).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          updates: [{ ...message.command.updates[0], delaySeconds: -1 }],
        },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          updates: [{ ...message.command.updates[0], endSeconds: 80 }],
        },
      }),
    ).toBe(false);
  });

  it("validates background-video loop commands", () => {
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: { command: "backdrop-loop", loop: true },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: { command: "backdrop-loop", loop: "true" },
      }),
    ).toBe(false);
  });

  it("validates in-place background replacement and removal commands", () => {
    const asset = {
      assetId: "opening",
      type: "video",
      transfer: {
        contentType: "video/mp4",
        bytes: new ArrayBuffer(4),
      },
      loop: true,
    };
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: {
          command: "set-backdrop",
          nodeId: "start",
          sequence: 1,
          asset,
        },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: {
          command: "set-backdrop",
          nodeId: "start",
          sequence: 2,
        },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        kind: "putenggame:playable:media-command",
        instanceId: "instance",
        command: {
          command: "set-backdrop",
          nodeId: "start",
          sequence: 3,
          asset: { ...asset, type: "audio" },
        },
      }),
    ).toBe(false);
  });

  it("accepts the standalone button-feedback motion and requires its feedback", () => {
    const message = {
      kind: "putenggame:playable:motion",
      instanceId: "instance",
      command: {
        sequence: 1,
        target: {
          kind: "element",
          pick: {
            nodeId: "start",
            source: "nodes/start/index.html:1:1",
            cssPath: "button",
            tag: "button",
          },
        },
        config: {
          kind: "button-feedback",
          mode: "visual",
          duration: 0.1,
          feedback: "hover-press",
        },
      },
    };
    expect(isPlayableHostMessage(message)).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, buttonText: "Start" },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, buttonText: "a".repeat(121) },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          config: {
            ...message.command.config,
            feedback: "bounce-hover-press",
          },
        },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, buttonSignal: "answer-correct" },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          config: { ...message.command.config, feedback: undefined },
        },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, buttonSignal: 42 },
      }),
    ).toBe(false);
  });

  it("validates the node-level no-input continuation command", () => {
    const message = {
      kind: "putenggame:playable:media-command",
      instanceId: "instance",
      command: {
        command: "continue-without-input",
        nodeId: "start",
        enabled: true,
      },
    };
    expect(isPlayableHostMessage(message)).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, enabled: "true" },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          command: "no-input-mode",
          nodeId: "start",
          mode: "wait",
        },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          command: "no-input-mode",
          nodeId: "start",
          mode: "sometimes",
        },
      }),
    ).toBe(false);
  });

  it("validates live insertion commands for canvas media", () => {
    const message = {
      kind: "putenggame:playable:media-command",
      instanceId: "instance",
      command: {
        command: "insert-media",
        nodeId: "start",
        source: "nodes/start/index.html:2:3",
        assetId: "portrait",
        type: "image",
        asset: {
          contentType: "image/png",
          bytes: new ArrayBuffer(4),
        },
      },
    };
    expect(isPlayableHostMessage(message)).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          type: "audio",
        },
      }),
    ).toBe(false);
  });

  it("validates live insertion commands for button presets", () => {
    const message = {
      kind: "putenggame:playable:media-command",
      instanceId: "instance",
      command: {
        command: "insert-button-preset",
        nodeId: "start",
        id: "putenggame-button-new",
        source: "nodes/start/index.html:2:3",
        signal: "button-1",
        label: "新按钮",
        buttonText: "开始",
        fontFamily: "Microsoft YaHei",
        pressedAssetId: "pressed-image",
        pressedAsset: {
          contentType: "image/png",
          bytes: new Uint8Array([1]).buffer,
        },
        motion: {
          kind: "button-feedback",
          mode: "visual",
          duration: 0.1,
          feedback: "hover-press",
        },
      },
    };
    expect(isPlayableHostMessage(message)).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          motion: {
            ...message.command.motion,
            feedback: "bounce-hover-press",
          },
        },
      }),
    ).toBe(true);
    expect(
      isPlayableHostMessage({
        ...message,
        command: {
          ...message.command,
          motion: { ...message.command.motion, mode: "bad" },
        },
      }),
    ).toBe(false);
    expect(
      isPlayableHostMessage({
        ...message,
        command: { ...message.command, signal: 42 },
      }),
    ).toBe(false);
  });
});

interface FakeMeta {
  content: string;
  dataset: Record<string, string>;
  httpEquiv: string;
}
