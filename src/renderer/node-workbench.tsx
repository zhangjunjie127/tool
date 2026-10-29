import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Columns2, FileText, Image as ImageIcon, Layers3, LoaderCircle, Search, Upload, X } from "./icons.js";
import type { LibrarySourceFolderCategory, LibrarySourceFolders, LibraryUploadMediaType } from "../shared/contracts.js";
import {
  filterCustomLibraryAssets,
  filterLibraryAssets,
  filterLocalLibraryAssets,
  type LibraryAsset,
  type LibraryAssetFilters,
} from "./library-assets.js";
import { LibraryCollectionFilters } from "./library-filters.js";
import { listLibrarySourceFolders, setLibrarySourceFolder, uploadLibraryAsset } from "./api.js";
import { readMediaFileDuration } from "./video-reference-files.js";
import { useNearViewport } from "./asset-gallery.js";
import { AssetThumbnail, assetTypeBadge } from "./asset-browser.js";
import type { MediaFilter } from "./asset-browser.js";
import { t, translateText, useLanguage } from "./i18n.js";
import { LibrarySourceFoldersControl } from "./library-source-folders-control.js";

type LibraryPickerView = "small" | "medium" | "large" | "list";
export type LibraryPickerCategory = MediaFilter | "custom";

/**
 * Workbench pieces for the Playable Nodes editor: a breadcrumb back to the
 * Story canvas, a scaled preview frame, and the Library picker.
 */
export function WorkbenchBreadcrumb({
  label,
  onClose,
  onRename,
}: {
  label: string;
  onClose: () => void;
  /** Makes the label an editable title. */
  onRename?: (label: string) => void;
}) {
  const { language } = useLanguage();
  return (
    <nav className="story-node-editor-breadcrumb" aria-label={translateText("Breadcrumb", language)}>
      <button type="button" onClick={onClose}>
        {translateText("Story", language)}
      </button>
      <ChevronRight size={12} aria-hidden="true" />
      {onRename ? (
        <BreadcrumbTitle value={label} onCommit={onRename} />
      ) : (
        <strong>{label}</strong>
      )}
    </nav>
  );
}

function BreadcrumbTitle({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const { language } = useLanguage();
  const [draft, setDraft] = useState(value);
  // Esc blurs too; the blur that follows must not save the discarded draft.
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!cancelled.current && next && next !== value) onCommit(next);
    else setDraft(value);
    cancelled.current = false;
  };
  const visibleDraft = translateText(draft, language);
  return (
    <input
      className="story-node-editor-breadcrumb-title"
      aria-label={translateText("Title", language)}
      title={translateText("Rename", language)}
      value={visibleDraft}
      maxLength={120}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** Scales a fixed-size stage to fit its frame while keeping the viewport ratio. */
export function WorkbenchPreview({
  ariaLabel,
  viewport,
  stageClassName,
  layout = "preview",
  overlay,
  stageOverlay,
  stageOverlayHeight = 0,
  pickerOpen = false,
  pickerNavigation,
  children,
}: {
  ariaLabel: string;
  viewport: { width: number; height: number };
  stageClassName?: string;
  layout?: "preview" | "side-panels";
  /** Floats over the preview frame, such as a tool bar. */
  overlay?: ReactNode;
  /** Content aligned to the scaled stage, such as its timeline. */
  stageOverlay?: ReactNode;
  stageOverlayHeight?: number;
  pickerOpen?: boolean;
  pickerNavigation?: ReactNode;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{
    width: number;
    height: number;
  }>();

  useLayoutEffect(() => {
    const container = frame.current;
    if (!container) return;
    const update = () => {
      const style = getComputedStyle(container);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const availableHeight = Math.max(
        1,
        container.clientHeight - verticalPadding - stageOverlayHeight,
      );
      const scale = Math.min(
        Math.max(1, container.clientWidth - horizontalPadding) / viewport.width,
        availableHeight / viewport.height,
      );
      setStageSize({
        width: Math.max(1, viewport.width * scale),
        height: Math.max(1, viewport.height * scale),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [stageOverlayHeight, viewport.height, viewport.width]);

  return (
    <section
      className={`story-workbench-preview${layout === "side-panels" ? " has-side-panels" : ""}${pickerOpen ? " has-library-picker" : ""}`}
      aria-label={ariaLabel}
    >
      <div ref={frame} className="story-workbench-preview-frame">
        <div
          className="story-workbench-preview-stage-shell"
          style={
            stageSize
              ? {
                  width: stageSize.width,
                  height: stageSize.height + stageOverlayHeight,
                }
              : undefined
          }
        >
          <div
            className={`story-workbench-preview-stage${stageClassName ? ` ${stageClassName}` : ""}`}
            style={stageSize}
          >
            {children}
          </div>
          {stageOverlay}
        </div>
      </div>
      {pickerOpen && pickerNavigation ? (
        <aside className="playable-preview-library-navigation">
          {pickerNavigation}
        </aside>
      ) : null}
      {/* Outside the frame, which clips the scaled stage, so shadows and popovers are not cut off. */}
      {overlay}
    </section>
  );
}

export function LibraryAssetPicker({
  title,
  projectId,
  project,
  assets,
  sessionImportedAssetIds,
  uploading,
  inline = false,
  includeReferences = false,
  categoryFilter = "all",
  uploadLabel = "Upload",
  viewMode,
  onViewModeChange,
  sourceFolders,
  onChooseSourceFolder,
  onClearSourceFolder,
  onRefreshSourceFolders,
  onUpload,
  onClose,
  onSelect,
  onRemoveFromSession,
}: {
  title: string;
  projectId?: string;
  project?: { id: string };
  assets: readonly LibraryAsset[];
  sessionImportedAssetIds?: ReadonlySet<string>;
  /** Offers Upload next to the Library, for a new file instead. */
  onUpload?: () => void;
  uploading?: boolean;
  inline?: boolean;
  includeReferences?: boolean;
  categoryFilter?: LibraryPickerCategory;
  uploadLabel?: string;
  viewMode?: LibraryPickerView;
  onViewModeChange?: (view: LibraryPickerView) => void;
  sourceFolders?: LibrarySourceFolders;
  onChooseSourceFolder?: (category: LibrarySourceFolderCategory) => void;
  onClearSourceFolder?: (category: LibrarySourceFolderCategory) => void;
  onRefreshSourceFolders?: () => Promise<void>;
  onClose: () => void;
  onSelect: (asset: LibraryAsset) => void;
  onRemoveFromSession?: (asset: LibraryAsset) => void;
}) {
  const [query, setQuery] = useState("");
  const [localView, setLocalView] = useState<LibraryPickerView>("small");
  const [contextMenu, setContextMenu] = useState<{
    asset: LibraryAsset;
    x: number;
    y: number;
  }>();
  const view = viewMode ?? localView;
  const { language } = useLanguage();
  const [filters, setFilters] = useState<LibraryAssetFilters>({
    includeReferences,
    projectId: project?.id ?? projectId,
  });
  const dialog = useRef<HTMLElement>(null);
  // Parents may pass a fresh onClose each render; depending on it would re-run this effect and steal focus from search.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    dialog.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const visibleAssets = useMemo(
    () => {
      if (categoryFilter === "custom") {
        return filterCustomLibraryAssets(
          assets,
          query,
          filters,
          sessionImportedAssetIds ?? new Set(),
        );
      }
      if (inline && (categoryFilter === "video" || categoryFilter === "image")) {
        return filterLocalLibraryAssets(assets, categoryFilter, query, filters);
      }
      return filterLibraryAssets(assets, categoryFilter, query, filters);
    },
    [categoryFilter, query, assets, filters, inline, sessionImportedAssetIds],
  );

  const picker = (
    <section
      className={`story-video-picker${inline ? " is-inline" : ""}`}
      ref={dialog}
      role="dialog"
      aria-modal={inline ? undefined : "true"}
      aria-labelledby="story-video-picker-title"
      tabIndex={-1}
    >
        <header>
          <h2 id="story-video-picker-title">{title}</h2>
          {inline &&
          (categoryFilter === "video" || categoryFilter === "image") &&
          sourceFolders &&
          onChooseSourceFolder &&
          onClearSourceFolder ? (
            <LibrarySourceFoldersControl
              compact
              categories={["video", "image"]}
              folders={sourceFolders}
              onChoose={onChooseSourceFolder}
              onClear={onClearSourceFolder}
              onRefresh={onRefreshSourceFolders}
            />
          ) : null}
          {onUpload ? (
            <button
              type="button"
              className="story-video-picker-upload"
              disabled={uploading}
              onClick={onUpload}
            >
              {uploading ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Upload size={14} />
              )}
              <span>{translateText(uploadLabel, language)}</span>
            </button>
          ) : null}
          <button
            type="button"
            aria-label={translateText("Close Library picker", language)}
            disabled={uploading}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="library-picker-toolbar">
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translateText("Search Library", language)}
            />
          </label>
          {!inline ? (
            <LibraryCollectionFilters
              assets={assets}
              filters={filters}
              onChange={setFilters}
              defaultIncludeReferences={includeReferences}
            />
          ) : null}
        </div>
        {inline ? (
          <div className="library-picker-view-controls" role="group" aria-label={translateText("Thumbnail display", language)}>
            {([
              ["small", "Small thumbnails", Layers3],
              ["medium", "Medium thumbnails", Columns2],
              ["large", "Large thumbnails", ImageIcon],
              ["list", "List view", FileText],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                title={translateText(label, language)}
                aria-label={translateText(label, language)}
                aria-pressed={view === id}
                onClick={() => {
                  setLocalView(id);
                  onViewModeChange?.(id);
                }}
              >
                <Icon size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        <div
          className={`story-video-picker-list${inline ? " is-inline-assets" : ""}`}
          data-view={inline ? view : undefined}
          id="story-video-picker-list"
          role={categoryFilter === "all" ? undefined : "tabpanel"}
          aria-labelledby={categoryFilter === "all" ? undefined : `story-picker-tab-${categoryFilter}`}
          tabIndex={categoryFilter === "all" ? undefined : 0}
        >
          {visibleAssets.length === 0 ? (
            <p>
              {assets.length
                ? translateText("No assets match your search", language)
                : translateText("No assets in Library", language)}
            </p>
          ) : null}
          {visibleAssets.map((asset) => (
            <LibraryPickerItem
              key={asset.id}
              asset={asset}
              onSelect={() => onSelect(asset)}
              onContextMenu={
                categoryFilter === "custom" && onRemoveFromSession
                  ? (event) => {
                      event.preventDefault();
                      setContextMenu({
                        asset,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }
                  : undefined
              }
            />
          ))}
        </div>
        {contextMenu ? (
          <div
            className="library-picker-context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRemoveFromSession?.(contextMenu.asset);
                setContextMenu(undefined);
              }}
            >
              {translateText("Remove from current list", language)}
            </button>
          </div>
        ) : null}
    </section>
  );
  if (inline) return picker;
  return createPortal(
    <div
      className="story-video-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {picker}
    </div>,
    document.body,
  );
}

/** One Library asset in the picker: the Library's own thumbnail, loaded once it scrolls near view, and its name. */
function LibraryPickerItem({
  asset,
  onSelect,
  onContextMenu,
}: {
  asset: LibraryAsset;
  onSelect: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const [item, visible] = useNearViewport<HTMLButtonElement>();
  const { language } = useLanguage();
  const badge = assetTypeBadge(asset.mediaType);
  const title = asset.prompt ?? asset.name;
  return (
    <button
      type="button"
      ref={item}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={title}
    >
      <span className="story-video-picker-thumbnail">
        <AssetThumbnail asset={asset} visible={visible} />
        {badge ? (
          <span className="story-video-picker-badge">{badge}</span>
        ) : null}
      </span>
      <span>
        <strong>{title}</strong>
        {asset.prompt ? <small>{asset.name}</small> : null}
        {asset.referenceOnly || asset.projects?.length ? (
          <small>
            {asset.referenceOnly ? translateText("Reference", language) : ""}
            {asset.projects?.length === 1
              ? `${asset.referenceOnly ? " · " : ""}${asset.projects[0]!.name}`
              : asset.projects?.length
                ? `${asset.referenceOnly ? " · " : ""}${t("nodeWorkbench.projectCount", { count: asset.projects.length })}`
                : ""}
          </small>
        ) : null}
      </span>
    </button>
  );
}

/** Uploads a media file to the Library. */
export async function uploadLibraryFile(file: File): Promise<LibraryAsset> {
  const mediaType = libraryUploadMediaType(file);
  if (!mediaType)
    throw new Error(
      t("nodeWorkbench.uploadTypes"),
    );
  const kind = mediaType.startsWith("video/")
    ? "video"
    : mediaType.startsWith("audio/")
      ? "audio"
      : undefined;
  const duration = kind ? await readMediaFileDuration(file, kind) : undefined;
  const uploaded = await uploadLibraryAsset(file, mediaType, duration);
  return { ...uploaded, assetId: uploaded.id, path: uploaded.name };
}

export function uploadLibraryFiles(files: readonly File[]) {
  return Promise.allSettled(files.map(uploadLibraryFile));
}

function libraryUploadMediaType(
  file: File,
): LibraryUploadMediaType | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  return undefined;
}
