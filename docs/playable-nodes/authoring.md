# Authoring

This document describes what creating a Playable Nodes project feels like. The
Runtime contract is described separately; this document is about the editor.

It uses the editor's words: a node is a **Scene**, a Signal with its edge is
an **Exit**, the Entry Node is the **Start**, and a Preset is a
**Template**, and Project State is the **Variables**
([Variables](#variables)). The engine
term follows in parentheses where it matters; code, schemas, and tools keep
the engine terms ([vocabulary](README.md#vocabulary)).

## Principle

> The author describes. The Agent builds. The author sees it live.

Every authoring surface is designed around that loop. Editing code by hand is
possible, but it is an escape hatch that most authors never open, and no
normal task should require it.

The editor also reuses the parts of the current Interactive Story editor that
already work well. The redesign removes node-type-specific forms; it does not
replace the whole interface.

## Workspace

The workspace keeps the current Interactive Story layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: Project ▾ · Back           Playtest · chat · Publish │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│  Chat with    │   Story (the flow canvas)                    │
│  the Agent    │     or                                       │
│  (left/right, │   Scene Workbench (opened from a Scene)      │
│  collapsible) │                                              │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

- The chat panel keeps its existing placement preference and collapse
  behavior.
- The main area shows either the **Story** tab, the flow canvas, or the
  Workbench of one Scene, with a breadcrumb (`Story › Case archive`) to
  return. The tab is named for the whole story it shows, not for one Scene.
- The **Project ▾** menu holds **Screen size**, **Variables**, and **Export**.
  The **Back** arrow returns to the page used to open the project, retaining
  project-list filters, search, and sorting. Opening a project link directly
  uses **Projects** as the return destination. **Playtest** opens the real
  Runtime; the chat toggle and **Publish** follow it.
- **Export game** downloads a build that players can play in a browser. The
  playable web ZIP includes `start-game.bat` for Windows: double-click it to
  start a local server and open the game in the default browser.
  **Export project** downloads the editable project: its source files without
  `node_modules/` or hidden folders such as `.data/` and `.ohmygame/`, with
  each Library asset copied to `assets/library/` and `graph.json` pointing at
  the copy. Copied filenames avoid collisions between letter case variants
  and canonically equivalent Unicode spellings, so extracting on Windows
  or macOS preserves distinct Library assets.
  Choosing the unzipped folder in **New project** opens the same
  project on another computer.
- The export options also include a PICO WebXR/PWA ZIP. Host the extracted
  website over HTTPS, then open it in PICO Browser. Install it as an app if the
  headset offers that option; otherwise launch it in the browser. It is not an
  Android APK; videos are loaded on demand and are not cached for offline playback.
- **PICO install package (APK)** embeds the playable website and its media in a
  debug-signed Android package. Install it on the headset and launch it to start
  PICO Browser against a loopback server inside the app; media is served on
  demand with byte-range support. This requires an Android SDK Platform 34,
  Build Tools 36.0.0, Gradle 8.2.1, and Java 17 or newer to export. It is a
  PICO Browser/WebXR launcher, not a native Unity/OpenXR application. Browser
  availability and WebXR playback still need to be verified on the target headset.
  In VR, controller or gaze rays hover interactive elements; selecting an
  element activates its connected Exit.

### Source files

The **Code** tab is always available beside **Story** and **Design**. It shows
the project's files and their contents. Scene cards use readable names;
the Variables panel shows starting values in author words and includes the
raw JSON value in each value's tooltip.

## Flow canvas

The canvas answers one question: how can the player move through the
project?

Each Scene card shows:

- a live thumbnail of the Scene, rendered by the Runtime, so the canvas looks
  like the game rather than like a diagram;
- the Scene title;
- one output port per Exit, labeled with the Exit name (Signal label) and,
  when the Exit depends on progress, its condition in small text
  ([Variables](#variables));
- a **Start** badge on the Scene the player starts in (**Set as Start**
  moves it);
- an **Ending** badge on a Scene the [Story map](#story-map) counts as an
  ending, or **Off map** on one it leaves out;
- an issue marker when the Scene fails to build, emits an undeclared Signal,
  or has an Exit that goes nowhere.

The canvas shows only Scenes. A top bar shown on several Scenes adds its
Exits to each of those Scene cards; there is no separate card for it.

A connection links an Exit port to a target Scene. Exits with **Allow Back**
(`push` edges) are drawn differently from ordinary ones (`replace`), with a
**↩ Back** label.

Connections always leave an Exit on the right of its Scene and enter the
target on the left. An Exit marked **Navigation** is a way around the game
rather than a step in the story, such as a **Home** Exit on many Scenes. It
has no line; its Exit row names the target instead, such as `→ Platform`.
It only changes how the canvas draws the connection, never where the Exit
goes.

Clicking a line, or the target an Exit row names, selects the connection;
Delete removes it, and dragging from the Exit again points it elsewhere.
There is no connection panel. **Allow Back** and **Navigation** are the
Agent's to set: the author asks for them in their own words ("let Archive
open the case archive with Back allowed"), and the Agent marks Exits that
come from a shared component, such as Home, as Navigation.

The canvas keeps the current editor's mature interactions: Add Scene menu,
context menu, selection, alignment guides, copy and paste, zoom controls,
and fit view.

Connecting can happen two ways, and both produce the same edges:

- drag from an Exit port to a Scene;
- ask the Agent, for example "connect Start to the lobby, and let Archive
  open the case archive with Back allowed".

### Story tree panel

On the canvas, the Story Tree panel stays beside the Agent chat, with the
**Chapters** and **Story Tree** panes visible side by side. The Chapters pane
owns chapter, episode, and scene organization. Import a screenplay as
`.docx` or `.txt`; the editor groups recognizable chapter, episode, and numbered
scene headings, labels dialogue, operations, choices, and state changes, and
proposes links from screenplay evidence. A unique match between a choice or
outcome and a branch scene is confirmed automatically; a clear, non-branching
continuation may also be confirmed. Ambiguous destinations, missing outcomes,
and routes inferred only from numbering or adjacency stay marked **Suggested**
for review. Scene headings and screenplay lines are retained as source text;
the importer may add structure and labels but does not rewrite or reorder the
screenplay. AI analysis adds scene metadata and route suggestions without
replacing the original story beats.

The **Story Tree** pane is a read-only view of the story flow: chapter, episode,
and scene order, scene metadata, and branch destinations. It does not repeat
the content and structure editors from the Chapters pane. Choose **Analyze
with AI** to analyze scenes whose screenplay inputs changed; inspect the
preview and apply it to update only changed scene metadata and routes. The
analysis keeps screenplay text, chapter, episode, and scene order, and leaves
unchanged sections and manually confirmed routes intact. Importing a revised
screenplay compares it with the saved tree: changed source is shown for review when that section
was edited by hand, and removed sections are marked rather than deleted
automatically. Fixed-plot lines are grouped in the outline and can be expanded
for the full source detail; AI analysis never rewrites or condenses the source
beats.

Choose **Generate nodes** to review the recommended Scene preset for each
missing Scene, adjust any recommendation, and add the missing nodes without
replacing existing canvas Scenes. Confirmed routes are added as Exits on their
source Scenes, including newly generated ones. If an existing button already
emits the matching Signal, that button is reused; otherwise a button preset is
added to the source Scene, with multiple new buttons spaced along the lower
part of the screen. The target Scene only receives the graph connection; no
extra entrance button is added there. During **Update nodes**, only changed
tree-managed titles, story beats, operation buttons, and routes are updated.
Unchanged Scene source, unrelated manual markup, assets, custom Exits, and
canvas positions are preserved. Replacing a tree-managed beat or operation
button that was manually edited requires confirmation. A generated operation
button maps recognized long-press, directional swipe, repeated-click,
double-click, quick-click, and timed-QTE instructions to the corresponding
existing button behavior. Variable/state mutations, multi-step gestures, and
other instructions that do not map to an existing editor behavior remain
story text and need to be configured in the Scene editor. The editor reports when the
tree is still loading, contains no Scenes, or has no missing nodes. Deleting a
linked canvas Scene makes it eligible for generation again; the editor flushes
pending canvas changes before syncing and refreshes the canvas when syncing
succeeds. After
generation, the canvas fits all Scenes into view without moving or rearranging
them. Episodes containing player operations, choices, or branching exits show
an **Interactive** marker. Selecting a linked Scene in the tree switches to
the canvas, selects that Scene, and centers and zooms in on it without opening
its Workbench. The
preview also shows while presets are loading. Ending sections recommend the
Ending preset, explicit
choice beats recommend Choice, and other sections recommend Blank. **Update
nodes** uses the same recommendations when it creates newly added Scenes, then
synchronizes changed titles and tree-managed connections. Changes to linked
Scenes are previewed and require confirmation before they are applied. Neither
operation replaces existing Scene source files or assets, and existing canvas
positions are preserved. The tree can be exported as PDF, Word, or Markdown.
Removing a linked Scene or chapter from the tree detaches its canvas Node: the
Node stays at its existing position as an ordinary Scene and remains outlined
in red. Only confirmed tree routes are connected. Suggested routes show their
candidate destination and can be confirmed inline; confirmation marks the tree
route; save the tree, then choose **Generate nodes** or **Update nodes** to apply
it to the canvas. Each episode with a suggested route, a missing incoming or
outgoing route, or a confirmed route missing from the canvas shows a red warning
marker. Hover over it to see the issue counts. A first Scene does not need an
incoming route, and an ending does not need an outgoing route. New tree Scenes
are arranged from left to right by tree links, with branches on separate rows
and clear fixed gaps; existing Nodes are not moved.
Nodes with no incoming or outgoing canvas connection receive a warning outline.
PDF, Word, and Markdown exports use a connected text-tree layout with visible
vertical and branch lines.

## Creating a Scene

A new project opens with an empty Story canvas. Use the toolbar's **Add Scene**
control or describe the story in the chat; the first Scene added becomes the
Start.

1. The author chooses **Add Scene** on the canvas.
2. The **Add a Scene** window shows each Template (Blank, Main menu,
   Choice, QTE, Hotspot, Ending, Story map) as a
   picture with one line of summary, and they pick one. The right-click
   menu offers the same Templates as a list.
3. The Scene appears on the canvas with working starter content, and the
   Workbench opens.
4. The chat is focused with the new Scene as context, ready for "make this
   the Ash Club start screen, with a dark stone background and four entries".

A Template (Preset) is starter content plus instructions for the Agent. It is
not stored as a type, and a Scene created from "Main menu" can later become
anything.

## Scene Workbench

Opening a Scene shows its Workbench: a live preview that fills the page, with
a tool bar, short messages, and popovers floating over it. Every Scene gets
the same Workbench. There is no inspector: the Agent changes the Scene, the author
points at, edits, or draws on the preview to say what to change.

```text
┌──────────────────────────────────────────────────────────────┐
│ Scenes / [Title]                      Replay · Play from here │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│               ( Would open Club lobby  [Open] )              │
│                                                              │
│                        Live preview                          │
│                  (real Runtime, real assets)                 │
│                                                              │
│  ┌──────────────────────────────────────────┐ ┌──────────┐   │
│  │ ▶ Play  ⌖ Select  T Text  ✥ Move  ✎ Draw │ │ 2 issues │   │
│  └──────────────────────────────────────────┘ └──────────┘   │
└──────────────────────────────────────────────────────────────┘
```

The title is edited in place in the breadcrumb (Enter keeps it, Esc reverts).

### Live preview

The preview runs the Scene in the real Node Runtime. It is interactive:
clicking "进入俱乐部" in the preview takes the `enter-club` Exit. Instead of
leaving the Scene, a short message over the preview says where it would go,
such as "Would open Club lobby", with **Open** to go there; it fades after a
few seconds. Back, Replay, and Continue show the same way.

The header offers:

- **Replay** to play the Scene again from the start;
- **Play from here** to open Playtest at this Scene.

Both start from a new game, so every Scene must look right without earlier
progress. To see a Scene as it would be later in the game, play there in
Playtest or ask the Agent to show it.

### Preview tools

The tool bar at the bottom of the preview decides what the pointer does. Esc
always returns to **Play**.

- **Play** plays the Scene.
- **Select** picks an element for the chat; the picks show as chips in the
  composer. Shift-, ⌘- or Ctrl-click picks more, or removes one already
  picked. A picked image or video gets a small bar next to it to replace it
  from the Library, by uploading a file, or by asking the Agent to generate
  one; the asset is declared on the Scene and the Agent is asked to
  show it there.
- **Text** edits text in place. Enter keeps the change, Esc discards it.
  When the element was written in the Scene's HTML and holds only text, the
  change is written straight to that file, an Exit whose name was that text
  is renamed too, and a short message confirms it. Otherwise (text set by a
  script, or mixed content) the change is sent to the Agent, and the chat
  shows it working.
  Font selectors use fonts discovered in the system font folders. The
  **Game function settings** panel can scan system fonts, add a `.ttf`, `.otf`,
  or `.ttc` font folder, and set one global font. A global font overrides each
  element's individual font across every Scene. Desktop folder paths are
  remembered locally; browsers that support persistent folder access remember
  the selected folder in the browser.
- **Move** drags an element to a new place; Esc during a drag puts it back.
  A press on inline text moves the box that holds it, and the Scene's root
  and background stay put. When the element was written in the Scene's HTML,
  the offset is written straight to its `style` as `translate` in cqw and
  cqh, so it holds at any screen size, and Undo takes it back. Otherwise (an
  element a script creates, or one whose own animation sets `translate`)
  the move is sent to the Agent.
- **Game settings** is one player-facing entry shared by every Scene. Choose
  its icon from **Media**, then drag it in the Scene preview to set its
  game-wide position. In **Select**, use the same proportional scale control
  as other selected buttons to resize it independently. Resizing preserves its
  position; moving or changing its icon does not restart the preview or its
  background video.
- **Game-wide button sound** in **Media** selects one audio Asset for all
  placed buttons and the player-owned Game settings and Return controls. It
  follows the game's UI sound toggle and volume. Choose another Asset to replace
  it, or remove it to silence button clicks. Audio uploads currently support
  MP3 and WAV.
- **Return** is a player control shared by every Scene. It stays hidden on the
  Entry Scene while the game is at its home screen, then appears after the
  player enters another Scene. In the Workbench, switch to **Select** to edit
  it even on the Entry Scene: choose its icon and confirm the replacement in
  **Media**, use the same proportional scale control to resize it independently,
  or drag it to another position. Resizing preserves its position. Clicking it
  while playing opens the game menu; Esc opens the same menu.
  The default position is opposite the game settings control so both remain
  reachable. Its icon stays proportional inside the configured frame when
  replaced.
- **Button settings** can replace a charge button's progress image without
  removing its timing or hold behavior. The image replaces the built-in rail,
  and its layer can be moved above or below the button label. Button presets
  keep normal and pressed images proportional within the current button frame
  when those images are replaced. Button presets can also select a press effect
  from the built-in effect library and place its
  attachment point with horizontal and vertical percentages, and choose its
  color. The effect plays on button press in both the editor preview and the
  game. Optional X/Y pixel offsets fine-tune its position without changing the
  button's layout or hit area.
- Built-in button presets are grouped by behavior. Rectangle and circle
  variants share one preset and use **Button shape**; click presets share one
  entry with selectable standard, idle-hint, or bounce feedback. Swipe presets
  share one entry with separate background and success-disappearance options.
  Expanding hint and each navigation action remain distinct.
- **Back button** is an optional button preset for a branch result where the
  player should be able to choose again. It stays hidden while the Scene's
  background video plays and appears when the video ends. Its normal image
  sets the button's aspect ratio; the pressed image and text use the same
  frame. The incoming branch Exit must allow Back (`push`) so the button can
  return to the previous Scene.
- **Guides** adds persistent horizontal or vertical alignment lines over the
  preview. Add as many as needed, drag a line to position it, select one to
  remove it, or clear all guides. Guide positions are saved per Scene in the
  editor layout and are not part of the exported game.
- **Draw** draws freehand over the preview. The drawing is sent with the next
  chat message, on a screenshot of the preview.

There is no comment tool: saying what to change in the chat, with picks or a
drawing attached, does the same job.

### Background video timeline

When the Scene's background is a video, a timeline sits above the tool bar:
play and pause, the time, a track to scrub, and **Mark**. Mark pauses the
video and puts that moment in the chat as a chip, such as `0:04.2`, the way
**Select** puts an element there. The message carries the moment and a
screenshot of the preview at it, so the author can say "show the answers
here" and the Agent sees the frame they mean. Times count from the start of
the video file. A new Mark replaces the moment in the chat, and the track
shows where it is. Arrow keys on the focused track step a second, or a tenth
with Shift.

The timeline points at moments; it changes no files. Changing the video
itself, such as cutting it, is media work outside the Scene. It is editor
tooling run by the sandbox host, like picking, and the Published Player has
none of it.

### Issues

Nothing shows while the Scene is fine. When it has problems, an **N issues**
badge appears beside the tool bar; it opens a list of the Scene's issues,
errors from the preview, and Exits that go nowhere, each Exit with
**Connect…** and **Ask AI to create it**.

There are no type-specific forms. What used to be a Choice's options or a
Scene's duration now lives in the Scene's own content and is changed by
describing the change.

### Talking to the Agent about a Scene

When a Scene is open, the composer shows it as a chip, and the next message
carries it as context: its ID, source files, Signals and their targets, and
declared assets. Each element picked with **Select** adds a chip, a drawing
adds one more, and a moment marked on the
[background video timeline](#background-video-timeline) adds one too. The
message carries their descriptions and one screenshot of the preview, at the
marked moment, with the picks outlined and the drawing on it.
Removing a chip leaves it out of the message; the chips clear once sent. The
conversation shows only the chip labels; the Agent receives the full context.
The Agent edits the Scene's files. When its turn completes, the editor
reloads the project: the preview shows the change, new or removed Exits
appear on the canvas, and an Exit that goes nowhere shows up under the
issues badge.

Typical requests:

- "Make the right page an index of three cases; choosing one changes the left
  page."
- "Show the number of completed rounds on the left page."
- Picking "打开博弈笔记" and saying "this should lead to a new notes
  Scene".
- Picking a title and saying "use the pixel typeface from the main
  menu".

Small edits use the same loop, or the **Text** and **Move** tools
([Preview tools](#preview-tools)) for an element's words or place.

### Code, when it is really needed

The Workbench has no code. The Scene's files are in the **Code** tab, which
is always available. **Story** remains the initial view for new projects.

## Project Style

The Project Style is the project's shared visual language: the tokens in
`shared/style/theme.css`, the classes in `components.css`, and the behaviour
in `components.js`. It is stored as ordinary shared source files that every
Scene imports. The editor has no Style panel: a read-only view could not
change anything, so the style is changed in conversation, or in those files
from the Code view.

- The Agent reads and uses the Project Style whenever it builds a Scene.
- Authors can change the style through conversation ("make the whole game
  warmer, like lamp light on old paper").
- Changing the style updates every Scene that uses it.

The default Project Style looks like an interactive film: black bars, a
vignette, and film grain over the background, dialogue as subtitles, answers
as dark bars across the screen, a ring for timed presses, and pulsing dots
for hotspots. Sizes follow the screen width (`cqw`), so a Scene looks the
same at any size. Until the author sets a background, each Template shows a
placeholder picture chosen by a class on its `.backdrop`.

Project Style is how two different screens, such as the Ash Club menu and
archive, stay recognizably part of one game.

## UI on many Scenes

UI that appears on several Scenes, such as the Ash Club top bar or a **Home**
button, is a shared component (`shared/components/`). The author asks for it
in chat ("add a Home button to every chapter Scene"), and the Agent writes the
component once and imports it into each Scene that should show it.

Its buttons are that Scene's own Exits. They appear on the Scene's card and in
its Workbench, and are connected like any other Exit, so **Home** can lead to
the menu from one Scene and to the chapter list from another. A Scene that
does not import the component does not show it. There is no layer over every
Scene and nothing extra on the canvas; anything that must carry over between
Scenes, such as a score, is remembered by the game.

## Variables

A Variable is something the game remembers from Scene to Scene and keeps in
the save, such as a trust score or the items the player carries. Progress
inside one Scene, such as which hotspots were clicked, stays in that Scene;
content such as item definitions lives in shared code.

The author asks for them in chat ("a trust of three or more leads to the
good ending"), and the Agent adds each one with a starting value and a
one-line description. **Project ▾ → Variables** lists them read-only:

```text
Variables                                         ×
What the game remembers from Scene to Scene...
  trust          How much the guard trusts you   Starts 0
  inventory      What the player carries         Starts empty
  boarded        Whether the player boarded      Starts No
Ask the AI to add or change them.
```

Starting values read in author words (Yes/No, empty, "3 items"); their tooltips
include the raw value. There is no form to add, delete, or edit them.

A branch shows as Exits. A Scene that goes different ways declares one Exit
per outcome, and the Agent writes when each is taken. The canvas shows it on
the Exit row:

```text
Final talk
  ├─ Trusted ending    if trust is 3 or more   → Good ending
  └─ Not enough trust  if trust is below 3     → Bad ending
```

The condition is a description (Signal `when`), not a rule the editor runs:
the Scene decides which Exit to take, and the Agent updates the words when it
changes the logic. There are no Condition or Update State Scenes. Playtest
shows what the game remembers in its State panel, for when a branch goes
the wrong way.

## Playtest

Playtest runs the real Runtime from the Start Scene, with the saved game
available through the game's Continue action, or from a chosen Scene with a
new game (**Play from here** in a Workbench). A chosen start runs without
saving, so the saved game is untouched.

The Playtest window shows only the game. The author plays it as a player;
reading the game's inner state is the Agent's work, not theirs. The editor's
Playtest arrow menu holds **Replay Playtest**, which restarts the Playtest window
from the session's starting Scene with a new game. For a regular Playtest from
the project's Start Scene, this clears the saved game. A chosen start made with
**Play from here** leaves the saved game untouched. The same menu sits beside
**Play from here** in the Workbench and applies to the Playtest window with the
same save behavior. The Workbench's separate **Replay** button only restarts
that Scene's local preview. These controls stay outside the game; desktop
window controls and dragging use a native title bar outside the game surface.
When something breaks, a short note says so and offers **Ask AI to fix**, which
brings the editor forward on that Scene and fills the chat with where the player was,
the Exits they took, and the errors, ready to send.

Playtest also remembers which Scenes the author has seen and which Exits
they took, across replays, as players' games do; a [Story map](#story-map)
shows it. **Forget seen Scenes**, in the same editor menu, starts that record
over without clearing the saved game, and reloads the Playtest session.

The Agent reads the full record (current Scene, back stack, Exits taken,
State, errors, save) in serializable form, so it can verify a flow it just
built.

## Story map

Interactive films and visual novels often show players a map of the story:
the branches they have found, the ones still locked, and the endings
collected. The **Story map** Template is that screen. It is an ordinary
Scene; the author reaches it from a menu, a pause button, or an ending
through an Exit with **Allow Back**, and its **Back** returns there.

A Main menu always has a **Story map** entry and Exit. Dragging that Exit
to a Story map Scene makes the entry work; until then it shows disabled,
the way Continue does before there is a save. It is a Navigation Exit, so a
game can be published while it goes nowhere; an author who does not want it
asks the Agent to remove it.

The map is drawn from the canvas's connections, not from where cards sit on
the canvas, so arranging the canvas never changes what players see. It
reads from the Start down: each Scene sits one row below the Scenes that
lead to it, and branches spread side by side. What it leaves out:

- Exits with **Allow Back** lead to side screens, such as an archive, and
  Navigation Exits lead around the game, so neither is a step in the story;
- connections back up the story, such as retrying after a failed QTE;
- Scenes marked off the map. Main menu and Story map Scenes start off it.
  The Scenes before and after one are joined, so a menu between two Scenes
  links them directly.

Players see the Scenes they have reached, by name, and the Scenes one step
past them as locked **???**, with a line for each way they went and a count
of Scenes and endings found. What they have seen lasts across new games.

The author decides only what the map cannot guess, from a Scene's context
menu: **On Story map**, and **Ending**. A Scene with no Exits other than
Navigation ones is guessed to be an ending. The Agent can set both, and the
name players see when it should differ from the Scene's title. Asking the
Agent changes how the map looks, since it is the Scene's own code.

The Workbench previews a Story map Scene with everything seen, so the author
sees the whole map while editing; Playtest shows what they have played.

## Relationship with Asset Canvas

Asset Canvas and Playable Nodes stay separate workspaces:

- Asset Canvas connections mean **data dependency** (this image is a
  reference for that video). Playable Nodes edges mean **player movement**.
  One canvas with two meanings for a line was a major source of complexity in
  the old editor.
- Generating media is exploratory iteration; arranging a playable project is
  structural work. They are different working modes.
- With Agent-first authoring, the Agent can find or generate the media a
  Scene needs, so the author does not need both on one canvas.

Separation must not make the authoring loop longer. Three bridges keep it
short:

1. **One Asset Library with stable project Asset IDs.** Asset Canvas results
   enter the Library. A project Asset ID such as `club-background` points at
   one Library asset, and Scenes use only the project Asset ID. **Replace**
   re-points that ID at a better Library asset, which updates every Scene that
   uses it without changing code.
2. **Media from the Workbench.** The preview toolbar's **Media** menu first
   asks where an image or a video goes, then opens the Library, with
   **Upload** for a new file. **As background** declares it on the Scene and
   shows it as the Scene's background at once, with Undo in the toast.
   **Add to chat** declares it and adds it to the chat as an attachment,
   next to any picked elements; the author says where it goes and sends.
   As background is unavailable when the Scene has no single background
   element, for example after the Agent removed it.
3. **Where used.** Asset Canvas can show which Scenes use an asset. This can
   come after v1.

If real use shows authors constantly switching between the two workspaces,
an asset side panel on the Flow canvas can be reconsidered then.

## Design decisions

### Templates

v1 ships nine Templates (Presets). Each contains starter source that
already uses the Project Style, its expected Signals, a one-line summary
for the author, and a brief that tells the Agent what the author usually
wants next. The brief is not shown to the author. Each Template's picture in
**Add a Scene** is a capture of the Scene it creates: the starter source
with the default Project Style and no background. The Story map's shows a
sample story partly played, since a new one has nothing seen to show.

| Template  | Starter content                                        | Starter Signals        |
| --------- | ------------------------------------------------------ | ---------------------- |
| Blank     | The background; a click or the video's end continues   | `next`                 |
| Main menu | Title, tagline, a list of entries, over the background | `start`, `story-map`   |
| Choice    | A subtitle line and answer bars that can read State    | `option-a`, `option-b` |
| QTE       | A key to press before a ring runs out                  | `success`, `fail`      |
| Hotspot   | A picture with pulsing spots, one Signal per spot      | `door`, `window`       |
| Ending    | Stamped ending title, closing lines, and Play again    | none                   |
| Story map | The branches seen so far, locked ones, endings found   | none (Back)            |
| Affection | Relationship meters and threshold-based choices        | `closer`, `distant`, `reassure`, `guarded` |

Starter Signals are ordinary declared Signals; the author or Agent renames
and adds them freely. The set follows the old editor's story nodes: Open UI
became Main menu, Scene and the Continue interaction folded into Blank, and Start,
Condition, and Update State are not Templates because the Start badge, Scene
code, and Exit conditions cover them. Other screens, such as an archive or a
small game, start from Blank plus a description.

Templates live in puteng game, not in projects. Creating a Scene copies the
Template's source into `nodes/<id>/`; later Template changes do not affect
existing Scenes.

### Scene thumbnails

Thumbnails are screenshots of the real Scene, never a separate rendering.

- The canvas captures every Scene that has no thumbnail, or one of an older
  build, without it being opened: the desktop app runs the Scene in a hidden
  window, one Scene at a time, as the Workbench preview runs it.
- The Scene is captured through the desktop `capturePage` capability, the
  same mechanism that captures Web Game project covers, about one second
  after it reports ready. A run with errors is not captured. Captures keep
  the display's pixel density, up to 1280 pixels wide. The hidden window
  runs Scene code, so it may only capture and report its result.
- Thumbnails are editor cache stored under `.ohmygame/thumbnails/` in the
  workspace. They are not part of `graph.json`, `editor/layout.json`, or the
  published project.
- A thumbnail records the hash of the Scene's compiled output. When the source
  changes, the card keeps the old image with a _stale_ marker until the next
  capture replaces it.
- A Scene that has no thumbnail yet, or whose run fails, shows its first
  declared image asset, or a neutral card with its title.
- A Scene that fails to build shows its last good thumbnail dimmed with an
  error marker; opening it shows the error in the Workbench.
- When the capture capability is unavailable (for example in the browser
  development build), the canvas uses the same fallbacks.

The same capture is attached to Agent requests about that Scene.

### Element picking, text editing, and moving

Picking (**Select**), in-place editing (**Text**), and moving (**Move**) are editor tooling
implemented by the sandbox host, not by node code, and they are disabled in
the Published Player.

1. **Select**, **Text**, or **Move** puts the preview into pick mode. The sandbox host
   draws a hover outline inside the node's surface and blocks node input.
2. With **Select**, clicking returns a **picked element** description: node
   ID, source location when known, CSS path within the node root, tag,
   visible text excerpt, bounding box, and the Exit (`data-signal`) it
   belongs to. Shift-, ⌘- or Ctrl-click adds it to the picks.
3. Preview builds add an inert `data-ohmygame-source="index.html:12:5"`
   attribute to every element written in the node's HTML. Elements created by
   JavaScript have no such attribute; the description then gives the source
   location of the nearest element around it that was written in the HTML,
   and the Agent finds the element from there. An element with none, such as
   one a script adds straight to the node's root, cannot be picked with
   **Select** or edited with **Text**: **Select** shows no hover outline for
   it and a click does nothing.
4. With **Text**, clicking makes the element editable. On Enter the host
   reports the text before and after, and whether the element holds only text
   and came from the node's HTML. The editor then replaces that element's
   text in the source file, only if the file still reads the old text;
   anything else goes to the Agent.
5. With **Move**, dragging moves the element with an inline `translate`
   added to the one it had. On release the host reports the element and its
   new offset in cqw and cqh, and whether it came from the node's HTML with
   no animation of its own that overrides `translate`. The editor then sets
   `translate` in that element's `style` attribute, only if the source still
   has the same tag there; anything else goes to the Agent. The Project
   Style's `.rise` entrance adds to the element's `translate`
   (`animation-composition: add`), so a moved element rises into its new
   place.
6. Picks and a drawing appear as chips in the chat composer and are sent with
   the next message together with one screenshot of the preview. The chips
   clear once sent.

### Video and image Scenes

"Advance when the video ends" is normally Scene content. The Project Style
includes a small `playScene()` component that shows the Scene's background
and emits a given Signal when a single-play video ends. Clicking a single-play
video cannot skip it. Looping videos, images, and empty backgrounds can be
clicked to continue; clicks on controls do not trigger the Scene-level action.
Blank uses it.

Every Scene has one background: a `.backdrop` element
(`data-media="backdrop"`) whose `data-asset` and `data-type` say what it
shows. Blank is only the background; the other Templates put their content
over it. Setting the
background from the editor writes those two attributes in the Scene's HTML,
the same way text edits are written. `showBackdrop()` plays it the same way
everywhere: a video plays once with sound and stops on its last frame, an
image stays still. Exits decide when to move on.

For a Scene with one connected story Exit, **Automatically continue when the
video ends** is an optional Scene setting. When enabled with a single-play
background video, player input cannot trigger the Exit; the Runtime takes that
sole Exit when the video ends. It is off by default and does not change other
Scenes. The setting is unavailable for looping videos, navigation-only Exits,
or Scenes with multiple connected Exits. Without this setting, existing
button-driven navigation remains unchanged.

### Multi-node Agent changes

The Agent may create several Scenes and Exits in one turn. The turn
review below is not built yet.

- Before each Agent turn, the editor records a checkpoint of `graph.json`,
  `editor/layout.json`, and the node and `shared/` source files.
- After the turn, the canvas highlights the change set: new Scenes and
  connections marked **New**, changed Scenes marked **Edited**, removed ones
  listed in a
  summary bar.
- The summary bar offers **Keep** and **Undo turn**. Undo restores the
  checkpoint. Continuing to edit implicitly keeps the change.
- New Scenes without a position in `editor/layout.json` are placed in the
  next free grid slot when the project is read. Slots fit the Scene card's
  screen shape and title, with a gap, and skip any position that would overlap
  an existing card, including cards moved off the grid. Saved positions stay
  where they are, and positions of removed Scenes are dropped. The Agent does
  not need to compute layout.

### Asset versions

The project has no separate version concept. A project Asset ID points at
exactly one Library asset. Choosing a better image means pointing that
project Asset ID at a different Library asset with **Replace**.

- Scenes that should change together share one project Asset ID.
- A Scene that must keep an image while others change uses a different
  project Asset ID, for example `club-background-night`.

This gives both "update everywhere" and "keep this one" without a pinning
system.
