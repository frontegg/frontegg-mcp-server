# Recording-day checklist

Run this top-to-bottom before "Action" on the day of recording. Skip nothing.

## Environment

- [ ] Close all unrelated apps (Slack, Mail, Messages, browser tabs).
- [ ] Enable Do Not Disturb for the next 90 minutes.
- [ ] Close all browser windows except the Frontegg portal tab.
- [ ] Quit and relaunch Finder to clear stale notifications.
- [ ] Set desktop wallpaper to a clean solid color (avoid identifying
      info in the corner).
- [ ] Hide dock auto-show: `defaults write com.apple.dock autohide -bool
      true && killall Dock`.

## Display

- [ ] Plug in any external monitor. Set primary display to the laptop
      screen at 1920×1200 (Retina default).
- [ ] If using two displays, position Claude Desktop on primary, Xcode +
      Simulator on secondary, recording captures primary only.

## App pre-launch

- [ ] iOS Simulator: boot any iPhone 15+ device. Wait until home screen
      idle. Don't show the spinner.
- [ ] Android Emulator: boot a Pixel-class AVD. Wait for home idle.
- [ ] Xcode: open `~/Showcase/demo-state/frontegg-ios-swift/example/`.
      Build target → iPhone simulator. Don't run yet.
- [ ] Android Studio: open
      `~/Showcase/demo-state/frontegg-android-kotlin/example/`. Wait
      for sync (will fail — that's OK on demo-start).
- [ ] Frontegg portal: log in. Navigate to MFA settings page. Leave the
      tab focused.

## Claude Desktop dual-window setup

- [ ] Quit Claude Desktop fully (`pkill -f Claude` if needed).
- [ ] Copy `assets/.../claude-desktop-configs/mcp-off.json` to
      `~/Library/Application Support/Claude/claude_desktop_config.json`.
- [ ] Launch Claude Desktop. Confirm sidebar shows NO MCP tools.
- [ ] Cmd+N for a new chat. Position window: left half of screen.
- [ ] Quit Claude Desktop again.
- [ ] Copy `assets/.../claude-desktop-configs/mcp-on.json` over the
      same path.
- [ ] **Add the API credential `env` block** to that file —
      Claude Desktop does NOT do shell expansion, so values must be
      literal. Source `~/Showcase/frontegg-api-creds.env` (mode 600,
      outside the repo) for the values. Final structure:

      ```json
      {
        "mcpServers": {
          "frontegg-mobile": {
            "command": "node",
            "args": ["/Users/dianakhortiuk/frontegg-mcp-support/dist/index.js"],
            "env": {
              "FRONTEGG_CLIENT_ID": "<paste from creds file>",
              "FRONTEGG_SECRET": "<paste from creds file>"
            }
          }
        }
      }
      ```

- [ ] Restart Claude Desktop.
- [ ] Confirm sidebar shows `frontegg-mobile` server connected with all
      15 tools listed.
- [ ] Cmd+N for new chat. Position window: right half of screen.
- [ ] Visual check: both windows visible side-by-side, both at the new
      chat composer.
- [ ] Smoke-test the MFA tool from the right window:
      `frontegg_configure_mfa get`. Should return the current policy
      JSON. If it errors, the env block is wrong.

## Demo state pre-flight

- [ ] `cd ~/Showcase/demo-state/frontegg-ios-swift && git reset --hard
      demo-start && git clean -fd`.
- [ ] `cd ~/Showcase/demo-state/frontegg-android-kotlin && git reset
      --hard demo-start && git clean -fd`.
- [ ] Validate iOS findings (expect 5):
      `npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-ios-swift/demo`
- [ ] Validate Android findings (expect 5, **scoped to `app/`**):
      `npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-android-kotlin/app`
- [ ] Note: when typing the Android prompt during recording, the project
      path must point at `app/` (not the repo root) — sibling demo
      modules at the repo root would otherwise mask findings.

## MCP-off side prompt-hardening pre-flight

- [ ] Type the Scene 2 prompt into LEFT (MCP-off) window. Wait for
      response.
- [ ] Read the response. **Does it identify the right files and lines?**
  - If YES → swap to the harder prompt variant from `prompts.md`.
      Re-test. Loop until LEFT side is plausibly weaker.
  - If NO → record the prompt actually used in the run-day notes
      below. Proceed.
- [ ] Take a screenshot of the LEFT response for editor reference.
- [ ] Cmd+K (clear chat) in LEFT window. Recording starts from a fresh
      composer.

## Right-side warmup (cache the canonical fetch)

- [ ] Type the Scene 2 prompt into RIGHT window once. Wait for findings.
- [ ] This warms the GitHub fetch cache (6h TTL) so the recorded take
      doesn't show network spinners.
- [ ] Cmd+K to clear. Right window now has fresh composer + warm cache.

## Run-day notes

| Field | Value |
|---|---|
| Recording date | _____ |
| Operator | _____ |
| Final Scene 2 prompt used | _____ |
| MCP commit pinned | _____ |
| Notes / deviations | _____ |
