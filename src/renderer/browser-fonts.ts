import { extractFontFamilies } from "../shared/playable-fonts.js";

interface BrowserFileHandle {
  kind?: string;
  name: string;
  getFile(): Promise<File>;
}

interface BrowserDirectoryHandle {
  kind?: string;
  name: string;
  values(): AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
  queryPermission?(options: { mode: "read" }): Promise<PermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: {
    mode: "read";
  }) => Promise<BrowserDirectoryHandle>;
  queryLocalFonts?: () => Promise<Array<{ family: string }>>;
}

const DATABASE = "putenggame-font-directories";
const STORE = "directories";
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);
const MAX_DIRECTORY_DEPTH = 8;
const MAX_FONT_FILES = 20_000;
const MAX_FONT_FILE_SIZE = 64 * 1024 * 1024;

export async function scanBrowserSystemFonts(): Promise<string[]> {
  const query = (window as DirectoryPickerWindow).queryLocalFonts;
  if (!query) return [];
  const fonts = await query.call(window);
  return sortFamilies(fonts.map(({ family }) => family));
}

export async function chooseBrowserFontDirectory(): Promise<
  { name: string; families: string[] } | undefined
> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (picker) {
    const handle = await picker.call(window, { mode: "read" });
    await storeDirectory(handle);
    return { name: handle.name, families: await scanDirectory(handle) };
  }
  return chooseBrowserFontFiles();
}

export async function rememberedBrowserFontDirectory(): Promise<
  { name: string; families: string[] } | undefined
> {
  if (typeof indexedDB === "undefined") return undefined;
  const handle = await readDirectory();
  if (!handle) return undefined;
  try {
    if ((await handle.queryPermission?.({ mode: "read" })) !== "granted")
      return { name: handle.name, families: [] };
    return { name: handle.name, families: await scanDirectory(handle) };
  } catch {
    return { name: handle.name, families: [] };
  }
}

async function scanDirectory(
  root: BrowserDirectoryHandle,
): Promise<string[]> {
  const pending = [{ handle: root, depth: 0 }];
  const families = new Set<string>();
  let fileCount = 0;
  while (pending.length && fileCount < MAX_FONT_FILES) {
    const current = pending.pop()!;
    let entries: (BrowserDirectoryHandle | BrowserFileHandle)[];
    try {
      entries = [];
      for await (const entry of current.handle.values()) entries.push(entry);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.kind === "directory") {
        if (current.depth < MAX_DIRECTORY_DEPTH)
          pending.push({
            handle: entry as BrowserDirectoryHandle,
            depth: current.depth + 1,
          });
        continue;
      }
      const extension = extensionOf(entry.name);
      if (!FONT_EXTENSIONS.has(extension)) continue;
      fileCount += 1;
      try {
        const file = await (entry as BrowserFileHandle).getFile();
        if (file.size > MAX_FONT_FILE_SIZE) continue;
        for (const family of extractFontFamilies(
          new Uint8Array(await file.arrayBuffer()),
        ))
          families.add(family);
      } catch {
        // Skip unreadable or malformed font files.
      }
    }
  }
  return sortFamilies([...families]);
}

function chooseBrowserFontFiles(): Promise<
  { name: string; families: string[] } | undefined
> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".ttf,.otf,.ttc";
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      const families = new Set<string>();
      void Promise.all(
        files
          .filter((file) => FONT_EXTENSIONS.has(extensionOf(file.name)))
          .map(async (file) => {
            if (file.size > MAX_FONT_FILE_SIZE) return;
            for (const family of extractFontFamilies(
              new Uint8Array(await file.arrayBuffer()),
            ))
              families.add(family);
          }),
      ).then(() => {
        const name =
          files[0]?.webkitRelativePath.split("/")[0] ?? "Selected folder";
        resolve({ name, families: sortFamilies([...families]) });
      });
      input.remove();
    };
    input.oncancel = () => {
      input.remove();
      resolve(undefined);
    };
    input.click();
  });
}

function storeDirectory(handle: BrowserDirectoryHandle): Promise<void> {
  return withStore("readwrite", (store) => store.put(handle, "selected")).then(
    () => undefined,
  );
}

function readDirectory(): Promise<BrowserDirectoryHandle | undefined> {
  return withStore("readonly", (store) =>
    store.get("selected") as IDBRequest<BrowserDirectoryHandle | undefined>,
  );
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open font folder storage"));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(STORE, mode);
      const result = operation(transaction.objectStore(STORE));
      result.onsuccess = () => resolve(result.result);
      result.onerror = () =>
        reject(result.error ?? new Error("Could not read font folder storage"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Font folder storage failed"));
      transaction.oncomplete = () => database.close();
    };
  });
}

function sortFamilies(families: readonly string[]): string[] {
  return [...new Set(families.map((family) => family.trim()).filter(Boolean))].sort(
    (left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}
