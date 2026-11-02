import { describe, expect, it } from "vitest";
import yauzl, { type Entry } from "yauzl";
import { parseScreenplayText } from "../src/shared/playable-story-tree.js";
import {
  createPlayableStoryTreeDocx,
  createPlayableStoryTreePrintHtml,
  formatPlayableStoryTreeMarkdownForExport,
} from "../src/renderer/playable-story-tree-export.js";
import { formatPlayableStoryTreeText } from "../src/shared/playable-story-tree.js";

const tree = parseScreenplayText(
  [
    "第1篇章，序章",
    "第1集",
    "1-1 初遇",
    "主角收到信件。",
    "1-2 结局",
    "主角找到出口。",
  ],
  "screenplay.txt",
).tree;

describe("story tree export", () => {
  it("exports Markdown with chapter, episode, scene, and route hierarchy", () => {
    const output = formatPlayableStoryTreeMarkdownForExport(tree);

    expect(output).toContain("```text");
    expect(output).toContain("└── 序章");
    expect(output).toContain("│");
    expect(output).toContain("├── 初遇");
    expect(output).toContain("└── 结局");
    expect(output).toContain("继续 →【结局】");
  });

  it("creates a valid Word archive containing the hierarchical document XML", async () => {
    const output = createPlayableStoryTreeDocx(tree);
    const entries = await readZipEntries(output);

    expect(
      new DataView(output.buffer, output.byteOffset).getUint32(0, true),
    ).toBe(0x04034b50);
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.get("word/document.xml")).toContain("TreeLine");
    expect(entries.get("word/document.xml")).toContain("│");
    expect(entries.get("word/document.xml")).toContain("主角收到信件。");
    expect(entries.get("word/styles.xml")).toContain("Consolas");
  });

  it("renders printable HTML with escaped scene content and route targets", () => {
    const printableTree = structuredClone(tree);
    printableTree.chapters[0]!.episodes[0]!.sections[0]!.title =
      "<script>bad()</script>";
    const html = createPlayableStoryTreePrintHtml(printableTree);

    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).not.toContain("<script>bad()</script>");
    expect(html).toContain("主角收到信件。");
    expect(html).toContain('<pre class="story-tree">');
    expect(html).toContain("│");
    expect(html).toContain("继续 →【结局】");
  });

  it("keeps branch links and long content readable in the connected tree", () => {
    const branchTree = parseScreenplayText(
      [
        "第1篇章，序章",
        "第1集",
        "1-1 选择",
        "选择 D01",
        "1-2A 答应赌注",
        "A 路线的剧情内容。",
        "1-2B 拒绝赌注",
        "B 路线的剧情内容。",
        "1-3 主线汇合",
        "汇合剧情内容。",
      ],
      "branches.txt",
    ).tree;
    branchTree.chapters[0]!.episodes[0]!.sections[0]!.objective =
      "此处包含较长的目标描述，用于确认导出时会自动换行并且保留树形缩进。";

    const output = formatPlayableStoryTreeText(branchTree);

    expect(output).toContain("├── 选择");
    expect(output).toContain("│   ├── 目标：此处包含较长的目标描述");
    expect(output).toContain("├── A分支");
    expect(output).toContain("├── B分支");
    expect(output).toContain("└── 主线汇合");
    expect(output).toContain("主线汇合 →【主线汇合】");
  });
});

function readZipEntries(bytes: Uint8Array): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zip) => {
        if (openError || !zip) {
          reject(
            openError ?? new Error("The DOCX archive could not be opened."),
          );
          return;
        }
        const entries = new Map<string, string>();
        zip.on("error", reject);
        zip.on("end", () => resolve(entries));
        zip.on("entry", (entry: Entry) => {
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              reject(
                streamError ?? new Error("The DOCX entry could not be read."),
              );
              return;
            }
            const chunks: Buffer[] = [];
            stream.on("error", reject);
            stream.on("data", (chunk: Buffer) =>
              chunks.push(Buffer.from(chunk)),
            );
            stream.on("end", () => {
              entries.set(
                entry.fileName,
                Buffer.concat(chunks).toString("utf8"),
              );
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
