# Shot list — Frontegg Mobile MCP showcase

Six scenes. For each: what's on screen, the action sequence, and the
recording mechanism.

## Scene 1 — Pain hook (0:00–0:15)

- **On screen:** TextEdit narrator card with three lines fading in:
  "Mobile integration today." → "Tickets escalate. Engineers loop in.
  Customers stall." → "Today, week one. The longest part of the
  relationship." Held for 2s each.
- **Recording:** `screencapture -V 18 recordings/scene-1-hook.mov`
  starts. I drive TextEdit (full tier) to type and reveal each line.
- **Cuts to be added in editing:** Quick stock cuts of an Xcode build
  error, blurred Slack thread, and a CSM calendar — sourced separately by
  the editor (Frontegg brand library or Unsplash).

## Scene 2 — A/B + Hero (0:15–1:45)

- **On screen:** Two Claude Desktop windows side-by-side.
  - Left: `mcp-off.json` config, fresh chat.
  - Right: `mcp-on.json` config, fresh chat with `frontegg-mobile`
    visible in the tools sidebar.
- **Action:**
  1. I type the Scene 2 prompt (from `prompts.md`) into the LEFT window.
     Wait ~12s for response to render fully.
  2. I type the same prompt verbatim into the RIGHT window.
  3. Wait ~15s for MCP tool calls + findings to render.
  4. On the right, click "Apply diffs" (or type "apply all").
  5. Cut to iOS Simulator (already booted). Tap login button. Show
     hosted-login flow → return → authenticated state.
- **Recording:** `screencapture -V 100 recordings/scene-2-ab-hero.mov`
  for the chat portion. Then `xcrun simctl io booted recordVideo
  recordings/scene-2-sim.mp4` for the clean simulator login. Editor
  composites these.

## Scene 3 — CLI beat (1:45–2:00)

- **On screen:** Pre-rendered VHS GIF/MP4 of `npm run demo:ios` running
  in a styled terminal. No live recording.
- **Source:** `cli-beat/demo-ios.mp4` (rendered in Phase 4).
- **Editor instruction:** crossfade from end of Scene 2 sim shot into
  this clip. Hold for 15s.

## Scene 4 — Kotlin breadth (2:00–2:25)

- **On screen:** MCP-on Claude Desktop window (full screen, simulator
  hidden), then split with Android Emulator.
- **Action:**
  1. Reset Android demo-start. Switch focus to Claude Desktop.
  2. I type the Scene 4 prompt.
  3. Wait for findings + apply.
  4. Switch to emulator. Launch app. Show login.
- **Recording:** `screencapture -V 28
  recordings/scene-4-kotlin.mov` + emulator video via Android Studio's
  built-in screen recorder (USER TASK in case computer-use can't drive it
  cleanly — see Phase 5 Task 5.4).

## Scene 5 — Day-2 MFA (2:25–3:10)

- **On screen:** MCP-on Claude Desktop full-screen, then split with
  Frontegg portal.
- **Action:**
  1. I type Prompt 5a. Wait for `frontegg_configure_mfa get` tool-call
     line + policy render (~10s).
  2. I type Prompt 5b. Wait for `frontegg_configure_mfa update`
     confirmation (~8s).
- **Recording:** `screencapture -V 50 recordings/scene-5-mfa.mov`.
- **Portal cut:** USER TASK — record a 10-second clip in Chrome of the
  MFA setting in the Frontegg portal showing it now reads
  "ForceExceptSAML." Save as `recordings/scene-5-portal-USER.mp4`.

## Scene 6 — Multi-client closer + impact numbers (3:10–4:00)

- **On screen:** Three sidebar cuts (Cursor → Claude Code → Claude
  Desktop), then `impact-numbers.html` rendered as a sequence.
- **Action:**
  - Sidebar cuts (5s each): USER TASK — three 5-second screen recordings
    of the user's actual editor showing `frontegg-mobile` connected in
    each client's MCP sidebar. Save as `recordings/scene-6-sidebar-cursor-USER.mp4`,
    `scene-6-sidebar-claude-code-USER.mp4`,
    `scene-6-sidebar-claude-desktop-USER.mp4`.
  - Impact numbers: I render `overlays/impact-numbers.html` to a 35s
    PNG sequence using headless Chrome + ffmpeg, output as
    `recordings/scene-6-numbers.mp4`.

## Mouse-cursor convention

- Cursor visible during typing scenes (signals human-like interaction).
- Cursor hidden during pre-rendered cuts (CLI beat, impact numbers).
- Hide via macOS keyboard shortcut or `defaults write` — verify in
  `recording-checklist.md` setup.
