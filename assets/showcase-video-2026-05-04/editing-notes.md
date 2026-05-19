# Editing notes — Frontegg Mobile MCP showcase

For the human editing this video. Read before opening Premiere/Final Cut.

## Sequence assembly

| Scene | Source clip(s) | Duration | Overlay |
|---|---|---:|---|
| 1 Hook | `recordings/scene-1-hook.mov` + your stock cuts | 0:15 | `overlays/title-card.png` for first 3s |
| 2 A/B + Hero | `recordings/scene-2-ab-hero.mov` (chat) + `recordings/scene-2-sim.mp4` (sim) | 1:30 | `overlays/lower-third-2.png` + `overlays/ab-divider.png` for the split-screen labels |
| 3 CLI beat | `cli-beat/demo-ios.mp4` (pre-rendered VHS) | 0:15 | `overlays/lower-third-3.png` |
| 4 Kotlin | `recordings/scene-4-kotlin.mov` + emulator clip | 0:25 | `overlays/lower-third-4.png` |
| 5 Day-2 | `recordings/scene-5-mfa.mov` + `scene-5-portal-USER.mp4` | 0:45 | `overlays/lower-third-5.png` |
| 6 Closer | 3 × sidebar cuts + `recordings/scene-6-numbers.mp4` | 0:50 | `overlays/multi-client-strip.png` for the sidebar montage; `overlays/lower-third-6.png` |

## Audio mix

- VO bus: -16 LUFS integrated (broadcast-loud, async-distribution-friendly).
- Music bed: optional. If used, duck to -28 dB under VO.
- No SFX on tool-call render — let the visible UI speak.

## Color & branding

- All overlays use Frontegg's brand palette. Reuse the colors from
  `overlays/*.html` directly — they import the same CSS variable set.
- Cursor visible during live action; hide during pre-rendered numbers
  scene if your editor supports cursor-mask.

## Pre-export checklist

- [ ] Three "your data here" placeholders populated in
      `overlays/impact-numbers.html` BEFORE rendering Scene 6.
- [ ] No `frontegg_configure_mfa` API key visible in any frame (zoom + check).
- [ ] No `clientId` or `clientSecret` text visible in any frame.
- [ ] No personal Slack notifications, Mail badges, or unrelated tabs.
- [ ] Total runtime within 3:45–4:30 window.
- [ ] Closing logo card visible for full 4 seconds before fade.

## Export settings

- 1920×1080, 30 fps, H.264, ~10 Mbps for Loom-grade async share.
- Embed captions if `script/teleprompter.txt` was post-edited.
- Filename: `frontegg-mobile-mcp-showcase-v1.mp4`.
