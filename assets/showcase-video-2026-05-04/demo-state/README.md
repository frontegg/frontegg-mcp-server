# Demo state forks

The actual forks of `frontegg-ios-swift` and `frontegg-android-kotlin` live at
`~/Showcase/demo-state/` (outside this repo) so they don't pollute MCP server
git history.

Each fork has two branches:

- `demo-start` — config stripped to simulate a mid-integration customer
- `demo-end` — full canonical state (untouched main branch)

Reset between recording takes:

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift
git reset --hard demo-start
```

The exact strips applied on `demo-start` are documented in
`docs/superpowers/specs/2026-05-04-mcp-showcase-video-design.md` under
"Hero scene — exact 'broken state' for iOS / Kotlin".
