import type { LibrarySourceFolderCategory, LibrarySourceFolders, LibraryUploadMediaType } from "../shared/contracts.js";
import { uploadLibraryAsset } from "./api.js";

interface BrowserDirectoryHandle {
  name: string;
  values(): AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
  getFile?(): Promise<File>;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
}

interface BrowserFileHandle extends BrowserDirectoryHandle {
  getFile(): Promise<File>;
}

interface StoredFolder {
  category: LibrarySourceFolderCategory;
  handle: BrowserDirectoryHandle;
  syncedFiles?: Record<string, { size: number; lastModified: number }>;
}

export function browserLibrarySyncAction(
  file: Pick<File, "size" | "lastModified">,
  previous?: { size: number; lastModified: number },
): "unchanged" | "upload" {
  if (
    previous?.size === file.size &&
    previous.lastModified === file.lastModified
  ) return "unchanged";
  return "upload";
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: { mode: "read" }) => Promise<BrowserDirectoryHandle>;
}

const DATABASE = "putenggame-library-folders";
const STORE = "folders";

const MEDIA_TYPES: Record<string, LibraryUploadMediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export async function chooseBrowserLibraryFolder(
  category: LibrarySourceFolderCategory,
): Promise<string | undefined> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Persistent folder access is not supported by this browser");
  const handle = await picker.call(window, { mode: "read" });
  await writeFolder({ category, handle });
  return handle.name;
}

export async function clearBrowserLibraryFolder(
  category: LibrarySourceFolderCategory,
): Promise<void> {
  const db = await openDatabase();
  await transaction(db, "readwrite", (store) => store.delete(category));
}

export async function browserLibraryFolderNames(): Promise<LibrarySourceFolders> {
  if (typeof indexedDB === "undefined") return {};
  const names: LibrarySourceFolders = {};
  for (const folder of await readFolders()) names[folder.category] = folder.handle.name;
  return names;
}

export async function syncRememberedBrowserLibraryFolders(
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  for (const folder of await readFolders()) {
    let permission: PermissionState;
    try {
      permission = await folder.handle.queryPermission({ mode: "read" });
    } catch {
      // Keep the saved handle available so the user can select the folder again.
      continue;
    }
    if (permission === "granted") await syncFolder(folder);
  }
}

async function syncFolder(folder: StoredFolder): Promise<void> {
  const { category, handle } = folder;
  const syncedFiles = { ...folder.syncedFiles };
  const seenFiles = new Set<string>();
  await visit(handle, "", async (file, relativePath) => {
    const extension = extensionOf(file.name);
    const mediaType = MEDIA_TYPES[extension];
    if (!mediaType || (category === "video") !== mediaType.startsWith("video/")) return;
    seenFiles.add(relativePath);
    const previous = syncedFiles[relativePath];
    const action = browserLibrarySyncAction(file, previous);
    if (action === "unchanged") return;
    await uploadLibraryAsset(file, mediaType, undefined, undefined, {
      category,
      modifiedAt: new Date(file.lastModified).toISOString(),
      sourceKey: `browser-folder:${category}:${relativePath}`,
    });
    syncedFiles[relativePath] = {
      size: file.size,
      lastModified: file.lastModified,
    };
  });
  await writeFolder({
    ...folder,
    syncedFiles: Object.fromEntries(
      Object.entries(syncedFiles).filter(([relativePath]) =>
        seenFiles.has(relativePath),
      ),
    ),
  });
}

async function visit(
  directory: BrowserDirectoryHandle,
  parentPath: string,
  onFile: (file: File, relativePath: string) => Promise<void>,
): Promise<void> {
  for await (const entry of directory.values()) {
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (typeof entry.getFile === "function") {
      const file = await entry.getFile();
      await onFile(file, relativePath);
    } else {
      await visit(entry, relativePath, onFile);
    }
  }
}

async function writeFolder(folder: StoredFolder): Promise<void> {
  const db = await openDatabase();
  await transaction(db, "readwrite", (store) => store.put(folder));
}

async function readFolders(): Promise<StoredFolder[]> {
  const db = await openDatabase();
  return transaction(db, "readonly", (store) => store.getAll());
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "category" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser folder storage"));
  });
}

function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser folder storage failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Browser folder storage failed"));
  });
}

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}
