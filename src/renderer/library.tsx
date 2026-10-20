import { useReadyRuntimeGeneration } from "./runtime-connection.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AssetToolbar,
  fileName,
  fileStem,
  WorkspaceAssetCard,
  WorkspaceAssetDialog,
  type MediaFilter,
} from "./asset-browser.js";
import { deleteLibraryAsset, forceDeleteLibraryAsset, listLibraryAssetReferences, listLibrarySourceFolders, renameLibraryAsset, saveLibraryAsset, setLibrarySourceFolder, type LibraryAssetReference } from "./api.js";
import { Film, Image as ImageIcon, Layers3, LoaderCircle, RefreshCw, X } from "./icons.js";
import { filterLibraryAssets, loadLibraryAssets, sortLibraryAssets, type LibraryAsset, type LibraryAssetFilters, type LibraryAssetSort } from "./library-assets.js";
import { LibraryCollectionFilters } from "./library-filters.js";
import { LibrarySourceFoldersControl } from "./library-source-folders-control.js";
import type { LibrarySourceFolderCategory, LibrarySourceFolders } from "../shared/contracts.js";
import { readLanguage, translateText } from "./i18n.js";
import { browserLibraryFolderNames, chooseBrowserLibraryFolder, clearBrowserLibraryFolder } from "./browser-library-folders.js";
import type { AppNavigationTarget } from "./routes.js";
import { ProjectRenameDialog } from "./project-rename-dialog.js";
import { SidebarPageHeader, SidebarPageLayout } from "./sidebar-page.js";
import { t } from "./i18n.js";

const LIBRARY_TABS: readonly { id: MediaFilter; label: string; icon: typeof Layers3 }[] = [
  { id: "all", label: "All assets", icon: Layers3 },
  { id: "video", label: "Videos", icon: Film },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "ui", label: "UI", icon: Layers3 },
];

interface LibraryPageProps {
  onNavigate: (page: AppNavigationTarget) => void;
}

export function LibraryPage({ onNavigate }: LibraryPageProps) {
  const serviceGeneration = useReadyRuntimeGeneration();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryAssetFilters>({});
  const [sourceFolders, setSourceFolders] = useState<LibrarySourceFolders>({});
  const [sort, setSort] = useState<LibraryAssetSort>("modified");
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number }>();
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset>();
  const [deleteTarget, setDeleteTarget] = useState<{ asset: LibraryAsset; references: LibraryAssetReference[] }>();
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LibraryAsset>();

  async function load(): Promise<void> {
    setPhase("loading");
    setError(undefined);
    try {
      const [nextAssets, nextFolders] = await Promise.all([
        loadLibraryAssets(),
        listLibrarySourceFolders(),
      ]);
      setAssets(nextAssets);
      setSourceFolders({ ...await browserLibraryFolderNames(), ...nextFolders });
      setPhase("ready");
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase("error");
    }
  }

  useEffect(() => { void load(); }, [serviceGeneration]);

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const refreshAssets = async () => {
      if (disposed || refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const nextAssets = await loadLibraryAssets();
        if (disposed) return;
        setAssets((current) => {
          const unchanged =
            current.length === nextAssets.length &&
            current.every((asset, index) => {
              const candidate = nextAssets[index];
              return candidate &&
                candidate.id === asset.id &&
                candidate.name === asset.name &&
                candidate.size === asset.size &&
                candidate.modifiedAt === asset.modifiedAt &&
                candidate.category === asset.category &&
                candidate.origin === asset.origin;
            });
          return unchanged ? current : nextAssets;
        });
        setError(undefined);
        setPhase("ready");
      } catch {
        // Keep the last good Library contents and retry on the next interval.
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refreshAssets(), 2_000);
    document.addEventListener("visibilitychange", refreshAssets);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshAssets);
    };
  }, [serviceGeneration]);

  useEffect(() => {
    if (!sortMenu) return;
    const close = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node))
        setSortMenu(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenu(undefined);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [sortMenu]);

  async function chooseSourceFolder(category: LibrarySourceFolderCategory): Promise<void> {
    const select = window.putengGameDesktop?.selectLibraryDirectory;
    setActionError(undefined);
    try {
      if (!select) {
        const name = await chooseBrowserLibraryFolder(category);
        if (name) setSourceFolders((folders) => ({ ...folders, [category]: name }));
        await load();
        return;
      }
      const directory = await select();
      if (!directory) return;
      const folders = await setLibrarySourceFolder(category, directory);
      setSourceFolders(folders);
      await load();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setActionError(translateText(errorMessage(cause), language));
    }
  }

  async function clearSourceFolder(category: LibrarySourceFolderCategory): Promise<void> {
    setActionError(undefined);
    try {
      if (!window.putengGameDesktop?.selectLibraryDirectory) {
        await clearBrowserLibraryFolder(category);
        setSourceFolders((folders) => {
          const next = { ...folders };
          delete next[category];
          return next;
        });
        return;
      }
      setSourceFolders(await setLibrarySourceFolder(category, undefined));
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function runAssetAction(action: () => Promise<unknown>): Promise<boolean> {
    setActionError(undefined);
    try {
      await action();
      await load();
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }

  function beginRename(asset: LibraryAsset): void {
    setActionError(undefined);
    setSelectedAsset(undefined);
    setRenameTarget(asset);
  }

  async function save(asset: LibraryAsset): Promise<void> {
    if (await runAssetAction(() => saveLibraryAsset(asset.id))) setSelectedAsset(undefined);
  }

  async function remove(asset: LibraryAsset): Promise<void> {
    setActionError(undefined);
    try {
      const references = await listLibraryAssetReferences(asset.id);
      if (references.length) {
        setSelectedAsset(undefined);
        setDeleteTarget({ asset, references });
        return;
      }
      if (!window.confirm(t("library.confirmDelete", { name: fileName(asset.path) }))) return;
      if (await runAssetAction(() => deleteLibraryAsset(asset.id))) setSelectedAsset(undefined);
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function confirmForceDelete(): Promise<void> {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const deleted = await runAssetAction(() => forceDeleteLibraryAsset(deleteTarget.asset.id));
    setDeleting(false);
    if (deleted) {
      setDeleteTarget(undefined);
      setSelectedAsset(undefined);
    }
  }

  const visibleAssets = useMemo(
    () => sortLibraryAssets(filterLibraryAssets(assets, mediaFilter, query, filters), sort),
    [assets, mediaFilter, query, filters, sort],
  );
  const language = readLanguage();
  const openSortMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setSortMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 112)),
    });
  };
  const selectTabWithArrow = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = LIBRARY_TABS.findIndex(({ id }) => id === selectedTab);
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
    const next = LIBRARY_TABS[(currentIndex + direction + LIBRARY_TABS.length) % LIBRARY_TABS.length]!;
    setMediaFilter(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-library-tab="${next.id}"]`)?.focus();
  };
  const selectedTab = LIBRARY_TABS.some(({ id }) => id === mediaFilter) ? mediaFilter : "all";

  return (
    <SidebarPageLayout active="library" onNavigate={onNavigate}>
      <SidebarPageHeader title={t("library.title")}>
        <AssetToolbar mediaFilter={mediaFilter} query={query} onMediaFilterChange={setMediaFilter} onQueryChange={setQuery} mediaFilters={["audio", "model"]}>
          <LibraryCollectionFilters assets={assets} filters={filters} onChange={setFilters} />
          <LibrarySourceFoldersControl
            folders={sourceFolders}
            onChoose={(category) => void chooseSourceFolder(category)}
            onClear={(category) => void clearSourceFolder(category)}
          />
        </AssetToolbar>
      </SidebarPageHeader>
      <div className="library-assets-layout" onContextMenu={openSortMenu}>
        <nav className="library-category-tabs" role="tablist" aria-label={t("assets.categories")} aria-orientation="vertical" onKeyDown={selectTabWithArrow}>
          {LIBRARY_TABS.map(({ id, label, icon: Icon }) => (
            <button
              className="library-category-tab"
              id={`library-tab-${id}`}
              data-library-tab={id}
              type="button"
              role="tab"
              aria-selected={selectedTab === id}
              aria-controls="library-category-panel"
              key={id}
              onClick={() => setMediaFilter(id)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{t(`assets.filter.${id}`)}</span>
            </button>
          ))}
        </nav>
        <div className="library-content" id="library-category-panel" role="tabpanel" aria-labelledby={`library-tab-${selectedTab}`} tabIndex={0}>
        {actionError ? <p className="library-action-error" role="alert">{actionError}</p> : null}
        {phase === "loading" && assets.length === 0 ? <LibraryState><LoaderCircle className="spin" size={18} />{t("library.loading")}</LibraryState> : null}
        {phase === "error" ? <LibraryState error><X size={18} />{error}<button type="button" onClick={() => void load()}><RefreshCw size={14} />{t("common.retry")}</button></LibraryState> : null}
        {phase === "ready" && visibleAssets.length === 0 ? <LibraryState><ImageIcon size={18} />{assets.length ? t("library.noMatch") : t("library.none")}</LibraryState> : null}
        {visibleAssets.length ? <div className="library-grid library-page-grid">{visibleAssets.map((asset) => <WorkspaceAssetCard
        asset={asset}
        key={asset.id}
        title={fileName(asset.path)}
        onOpen={() => setSelectedAsset(asset)}
        onRename={() => beginRename(asset)}
        onDelete={() => void remove(asset)}
        onSaveToLibrary={asset.saved === false || asset.referenceOnly ? () => void save(asset) : undefined}
        />)}</div> : null}
        </div>
      </div>
      {sortMenu ? createPortal(
        <div
          ref={sortMenuRef}
          className="library-sort-menu"
          role="menu"
          aria-label={t("assets.sort")}
          style={{ left: sortMenu.x, top: sortMenu.y }}
        >
          <button role="menuitemradio" aria-checked={sort === "size"} type="button" onClick={() => { setSort("size"); setSortMenu(undefined); }}>
            {t("assets.sortFileSize")}
          </button>
          <button role="menuitemradio" aria-checked={sort === "modified"} type="button" onClick={() => { setSort("modified"); setSortMenu(undefined); }}>
            {t("assets.sortModified")}
          </button>
        </div>,
        document.body,
      ) : null}
      {selectedAsset ? <WorkspaceAssetDialog
        asset={selectedAsset}
        onClose={() => setSelectedAsset(undefined)}
        onRename={() => beginRename(selectedAsset)}
        onDelete={() => void remove(selectedAsset)}
        onSaveToLibrary={selectedAsset.saved === false || selectedAsset.referenceOnly ? () => void save(selectedAsset) : undefined}
      /> : null}
      {deleteTarget ? <div className="library-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(undefined); }}>
        <section className="library-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="library-delete-title" onKeyDown={(event) => { if (event.key === "Escape" && !deleting) setDeleteTarget(undefined); }}>
          <h2 id="library-delete-title">{t("library.deleteEverywhereTitle")}</h2>
          <p>{deleteTarget.references.length === 1
            ? t("library.usedByProject", { name: fileName(deleteTarget.asset.path) })
            : t("library.usedByProjects", { name: fileName(deleteTarget.asset.path), count: deleteTarget.references.length })}</p>
          <p className="library-delete-warning">{t("library.deleteWarning")}</p>
          <ul>{deleteTarget.references.map((reference) => <li key={reference.id}>{reference.name}</li>)}</ul>
          {actionError ? <p className="library-delete-error" role="alert">{actionError}</p> : null}
          <footer><button type="button" autoFocus disabled={deleting} onClick={() => setDeleteTarget(undefined)}>{t("common.cancel")}</button><button className="library-action-delete" type="button" disabled={deleting} onClick={() => void confirmForceDelete()}>{deleting ? t("library.deletingEllipsis") : t("library.deleteEverywhere")}</button></footer>
        </section>
      </div> : null}
      {renameTarget ? <ProjectRenameDialog title={t("library.rename")} name={fileStem(renameTarget.path)} returnFocus={null} onClose={() => setRenameTarget(undefined)} onConfirm={(input) => {
        const asset = renameTarget;
        setRenameTarget(undefined);
        const name = input.trim();
        if (name && name !== fileStem(asset.path)) void runAssetAction(() => renameLibraryAsset(asset.id, name));
      }} /> : null}
    </SidebarPageLayout>
  );
}

export { filterLibraryAssets } from "./library-assets.js";

function LibraryState({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`library-state${error ? " library-state-error" : ""}`} role={error ? "alert" : undefined}>{children}</div>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
