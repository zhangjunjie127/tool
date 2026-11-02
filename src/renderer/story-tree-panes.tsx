import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PanelResizeHandle } from "./panel-resize-handle.js";
import { t } from "./i18n.js";

const WIDTH_RATIO_KEY = "ohmygame-story-chapters-ratio";
const WIDTH_KEY = "ohmygame-story-chapters-width";
const DEFAULT_RATIO = 0.4;
const MIN_CHAPTER_WIDTH = 168;
const MIN_TREE_WIDTH = 252;

export const StoryTreePaneMinimumWidthContext = createContext<
  (width: number) => void
>(() => {});

export function StoryTreePanes({
  children,
}: {
  children: [ReactNode, ReactNode];
}) {
  const panes = useRef<HTMLDivElement>(null);
  const reportMinimumWidth = useContext(StoryTreePaneMinimumWidthContext);
  const [width, setWidth] = useState(0);
  const [preferredWidth, setPreferredWidth] = useState<number | undefined>(
    () => {
      try {
        const stored = Number(localStorage.getItem(WIDTH_KEY));
        return Number.isFinite(stored) && stored >= MIN_CHAPTER_WIDTH
          ? stored
          : undefined;
      } catch {
        return undefined;
      }
    },
  );

  useLayoutEffect(() => {
    const element = panes.current;
    if (!element) return;
    const measure = () => {
      const measuredWidth = element.getBoundingClientRect().width;
      setWidth(measuredWidth);
      if (measuredWidth <= 1) return;
      // Convert the previous proportional preference once, then keep chapters fixed.
      setPreferredWidth(
        (current) =>
          current ??
          Math.max(
            MIN_CHAPTER_WIDTH,
            Math.min(
              measuredWidth - 1 - MIN_TREE_WIDTH,
              (measuredWidth - 1) * readLegacyRatio(),
            ),
          ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const available = Math.max(0, width - 1);
  const minimum = Math.min(MIN_CHAPTER_WIDTH, available * DEFAULT_RATIO);
  const maximum = Math.max(minimum, available - MIN_TREE_WIDTH);
  const chapterWidth = Math.min(
    maximum,
    Math.max(minimum, preferredWidth ?? available * DEFAULT_RATIO),
  );
  useLayoutEffect(() => {
    if (width > 0) reportMinimumWidth(chapterWidth + MIN_TREE_WIDTH + 2);
  }, [chapterWidth, reportMinimumWidth, width]);
  useEffect(() => {
    if (preferredWidth === undefined) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(preferredWidth));
    } catch {
      /* Optional preference. */
    }
  }, [preferredWidth]);

  return (
    <div
      ref={panes}
      className="story-tree-panes"
      style={
        width > 0
          ? ({ "--story-chapters-width": `${chapterWidth}px` } as CSSProperties)
          : undefined
      }
    >
      {children[0]}
      <PanelResizeHandle
        className="story-tree-pane-resizer"
        label={t("workspace.resizeChapters")}
        value={chapterWidth}
        minimum={minimum}
        maximum={maximum}
        onChange={(next) => {
          if (available > 0) setPreferredWidth(next);
        }}
        onReset={() =>
          setPreferredWidth(
            Math.min(
              maximum,
              Math.max(MIN_CHAPTER_WIDTH, available * DEFAULT_RATIO),
            ),
          )
        }
      />
      {children[1]}
    </div>
  );
}

function readLegacyRatio() {
  try {
    const stored = Number(localStorage.getItem(WIDTH_RATIO_KEY));
    return stored > 0 && stored < 1 ? stored : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}
