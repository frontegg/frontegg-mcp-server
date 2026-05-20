# Exact prompts to type during recording

Copy-paste-ready. Do **not** improvise.

## Scene 2 — A/B + Hero (typed into BOTH Claude Desktop windows)

```
This is the Frontegg iOS example. Login redirects to Safari and never comes
back to the app. What's wrong with the project — be specific about file names
and exact config lines.
```

> The same prompt is typed verbatim into both windows — left (MCP off) and
> right (MCP on). Comparison only works if the prompt is identical.

## Scene 4 — Kotlin breadth (typed into MCP-on Claude Desktop only)

```
Same prompt, but for the Frontegg Android example app at
~/Showcase/demo-state/frontegg-android-kotlin/app. Login fails silently.
What's missing — be specific about file names.
```

> **Path note:** the Android example repo contains sibling demo modules
> (multi-region, embedded, applicationId) at the repo root that have
> their own manifestPlaceholders configured for Frontegg. Pointing MCP at
> the repo root would mask findings for the `app/` module. Always point
> at `~/Showcase/demo-state/frontegg-android-kotlin/app`.

## Scene 5 — Day-2 MFA (typed into MCP-on Claude Desktop)

Two consecutive prompts:

**5a:**

```
Show me the current MFA policy for my Frontegg environment.
```

**5b (after the response renders):**

```
Now force MFA for everyone except SSO users.
```

## Hardening note

If during pre-shoot validation the MCP-OFF window in Scene 2 returns an
answer that's too good (model has memorized the right config), replace the
Scene 2 prompt with the harder variant:

```
What's missing from my Frontegg iOS Info.plist for deep-link return on
iOS 17 with Associated Domains v2, given that the Xcode project has a custom
URL scheme but the redirect still opens Safari?
```

Document the exact prompt you used in the recording-checklist.md run-day notes.
