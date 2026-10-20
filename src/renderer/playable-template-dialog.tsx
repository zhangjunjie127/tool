import { useEffect, useId, useRef } from "react";
import { X } from "./icons.js";
import type { PlayablePresetSummary } from "../shared/playable-editor.js";
import blank from "./assets/templates/blank.webp";
import choice from "./assets/templates/choice.webp";
import ending from "./assets/templates/ending.webp";
import hotspot from "./assets/templates/hotspot.webp";
import mainMenu from "./assets/templates/main-menu.webp";
import qte from "./assets/templates/qte.webp";
import storyMap from "./assets/templates/story-map.webp";
import affection from "./assets/templates/affection.webp";
import blankZh from "./assets/templates/blank-zh.webp";
import choiceZh from "./assets/templates/choice-zh.webp";
import endingZh from "./assets/templates/ending-zh.webp";
import hotspotZh from "./assets/templates/hotspot-zh.webp";
import mainMenuZh from "./assets/templates/main-menu-zh.webp";
import qteZh from "./assets/templates/qte-zh.webp";
import storyMapZh from "./assets/templates/story-map-zh.webp";
import affectionZh from "./assets/templates/affection-zh.webp";
import { useLanguage } from "./i18n.js";
import { translateText } from "./i18n.js";

/**
 * Pictures of each Template as a new Scene looks: its starter source with the
 * default Project Style and no background, titled with the Template's name.
 * Recapture them from the canvas thumbnails when a Template's source changes.
 * The Story map's shows a sample story partly played instead, since a new
 * one has nothing seen to show.
 */
const TEMPLATE_PICTURES: Record<string, string> = {
  blank,
  choice,
  ending,
  hotspot,
  "main-menu": mainMenu,
  qte,
  "story-map": storyMap,
  affection,
};

const TEMPLATE_PICTURES_ZH: Record<string, string> = {
  blank: blankZh,
  choice: choiceZh,
  ending: endingZh,
  hotspot: hotspotZh,
  "main-menu": mainMenuZh,
  qte: qteZh,
  "story-map": storyMapZh,
  affection: affectionZh,
};

/** Add a Scene: a grid of Templates, each with a picture and one line. */
export function PlayableTemplateDialog({ presets, busy, onChoose, onClose }: {
  presets: readonly PlayablePresetSummary[];
  busy: boolean;
  onChoose: (presetId: string) => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialog.current?.querySelector<HTMLElement>("button.playable-template")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const pictures = language === "zh-CN" ? TEMPLATE_PICTURES_ZH : TEMPLATE_PICTURES;

  return <div className="project-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="project-create-dialog playable-template-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header>
        <div>
          <h2 id={titleId}>{translateText("Add a Scene")}</h2>
          <p>{translateText("Pick a starting point, then describe the Scene in chat.")}</p>
        </div>
        <button type="button" aria-label={translateText("Close")} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="playable-template-grid">
        {presets.map((preset) => <button
          type="button"
          className="playable-template"
          key={preset.id}
          disabled={busy}
          onClick={() => onChoose(preset.id)}
        >
          <span className="playable-template-picture">
            {pictures[preset.id] ? <img src={pictures[preset.id]} alt="" /> : null}
          </span>
          <strong>{translateText(preset.label)}</strong>
          <small>{translateText(preset.summary)}</small>
        </button>)}
      </div>
    </section>
  </div>;
}
