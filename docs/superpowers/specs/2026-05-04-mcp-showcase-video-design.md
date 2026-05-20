# Frontegg Mobile MCP — Stakeholder Showcase Video

**Date:** 2026-05-04
**Owner:** Diana Khortiuk
**Status:** Spec — pending review (revision 2: attribution-locking)

## Goal

Produce a **3–5 minute screencast** that lands the Frontegg Mobile MCP Server's
business value with **Frontegg leadership/exec + Customer Success**.

The video must answer two questions for those audiences:

- **Exec:** Does this measurably accelerate new-customer activation and reduce
  cost-to-serve on mobile accounts?
- **CS:** Does this deflect the support load that currently lands on my team —
  specifically the painful mobile-integration tickets?

Not a feature tour. Not a developer tutorial. A business-impact narrative with
the product as the demonstration.

## Brand-attribution rule (non-negotiable)

The viewer must attribute the value to the **Frontegg Mobile MCP**, not to the
LLM hosting it. The MCP is the product. The chat client is just a surface.

Every scene must satisfy this test: *"If the viewer credits Claude/Cursor for
what they just saw, the scene has failed."*

Mechanics enforced in this design:

1. **A/B opener** — same prompt to an LLM with the MCP off vs. on. Without the
   MCP, the LLM gives generic or wrong answers. With the MCP, evidence-backed
   diffs from the canonical repo. Lock attribution before the wow.
2. **MCP visible in every shot** — tool sidebar with `frontegg-mobile` branding
   on screen; tool-call lines render inline (`frontegg_auto invoked → fetched 4
   canonical files → 5 findings`); diff headers cite source path + commit.
3. **No-LLM beat** — a 15-second cut shows the same MCP detector running via
   CLI (`npm run demo:ios`). No AI in frame. Proves the MCP is the engine.
4. **VO discipline** — every line credits "the MCP", never "Claude" or "the AI".
5. **Multi-client closer** — 5-second cuts of `frontegg-mobile` connected in
   Cursor, Claude Code, and Claude Desktop. "Works in any MCP-compatible
   client" — that's what makes it Frontegg's product, not a Claude feature.

## Audience and tone

- **Primary:** Frontegg leadership/exec.
- **Secondary:** Customer Success leadership and ICs.
- **Tone:** Confident, evidence-led, sparse. No marketing fluff. Three numbers
  beat thirty slides. Customer is the hero; CS is the witness in the close.

## Length and format

- **4:00 target** (3:45 floor, 4:30 ceiling).
- **Recorded screencast** with voiceover. Async-shareable (Loom/MP4). Not live.
- **Aspect:** 16:9, 1920×1080 minimum.

## Scope decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Lead platform | **iOS Swift** | Enterprise/exec-grade customer mix; richest "missing config" surface (Associated Domains + URL types + ATS + init wiring) → most visceral hero. |
| Second platform | **Android Kotlin** as 25s breadth shot | Same prompt, no re-narration. Sells "works everywhere" without burning runtime. |
| Primary chat surface | **Claude Desktop** (full-tier; I can drive it) | Two windows side-by-side: MCP-disabled (left) vs MCP-enabled (right) for the A/B. |
| Multi-client proof | 5-second sidebar cuts of `frontegg-mobile` connected in **Cursor** and **Claude Code** | User records these — trivial. Killed the "this is a Claude feature" objection. |
| Numbers strategy | **Illustrative ranges with `your data here` overlay** | I won't fabricate Frontegg internal data. Template ships ready for CS/RevOps to drop real numbers in. |
| Demo posture | **Customer-as-hero**, CS as witness in the close | Self-serve activation is the bigger exec lever. CS still wins (deflected tickets). |
| Out of scope | React Native, Flutter, Ionic, full security sweep, full feature-guide tour | Not absent from the product — just not in this cut. Keep the runtime honest. |

## Storyboard

| # | Time | Scene | Purpose |
|---|---|---|---|
| 1 | 0:00–0:15 | **Pain hook** — quick montage: Xcode build error, blurred Slack escalation thread, CSM calendar full of "integration sync" blocks. | 15s emotional anchor — exec + CS feel this today. |
| 2 | 0:15–1:45 | **A/B + Hero** — split screen, two Claude Desktop windows. Left: MCP off, generic/wrong answer to "Why isn't my iOS Frontegg login redirecting back to the app?" Right: same prompt, MCP on → 5 specific findings sourced from canonical repo. Apply diffs on right. Cut to simulator showing working login. | The whole video. Locks attribution. Delivers wow. |
| 3 | 1:45–2:00 | **CLI beat** — terminal cut to `npm run demo:ios`. Same MCP, same findings, no LLM in frame. VO: *"The MCP itself, no AI involved — same answer."* | Proves the MCP is the engine. |
| 4 | 2:00–2:25 | **Breadth** — Claude Desktop again, same prompt verbatim, but on Android Kotlin example. MCP detects 4 issues, applies, emulator login works. No VO except `frontegg_auto` tool-call line and a timestamp counter. | Sells platform reach in 25s. |
| 5 | 2:25–3:10 | **Day-2 MFA** — Claude Desktop chat: `frontegg_configure_mfa get` → policy renders → `update enforceMFAType=ForceExceptSAML` → confirmation. Cut to portal showing the same change. Tool-call line visible throughout. | Value extends past initial integration; portal still source of truth. |
| 6 | 3:10–4:00 | **Multi-client closer + numbers** — 5-second sidebar cuts of `frontegg-mobile` MCP connected in Cursor, Claude Code, Claude Desktop. Then three counter animations with `your data here` overlay. Frontegg logo close. | Brand-defensive ("works in any client") + the exec close (three numbers). |

## Hero scene — exact "broken state" for iOS

To simulate a real mid-integration customer project, fork
`frontegg/frontegg-ios-swift/example` and remove these 5 things on a
`demo-start` branch (full state preserved on `demo-end`):

1. **`Associated Domains` entitlement** — strip from `*.entitlements`.
2. **`CFBundleURLTypes`** — remove from `Info.plist`.
3. **`FronteggAuth.shared.start()` init wiring** — remove from `AppDelegate.swift`.
4. **`baseUrl` / `clientId` plist entries** — remove from `Frontegg.plist`.
5. **ATS exception** — leave a stale `NSAllowsArbitraryLoads = YES` to trigger the security flag.

The MCP must detect all 5 in one `frontegg_auto` pass and emit diffs sourced
from the canonical example. **This is verified on the prep-pack branch before
recording** — no live debugging during the shoot.

## A/B left side — MCP-off prompt and expected response

Left Claude Desktop window: **same model, MCP disabled** (no
`frontegg-mobile` server in its config).

The prompt typed verbatim into both windows:

> *"This is the Frontegg iOS example. Login redirects to Safari and never
> comes back to the app. What's wrong with the project — be specific about
> file names and exact config lines."*

Expected MCP-off behavior (validated in pre-shoot):

- Generic suggestions ("check your URL scheme", "make sure the SDK is
  initialized"). No file names. No specific lines. Possibly an outdated or
  hallucinated key.

Expected MCP-on behavior:

- 5 findings with file paths (`Info.plist`, `*.entitlements`,
  `AppDelegate.swift`, `Frontegg.plist`).
- Each finding includes a diff sourced from
  `frontegg-ios-swift/example/...` with the source path + commit visible.
- Tool-call line on screen: `frontegg_auto: fetched 4 files → 5 findings`.

If the MCP-off response is too good (model has memorized the right answer),
**make the prompt harder** until it falls over — e.g., "what's missing from
my Info.plist for Frontegg deep linking on iOS 17 with Associated Domains
v2?" The whole point is to make the MCP earn its keep on screen.

## Hero scene — exact "broken state" for Kotlin

Fork `frontegg/frontegg-android-kotlin/example`, strip on `demo-start`:

1. **`<intent-filter>` for the auth callback** — remove from `AndroidManifest.xml`.
2. **`<uses-permission android:name="android.permission.INTERNET" />`** — remove.
3. **`FronteggApp.init(...)` call** — remove from the Application class.
4. **`build.gradle` SDK dependency line** — remove.

Single prompt detects all 4. No A/B for Kotlin (one A/B is enough; this scene
is breadth).

## Voiceover script (timed, MCP-credited)

> **0:00 [hook]** — Every new mobile customer hits the same wall: deep links,
> plist entries, init order. It's the longest, most CSM-expensive moment of
> their relationship with us.
>
> **0:15 [A/B in]** — Same model. Same prompt. Two windows. The one on the
> left has nothing extra. The one on the right has the Frontegg Mobile MCP
> connected.
>
> **0:35 [responses render]** — On the left, generic guesses — none of it
> grounded in your actual codebase. On the right, the MCP fetched four files
> from your canonical SDK repo and identified five specific issues, with the
> exact lines to change.
>
> **0:55 [pause]** — *This isn't the model getting smarter. This is your MCP
> grounding it in your canonical repo.*
>
> **1:05 [diffs apply]** — The MCP applies the diffs. Backups created.
>
> **1:20 [build & sim]** — Build runs. Login completes end-to-end. The
> customer didn't open a ticket. CS didn't get pulled in. Engineering didn't
> escalate.
>
> **1:45 [CLI beat in]** — And the MCP itself? It runs without an AI at all.
> Same detector, same findings — straight from your terminal.
>
> **2:00 [Kotlin breadth in — VO sparse]** — Same MCP. Different SDK.
>
> **2:25 [day-2 in]** — Same customer, week three. They need to enforce MFA.
> The MCP reads the current policy from the Frontegg API, renders it, updates
> it. No portal training. No ticket. No engineer.
>
> **2:55 [portal cut]** — The change is reflected in the Frontegg portal.
> Audit-trail intact. Vendor permissions respected.
>
> **3:10 [closer in]** — The Frontegg Mobile MCP. Works in Cursor. Works in
> Claude Code. Works in Claude Desktop. Works in any MCP-compatible client.
> The intelligence is the MCP. The chat is just the surface.
>
> **3:30 [impact in]** — What this changes, in your numbers.
>
> **3:35 [counter 1]** — Time to first successful mobile login. *[your data]*.
>
> **3:42 [counter 2]** — CSM hours per new mobile customer onboarding.
> *[your data]*.
>
> **3:49 [counter 3]** — Mobile-auth tickets per quarter — projected
> deflection. *[your data]*.
>
> **3:56 [close]** — Your customers ship faster. Your CSMs scale further.
> Same team, more accounts. *[Frontegg logo]*

## Recording architecture

**I drive the recording end-to-end** via the macOS computer-use sandbox plus
Bash. No screen-recording app needed beyond the built-in `screencapture` CLI.

| Surface | Driver | How |
|---|---|---|
| Two Claude Desktop windows (A/B) | **Me** — full tier confirmed | Type prompts directly. |
| iOS Simulator | **Me** | Boot, launch app, click through login. |
| Android Emulator | **Me** | Same. |
| Terminal (CLI beat) | **Me, via asciinema** | Click-tier blocks typing into Terminal directly. Solution: I run `npm run demo:ios` under `asciinema rec` via the Bash tool — captures the real terminal session as a recording. Render to MP4 via `agg`. Real output, no fakery, no live-typing risk. |
| Cursor / Claude Code 5-sec sidebar cuts | **You** | 30-second screen recording each, of just the MCP server appearing in the sidebar. |
| Frontegg portal cut | **You** | 10-second recording of the MFA setting after the chat update. (Browsers are read-only for me.) |
| Title cards / lower thirds / closer | **Me** | TextEdit narrator cards, animated HTML overlays. |
| Recording itself | **Me, via Bash** | `screencapture -V <sec> out.mov` for full-screen scenes; `xcrun simctl io booted recordVideo sim.mp4` for clean simulator-only shots. |

## What I produce (the prep pack)

Delivered as a folder under `assets/showcase-video-2026-05-04/`:

| Asset | Form | Notes |
|---|---|---|
| `demo-state/ios-swift/` | Local clone with two branches | `demo-start` (broken) + `demo-end` (working). Reset between takes via `git reset --hard demo-start`. |
| `demo-state/android-kotlin/` | Same pattern | `demo-start` + `demo-end` of `frontegg-android-kotlin/example`. |
| `claude-desktop-configs/` | Two JSON configs | `mcp-off.json` (no servers) and `mcp-on.json` (frontegg-mobile wired). User swaps + relaunches Claude Desktop between takes. |
| `script/voiceover.md` | Timed Markdown | Full VO with second-precise cues. MCP-credited language only. |
| `script/shot-list.md` | Markdown | Each scene: app on screen, zoom level, mouse cursor visible y/n, on-screen text overlays, tool-call lines to highlight, timer. |
| `script/teleprompter.txt` | Plain text | VO only, line-broken for screen-reading at 150 wpm. |
| `script/prompts.md` | Markdown | Exact prompts to type, copy-paste-ready, per scene. |
| `cli-beat/asciinema-cast.cast` | asciinema recording | Pre-recorded `npm run demo:ios` run, real output, 15s. Renders to MP4 via `agg` for the editor. |
| `overlays/title-card.html` | HTML/CSS | Frontegg-branded; export PNG. |
| `overlays/lower-third-{1..6}.html` | HTML/CSS | Per-scene subtitle bar. |
| `overlays/ab-divider.html` | HTML/CSS | The "MCP off" / "MCP on" labels for the split screen. |
| `overlays/multi-client-strip.html` | HTML/CSS | The Cursor + Claude Code + Claude Desktop logo strip for the closer. |
| `overlays/impact-numbers.html` | HTML/CSS | Three editable `your data here` slots. |
| `overlays/architecture-broll.svg` | Animated SVG | Canonical repo → MCP → diff → project. 8s loop. |
| `recording-checklist.md` | Markdown | Pre-shoot: clean desktop, hide notifications, set window sizes, simulator preheat, two Claude Desktop windows positioned, etc. |
| `editing-notes.md` | Markdown | What to cut, where to drop overlays, audio levels, color treatment. |

## What I do **not** produce (the user produces)

- **Cursor + Claude Code 5-second sidebar cuts** — trivial recordings of the
  MCP server appearing in those clients' sidebars. (Browsers and IDEs are not
  driveable by me.)
- **Frontegg portal cut** — 10-second clip of the MFA setting after update.
- **Voiceover audio** — live recording or AI synthesis (ElevenLabs etc.).
- **Video editing** — Premiere / Final Cut / DaVinci. Stitch my MOVs +
  asciinema MP4 + your sidebar/portal cuts together, drop overlays, sync
  audio, color-grade.
- **Final MP4** + stakeholder-distribution approval and hosting.

## Pre-shoot validation (mandatory before recording)

Before the camera rolls:

1. **MCP-on side** — run `frontegg_auto` against each platform's `demo-start`.
   Confirm exact planted issues are detected, no more, no less.
2. **MCP-off side** — run the same prompt in Claude Desktop with no MCP
   configured. Confirm response is plausibly weaker / wrong / generic. If too
   good, harden the prompt (see hero scene section).
3. Confirm `frontegg_apply_diff` applies cleanly with `.bak` backups.
4. Confirm the project **builds and login completes** after diffs apply.
5. Confirm tool-call rendering is visible in Claude Desktop's UI for the
   chosen view mode.
6. Confirm `npm run demo:ios` produces clean, short output for the asciinema
   cast.

If any check fails, **stop and fix the fork or the prompt**, don't fudge the
demo. The whole pitch rests on every claim being demonstrably true.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| MCP-off side gives a too-good answer (model has memorized it) | Harden the prompt during pre-shoot until the off-side fails plausibly. Document the exact prompt in `script/prompts.md`. |
| Live network flake during recording (GitHub fetch slow) | Pre-warm cache in a take just before the recorded one — MCP cache is 6h. |
| MCP output looks different from script (rule changes between writing and recording) | Pin the MCP commit on the `demo-state` branches. Re-run pre-shoot validation the morning of the shoot. |
| Tool-call lines hidden by Claude Desktop's UI (collapsed by default) | Test the view in pre-shoot. If collapsed, switch to the verbose tool-trace mode or render an HTML overlay that shows the call inline. |
| Claude Desktop window has no chat thread open when recording starts | Recording-checklist item: "Both windows have a fresh New Chat ready before screencapture starts." |
| Viewer credits Claude, not the MCP | Every scene is reviewed against the brand-attribution rule above before final cut. If any single scene fails the test, it's recut. |
| `your data here` placeholders ship in the final cut | Editing-notes checklist: verify all three slots are populated before export. |
| iOS simulator cold-start latency wrecks pacing | Pre-launch simulator before "Action." Don't show the spinner. |

## Success criteria

A reasonable exec watching the cut once, with no other context, can answer:

1. **What does this thing do?** — In one sentence.
2. **Who does it help, and how?** — Customer self-serves; CS scales.
3. **Why should we care, in numbers?** — Three before/after metrics.
4. **Why does this work?** — *"It grounds AI in the canonical Frontegg repo."*
   Not *"Claude is good at this."*

A CS leader can answer:

1. **Which tickets does this deflect?** — Mobile integration + day-2 config.
2. **What changes in my onboarding playbook?** — Customers run the MCP first;
   CS engages on what's left.

If the cut answers all six, ship it.

## Open questions for follow-up after recording

- **Distribution surface:** internal-only (Notion/Slack) or also customer-facing
  (sales enablement, devrel)? If the latter, a customer-facing edit may need a
  shorter open and different close.
- **Localization:** any need for subtitles or non-English VO?
- **Update cadence:** when MCP rule count or supported SDK list changes
  materially, does this video need a respin or a follow-up clip?

These do not block the prep-pack work.
