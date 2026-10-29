import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const GRADLE_VERSION = "8.2.1";
const ANDROID_PLUGIN_VERSION = "8.2.1";
const COMPILE_SDK = 34;
const BUILD_TOOLS_VERSION = "36.0.0";

export async function buildPicoStoryApk(
  siteDirectory: string,
  projectName: string,
  projectId: string,
): Promise<Buffer> {
  const sdk = await resolveAndroidSdk();
  const sdkPlatform = path.join(sdk, "platforms", `android-${COMPILE_SDK}`);
  const sdkBuildTools = path.join(sdk, "build-tools", BUILD_TOOLS_VERSION);
  const gradle = await resolveGradle();
  try {
    await readFile(path.join(sdkPlatform, "android.jar"));
  } catch {
    throw new Error(
      `Android SDK Platform ${COMPILE_SDK} was not found at "${sdkPlatform}". Install Android SDK Platform ${COMPILE_SDK} and Build Tools ${BUILD_TOOLS_VERSION}, or set ANDROID_HOME.`,
    );
  }
  try {
    await readFile(path.join(sdkBuildTools, process.platform === "win32" ? "aapt2.exe" : "aapt2"));
  } catch {
    throw new Error(
      `Android SDK Build Tools ${BUILD_TOOLS_VERSION} were not found at "${sdkBuildTools}". Install Build Tools ${BUILD_TOOLS_VERSION}, or set ANDROID_HOME.`,
    );
  }

  const output = await mkdtemp(path.join(tmpdir(), "puteng-pico-apk-"));
  try {
    await writeAndroidProject(output, projectName, projectId, sdk, siteDirectory);
    await runGradle(gradle, output, sdk);
    return await readFile(path.join(output, "app", "build", "outputs", "apk", "debug", "app-debug.apk"));
  } catch (cause) {
    throw new Error(
      `Could not build the PICO Android package: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

export async function picoSiteVersion(siteDirectory: string): Promise<string> {
  const hash = createHash("sha256");
  const addDirectory = async (directory: string, relativeDirectory = ""): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await addDirectory(absolutePath, relativePath);
      } else if (entry.isFile()) {
        hash.update(relativePath);
        hash.update("\0");
        hash.update(await readFile(absolutePath));
        hash.update("\0");
      }
    }
  };
  await addDirectory(siteDirectory);
  return hash.digest("hex");
}

async function resolveGradle(): Promise<string> {
  const bundled = path.join(
    process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
    "puteng-game",
    `gradle-${GRADLE_VERSION}`,
    "bin",
    process.platform === "win32" ? "gradle.bat" : "gradle",
  );
  try {
    await readFile(bundled);
    return bundled;
  } catch {
    if (process.env.GRADLE_HOME) {
      return path.join(process.env.GRADLE_HOME, "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
    }
    const cache = path.join(homedir(), ".gradle", "wrapper", "dists", `gradle-${GRADLE_VERSION}-bin`);
    try {
      for (const hash of await readdir(cache)) {
        const candidate = path.join(cache, hash, `gradle-${GRADLE_VERSION}`, "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
        try {
          await readFile(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
    } catch {
      // Fall back to Gradle on PATH.
    }
    return process.platform === "win32" ? "gradle.bat" : "gradle";
  }
}

async function resolveAndroidSdk(): Promise<string> {
  const configured = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (configured) return configured;
  const candidates = [path.join(homedir(), "AppData", "Local", "Android", "Sdk")];
  if (process.platform === "win32") {
    const unityEditors = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Unity", "Hub", "Editor");
    try {
      for (const editor of await readdir(unityEditors)) {
        candidates.push(path.join(unityEditors, editor, "Editor", "Data", "PlaybackEngines", "AndroidPlayer", "SDK"));
      }
    } catch {
      // Unity is optional.
    }
  }
  if (process.platform !== "win32") {
    candidates.push(
      process.platform === "darwin"
        ? path.join(homedir(), "Library", "Android", "sdk")
        : path.join(homedir(), "Android", "Sdk"),
    );
  }
  for (const candidate of candidates) {
    try {
      await readFile(path.join(candidate, "platforms", `android-${COMPILE_SDK}`, "android.jar"));
      await readFile(path.join(candidate, "build-tools", BUILD_TOOLS_VERSION, process.platform === "win32" ? "aapt2.exe" : "aapt2"));
      return candidate;
    } catch {
      continue;
    }
  }
  return candidates[0]!;
}

async function writeAndroidProject(
  root: string,
  name: string,
  projectId: string,
  sdk: string,
  siteDirectory: string,
): Promise<void> {
  const suffix = projectId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "story";
  const packageName = `com.putenggame.story.p${suffix}`;
  const app = path.join(root, "app");
  const java = path.join(app, "src", "main", "java", ...packageName.split("."));
  const resources = path.join(app, "src", "main", "res", "values");
  const chineseResources = path.join(app, "src", "main", "res", "values-zh-rCN");
  const assets = path.join(app, "src", "main", "assets", "site");
  await Promise.all([
    mkdir(java, { recursive: true }),
    mkdir(resources, { recursive: true }),
    mkdir(chineseResources, { recursive: true }),
    mkdir(assets, { recursive: true }),
  ]);
  await cp(siteDirectory, assets, { recursive: true });
  const siteVersion = await picoSiteVersion(siteDirectory);
  await Promise.all([
    writeFile(path.join(root, "settings.gradle"), settingsGradle),
    writeFile(path.join(root, "build.gradle"), rootGradle),
    writeFile(path.join(root, "gradle.properties"), gradleProperties),
    writeFile(path.join(root, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`),
    writeFile(path.join(app, "build.gradle"), appGradle(packageName)),
    writeFile(path.join(app, "src", "main", "AndroidManifest.xml"), manifest(packageName)),
    writeFile(path.join(resources, "strings.xml"), strings(name, false, siteVersion)),
    writeFile(path.join(chineseResources, "strings.xml"), strings(name, true, siteVersion)),
    writeFile(path.join(java, "MainActivity.java"), mainActivity(packageName)),
    writeFile(path.join(java, "SiteService.java"), siteService(packageName)),
    writeFile(path.join(java, "EmbeddedSiteServer.java"), embeddedSiteServer(packageName)),
  ]);
}

async function runGradle(executable: string, cwd: string, sdk: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ["--no-daemon", "assembleDebug"], {
      cwd,
      env: {
        ...process.env,
        ANDROID_HOME: sdk,
        ANDROID_SDK_ROOT: sdk,
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-6000);
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(stderr.trim() || `Gradle exited with status ${code}.`)));
  });
}

const settingsGradle = `
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "PutengStory"
include(":app")
`.trimStart();

const rootGradle = `
plugins {
    id 'com.android.application' version '${ANDROID_PLUGIN_VERSION}' apply false
}
`;

const gradleProperties = `
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
org.gradle.parallel=true
android.useAndroidX=true
`;

function manifest(packageName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <application android:allowBackup="false" android:label="@string/app_name" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:usesCleartextTraffic="true">
        <activity android:name="${packageName}.MainActivity" android:configChanges="orientation|screenSize|keyboardHidden" android:exported="true" android:screenOrientation="landscape">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <service android:name="${packageName}.SiteService" android:exported="false" android:foregroundServiceType="dataSync" />
    </application>
</manifest>
`;
}

function strings(name: string, chinese: boolean, siteVersion: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(name)}</string>
    <string name="launcher_title">${chinese ? "影游 WebXR" : "Story WebXR"}</string>
    <string name="preparing">${chinese ? "正在准备本地作品…" : "Preparing the local story..."}</string>
    <string name="ready">${chinese ? "作品已就绪。启动后可返回此应用重新打开。" : "Story ready. Return to this app to reopen it."}</string>
    <string name="open_browser">${chinese ? "在 PICO 浏览器中打开" : "Open in PICO Browser"}</string>
    <string name="startup_timeout">${chinese ? "启动超时，请点击按钮重试。" : "Startup timed out. Tap the button to retry."}</string>
    <string name="browser_missing">${chinese ? "找不到可用的浏览器" : "No browser is available"}</string>
    <string name="service_running">${chinese ? "作品正在本机运行" : "Story is running on this device"}</string>
    <string name="site_version">${siteVersion}</string>
</resources>
`;
}

function mainActivity(packageName: string): string {
  return `package ${packageName};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.putenggame.story.R;

public final class MainActivity extends Activity {
    private boolean opening;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(5894 | 1024 | 512);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(17);
        layout.setPadding(40, 40, 40, 40);
        TextView title = new TextView(this);
        title.setText(R.string.launcher_title);
        title.setTextSize(22);
        layout.addView(title);
        TextView status = new TextView(this);
        status.setText(R.string.preparing);
        status.setTextSize(16);
        layout.addView(status);
        Button open = new Button(this);
        open.setText(R.string.open_browser);
        open.setEnabled(false);
        open.setOnClickListener(view -> openStory());
        layout.addView(open);
        setContentView(layout);
        Intent service = new Intent(this, SiteService.class);
        startForegroundService(service);
        new Thread(() -> {
            long until = System.currentTimeMillis() + 30000;
            while (System.currentTimeMillis() < until && !isFinishing()) {
                try {
                    int port = SiteService.port;
                    if (port < 0) {
                        Thread.sleep(250);
                        continue;
                    }
                    java.net.HttpURLConnection connection = (java.net.HttpURLConnection)
                        new java.net.URL("http://127.0.0.1:" + port + "/health").openConnection();
                    connection.setConnectTimeout(500);
                    connection.setReadTimeout(500);
                    if (connection.getResponseCode() == 200) {
                        runOnUiThread(() -> {
                            status.setText(R.string.ready);
                            open.setEnabled(true);
                            openStory();
                        });
                        return;
                    }
                } catch (Exception ignored) { }
                try { Thread.sleep(250); } catch (InterruptedException ignored) { return; }
            }
            runOnUiThread(() -> {
                status.setText(R.string.startup_timeout);
                open.setEnabled(true);
            });
        }).start();
    }

    private void openStory() {
        if (opening) return;
        if (SiteService.port < 0) {
            android.widget.Toast.makeText(this, R.string.preparing, android.widget.Toast.LENGTH_SHORT).show();
            return;
        }
        opening = true;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:" + SiteService.port + "/")));
        } catch (Exception error) {
            opening = false;
            android.widget.Toast.makeText(this, R.string.browser_missing, android.widget.Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        opening = false;
    }
}
`;
}

function siteService(packageName: string): string {
  return `package ${packageName};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import com.putenggame.story.R;

public final class SiteService extends Service {
    static volatile int port = -1;
    private EmbeddedSiteServer server;

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel("story", "Story playback", NotificationManager.IMPORTANCE_LOW));
            Notification notification = new Notification.Builder(this, "story")
                .setContentTitle(getApplicationInfo().loadLabel(getPackageManager()))
                .setContentText(getString(R.string.service_running))
                .setSmallIcon(android.R.drawable.ic_media_play)
                .build();
            startForeground(1, notification);
        } else {
            startForeground(1, new Notification.Builder(this)
                .setContentTitle(getApplicationInfo().loadLabel(getPackageManager()))
                .setSmallIcon(android.R.drawable.ic_media_play).build());
        }
        new Thread(() -> {
            try {
                server = new EmbeddedSiteServer(getAssets(), getFilesDir(), getString(R.string.site_version));
                server.start();
                port = server.port();
            } catch (Exception error) {
                android.util.Log.e("PutengStory", "Could not start the local story server", error);
                stopSelf();
            }
        }).start();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public void onDestroy() {
        if (server != null) server.close();
        port = -1;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
`;
}

function embeddedSiteServer(packageName: string): string {
  return `package ${packageName};

import android.content.res.AssetManager;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import com.putenggame.story.R;

final class EmbeddedSiteServer {
    private final AssetManager assets;
    private final File root;
    private final String siteVersion;
    private volatile boolean running;
    private ServerSocket socket;
    private Thread acceptThread;

    EmbeddedSiteServer(AssetManager assets, File files, String siteVersion) {
        this.assets = assets;
        this.root = new File(files, "story-site");
        this.siteVersion = siteVersion;
    }

    void start() throws Exception {
        File marker = new File(root, ".ready");
        String installedVersion = marker.isFile() ? new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8) : "";
        if (!siteVersion.equals(installedVersion)) {
            deleteRecursively(root);
            copyAssets("site", root);
            Files.write(marker.toPath(), siteVersion.getBytes(StandardCharsets.UTF_8));
        }
        socket = new ServerSocket(0, 32, java.net.InetAddress.getByName("127.0.0.1"));
        running = true;
        acceptThread = new Thread(() -> {
            while (running) {
                try {
                    Socket client = socket.accept();
                    new Thread(() -> serve(client)).start();
                } catch (Exception error) {
                    if (running) android.util.Log.w("PutengStory", "Local request failed", error);
                }
            }
        }, "puteng-story-http");
        acceptThread.start();
    }

    int port() { return socket.getLocalPort(); }

    private void copyAssets(String source, File destination) throws Exception {
        destination.mkdirs();
        for (String child : assets.list(source)) {
            String relative = source + "/" + child;
            String[] descendants = assets.list(relative);
            File output = new File(destination, child);
            if (descendants != null && descendants.length > 0) {
                copyAssets(relative, output);
            } else {
                output.getParentFile().mkdirs();
                try (InputStream input = assets.open(relative)) {
                    Files.copy(input, output.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }

    private void serve(Socket client) {
        try (Socket connection = client;
             BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
             BufferedOutputStream output = new BufferedOutputStream(connection.getOutputStream())) {
            String request = readLine(input);
            if (request == null) return;
            String[] parts = request.split(" ");
            boolean head = parts.length > 0 && "HEAD".equals(parts[0]);
            if (parts.length < 2 || (!"GET".equals(parts[0]) && !head)) {
                respond(output, 405, "Method Not Allowed", "text/plain", new byte[0], null, true);
                return;
            }
            String rawPath = parts[1].split("\\\\?", 2)[0];
            String decoded = URLDecoder.decode(rawPath, StandardCharsets.UTF_8.name()).replace('\\\\', '/');
            if (decoded.equals("/health")) {
                respond(output, 200, "OK", "text/plain", "ready".getBytes(StandardCharsets.UTF_8), null, head);
                return;
            }
            while (true) {
                String header = readLine(input);
                if (header == null || header.isEmpty()) break;
                if (header.regionMatches(true, 0, "Range:", 0, 6)) {
                    String range = header.substring(6).trim();
                    serveFile(output, decoded, head, range);
                    return;
                }
            }
            serveFile(output, decoded, head, null);
        } catch (Exception error) {
            android.util.Log.w("PutengStory", "Unable to serve local file", error);
        }
    }

    private void serveFile(OutputStream output, String requestPath, boolean head, String range) throws Exception {
        if (requestPath.equals("/")) requestPath = "/index.html";
        Path base = root.toPath().toRealPath();
        Path file = base.resolve(requestPath.substring(1)).normalize();
        if (!file.startsWith(base) || !Files.isRegularFile(file)) {
            respond(output, 404, "Not Found", "text/plain", new byte[0], null, head);
            return;
        }
        long size = Files.size(file);
        long start = 0;
        long end = size - 1;
        int code = 200;
        if (range != null && range.startsWith("bytes=")) {
            String[] bounds = range.substring(6).split("-", 2);
            if (bounds.length != 2 || range.contains(",")) {
                respond(output, 416, "Range Not Satisfiable", "text/plain", new byte[0], "Content-Range: bytes */" + size + "\\r\\n", head);
                return;
            }
            if (bounds[0].isEmpty()) start = Math.max(0, size - Long.parseLong(bounds[1]));
            else start = Long.parseLong(bounds[0]);
            if (!bounds[1].isEmpty()) end = Math.min(size - 1, Long.parseLong(bounds[1]));
            if (start > end || start >= size) {
                respond(output, 416, "Range Not Satisfiable", "text/plain", new byte[0], "Content-Range: bytes */" + size + "\\r\\n", head);
                return;
            }
            code = 206;
        }
        long length = size == 0 ? 0 : end - start + 1;
        String mime = mime(file.getFileName().toString());
        output.write(("HTTP/1.1 " + code + (code == 206 ? " Partial Content" : " OK") + "\\r\\n"
            + "Content-Type: " + mime + "\\r\\n"
            + "Content-Length: " + length + "\\r\\n"
            + "Accept-Ranges: bytes\\r\\n"
            + "Access-Control-Allow-Origin: *\\r\\n"
            + (code == 206 ? "Content-Range: bytes " + start + "-" + end + "/" + size + "\\r\\n" : "")
            + "Connection: close\\r\\n\\r\\n").getBytes(StandardCharsets.US_ASCII));
        if (!head && length > 0) {
            try (FileInputStream stream = new FileInputStream(file.toFile())) {
                stream.getChannel().position(start);
                byte[] buffer = new byte[65536];
                long remaining = length;
                while (remaining > 0) {
                    int count = stream.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                    if (count < 0) break;
                    output.write(buffer, 0, count);
                    remaining -= count;
                }
            }
        }
        output.flush();
    }

    private void respond(OutputStream output, int code, String label, String mime, byte[] body, String extra, boolean head) throws Exception {
        output.write(("HTTP/1.1 " + code + " " + label + "\\r\\nContent-Type: " + mime
            + "\\r\\nContent-Length: " + body.length + "\\r\\n"
            + (extra == null ? "" : extra) + "Connection: close\\r\\n\\r\\n").getBytes(StandardCharsets.US_ASCII));
        if (!head) output.write(body);
        output.flush();
    }

    private String readLine(InputStream input) throws Exception {
        StringBuilder line = new StringBuilder();
        int previous = -1;
        int current;
        while ((current = input.read()) != -1) {
            if (previous == '\\r' && current == '\\n') {
                line.setLength(Math.max(0, line.length() - 1));
                return line.toString();
            }
            line.append((char) current);
            previous = current;
            if (line.length() > 8192) return null;
        }
        return null;
    }

    private String mime(String name) {
        String value = name.toLowerCase(Locale.ROOT);
        if (value.endsWith(".html")) return "text/html; charset=utf-8";
        if (value.endsWith(".js") || value.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (value.endsWith(".css")) return "text/css; charset=utf-8";
        if (value.endsWith(".json") || value.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (value.endsWith(".svg")) return "image/svg+xml";
        if (value.endsWith(".png")) return "image/png";
        if (value.endsWith(".webp")) return "image/webp";
        if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
        if (value.endsWith(".mp4") || value.endsWith(".m4v")) return "video/mp4";
        if (value.endsWith(".webm")) return "video/webm";
        if (value.endsWith(".mov")) return "video/quicktime";
        if (value.endsWith(".mp3")) return "audio/mpeg";
        if (value.endsWith(".wav")) return "audio/wav";
        if (value.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    void close() {
        running = false;
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
    }

    private void deleteRecursively(File file) throws Exception {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        Files.deleteIfExists(file.toPath());
    }
}
`;
}

function appGradle(packageName: string): string {
  return `
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.putenggame.story'
    compileSdk ${COMPILE_SDK}
    buildToolsVersion '${BUILD_TOOLS_VERSION}'

    defaultConfig {
        applicationId '${packageName}'
        minSdk 29
        targetSdk 32
        versionCode 1
        versionName '1.0'
    }
}
`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  })[character]!);
}
