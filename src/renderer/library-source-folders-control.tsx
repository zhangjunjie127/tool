import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, FolderOpen, Image as ImageIcon, X } from "./icons.js";
import type { LibrarySourceFolderCategory, LibrarySourceFolders } from "../shared/contracts.js";
import { readLanguage, translateText } from "./i18n.js";

export function LibrarySourceFoldersControl({
  folders,
  onChoose,
  categories: visibleCategories,
  compact = false,
}: {
  folders: LibrarySourceFolders;
  onChoose: (category: LibrarySourceFolderCategory) => void;
  onClear: (category: LibrarySourceFolderCategory) => void;
  categories?: readonly LibrarySourceFolderCategory[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const language = readLanguage();
  const categories: readonly {
    id: LibrarySourceFolderCategory;
    label: string;
    Icon: typeof Film;
  }[] = [
    { id: "video", label: "Video folder", Icon: Film },
    { id: "image", label: "Image folder", Icon: ImageIcon },
  ];
  const shownCategories = visibleCategories
    ? categories.filter(({ id }) => visibleCategories.includes(id))
    : categories;
  const popover = open ? (
    <section
      className={`library-folder-popover${compact ? " is-compact-popup" : ""}`}
      style={
        compact && position
          ? { left: position.left, top: position.top }
          : undefined
      }
      role="dialog"
      aria-label={translateText("Local asset folders", language)}
    >
      <header>
        <strong>{translateText("Local asset folders", language)}</strong>
        <button type="button" aria-label={translateText("Close", language)} onClick={() => setOpen(false)}>
          <X size={14} />
        </button>
      </header>
      <div className="library-folder-list">
        {shownCategories.map(({ id, label, Icon }) => {
          const folder = folders[id];
          const actionLabel = folder ? "Change folder" : "Choose folder";
          return (
            <div className={`library-folder-row${folder ? " is-set" : ""}`} key={id}>
              <span className={`library-folder-kind-icon is-${id}`}>
                <Icon size={18} />
              </span>
              <div className="library-folder-details">
                <div className="library-folder-heading">
                  <strong>{translateText(label, language)}</strong>
                  <span className="library-folder-status">
                    {translateText(folder ? "Folder selected" : "Not set", language)}
                  </span>
                </div>
                <div
                  className={`library-folder-path${folder ? "" : " is-empty"}`}
                  title={folder}
                >
                  <FolderOpen size={13} />
                  <span>{folder || translateText("No folder selected", language)}</span>
                </div>
              </div>
              <button
                type="button"
                className="library-folder-action"
                aria-label={`${translateText(actionLabel, language)}: ${translateText(label, language)}`}
                title={translateText(actionLabel, language)}
                onClick={() => onChoose(id)}
              >
                <FolderOpen size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {!window.putengGameDesktop ? (
        <p className="library-folder-help">
          {translateText("If browser access expires, select the folder again to reconnect.", language)}
        </p>
      ) : null}
    </section>
  ) : null;
  return (
    <div className={`library-source-folders${compact ? " is-compact" : ""}`}>
      <button
        ref={trigger}
        className="library-folder-trigger"
        type="button"
        title={translateText("Local asset folders", language)}
        aria-label={translateText("Local asset folders", language)}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          if (compact) {
            const bounds = trigger.current?.getBoundingClientRect();
            if (bounds) {
              setPosition({
                left: Math.max(8, Math.min(bounds.right - 360, window.innerWidth - 368)),
                top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - 280)),
              });
            }
          }
          setOpen(true);
        }}
      >
        <FolderOpen size={15} />
      </button>
      {compact && popover ? createPortal(popover, document.body) : popover}
    </div>
  );
}
