# MCP Tool Expansion Plan — Tier 1 + 2 + 3

**Target:** add 20 new tools to the Frontegg Mobile MCP server, taking it from **16 → 36 tools**.

**Strategy:** parallel dispatch of 4 backend agents, each owning one category, each working in an **isolated git worktree** off `master`. Each agent's task includes endpoint discovery, schema design, handler implementation, tests, and a self-contained smoke test. After all four complete, I (orchestrator) merge them into `master` sequentially, resolving the only common-edit conflict (`src/index.ts` tool registration).

**Realistic wallclock if dispatched in parallel:** 4–6 hours.
**Sequential single-agent wallclock:** 18–25 hours.

---

## Scope — 20 tools across 4 categories

### Category A — Users, tenants, audit (5 tools, owned by Agent A)

| Tool | Endpoint candidates (agent to verify) | Operations |
|---|---|---|
| `frontegg_users_list` | `GET /identity/resources/users/v3` | filters: `_email`, `_role`, `_filter`, `_offset`, `_limit` |
| `frontegg_users_invite` | `POST /identity/resources/users/v1` | body: `email`, `roleIds`, `name`, `metadata`. Sends invite email. |
| `frontegg_audit_logs` | `GET /audits/resources/audits/v1` or `/audits/v1` | filters: `start`, `end`, `userId`, `eventType` |
| `frontegg_tenants_list` | `GET /tenants/resources/tenants/v1` or `/tenants/v2` | optional: `_limit`, `_offset`, `_filter` |
| `frontegg_roles_list` + `frontegg_roles_create` | `GET /identity/resources/roles/v1`, `POST` same | list + create with `key`, `name`, `permissions[]` |

### Category B — Branding + applications (4 tools, owned by Agent B)

| Tool | Endpoint candidates | Operations |
|---|---|---|
| `frontegg_branding_get` | `GET /vendors/resources/branding/v1` (also try `/configurations/v1/branding`) | read theme, logos, colors |
| `frontegg_branding_update` | `PATCH` same path | update `primaryColor`, `logoUrl`, `name`, `theme` |
| `frontegg_applications_list` | `GET /applications/resources/applications/v1` (proven) | list apps in vendor environment |
| `frontegg_applications_create` | `POST` same path | body: `name`, `type`, `appURL`, `loginURL`, etc. |
| `frontegg_applications_get` | `GET /applications/resources/applications/v1/{id}` | get single app details |

### Category C — Auth config expansion (3 tools, owned by Agent C)

| Tool | Endpoint candidates | Operations |
|---|---|---|
| `frontegg_configure_password_policy` | `GET/POST /identity/resources/configurations/v1/password-policy` | min length, complexity, expiration, history |
| `frontegg_configure_lockout_policy` | `GET/POST /identity/resources/configurations/v1/lockout-policy` | failed attempts threshold, lockout duration |
| `frontegg_configure_security_rules` | `GET/POST /identity/resources/security-rules/v1` | geo-fencing, suspicious activity rules |

### Category D — Communications + extensibility (4 tools, owned by Agent D)

| Tool | Endpoint candidates | Operations |
|---|---|---|
| `frontegg_email_templates_list` | `GET /identity/resources/mail/v1/configs/emails` | list configured templates |
| `frontegg_email_templates_update` | `POST` same | update a specific template (welcome, MFA, password reset) |
| `frontegg_webhooks_list` | `GET /webhook/resources/configurations/v1` | list webhooks |
| `frontegg_webhooks_create` | `POST` same | body: `url`, `events[]`, `displayName` |

### Category E — Entitlements + API tokens (4 tools, owned by Agent E — **OPTIONAL**, can defer to V3 batch)

| Tool | Endpoint candidates | Operations |
|---|---|---|
| `frontegg_entitlements_list` | `GET /entitlements/resources/configurations/v1` (also try `/entitlements/v1`) | list features/entitlements |
| `frontegg_entitlements_create` | `POST` same | create feature with `key`, `name`, `description` |
| `frontegg_api_tokens_list` | `GET /identity/resources/users/api-tokens/v1` (or `/vendors/api-tokens/v1`) | list tokens |
| `frontegg_api_tokens_create` | `POST` same | create with `description`, scopes, roleIds |

### Explicitly OUT of scope (Frontegg API blockers)

- Enterprise SAML/OIDC SSO management — `/team/resources/sso/v1` returns 403 with vendor token. Needs tenant-scoped auth model the MCP doesn't yet support.
- Delete/disable existing social providers — no DELETE/PATCH endpoint exists on `/identity/resources/sso/v1` for vendor tokens.
- Update `configure_sessions` so writes actually persist — silently no-ops; documented limitation.

These three items remain in the backlog and can be revisited if Frontegg exposes the needed endpoints or we add a tenant-token auth flow.

---

## Per-tool task spec — what every agent must produce

For each tool the agent owns:

1. **Endpoint research (per-tool, ~10 min):**
   - Try the candidate endpoint(s) from the table above via curl against the real tenant (creds in `~/Showcase/frontegg-api-creds.env`)
   - Confirm GET works; confirm POST/PATCH semantics
   - If the candidate path 404s, probe variants (`/v2`, `/resources/v1`, `/team/...`, etc.) — same approach we used tonight for sessions/SSO
   - If no working path exists with vendor token → document as "vendor-token-blocked" in the tool description and skip the WRITE half (KEEP a `_list`/`_get` if read works)

2. **Implementation:**
   - New file under `src/tools/` (e.g. `src/tools/frontegg-users.ts` for the users tools — multiple related tools share one file)
   - Each tool: `name`, `description`, `inputSchema` (JSON Schema), `handler` async function
   - Reuse `fronteggApi()` from `src/tools/frontegg-api-client.ts` for HTTP — never duplicate the vendor-token-fetch logic
   - Register the tool in `src/index.ts` via `registry.add(TOOL_DEF, handlerFn)` (single line per tool)

3. **Schema rigor:**
   - Match the actual API request shape **exactly** — no schema lies (we hit this bug with `configure_sso` tonight)
   - Document required vs optional fields with `description` strings the LLM will use
   - If a field has an enum, declare it in both the JSON Schema `enum` and the zod parse

4. **Response handling:**
   - On WRITE that returns 201 with empty body → re-GET to return concrete state (we hit this with `configure_sessions` tonight)
   - On 4xx error → wrap in `FronteggApiError` (already done by api-client) and surface to LLM with useful context

5. **Tests:**
   - One test file per category (e.g. `tests/frontegg-users.test.ts`)
   - Cover: schema parsing (happy path + each required-field omission), HTTP success path (mock `fetch`), error paths (401/403/404), empty-body 200 handling for writes
   - Aim 4–8 tests per category

6. **Smoke test:**
   - Per category, a small `scripts/smoke-<category>.ts` that exercises every new tool end-to-end against the real tenant
   - Document the smoke command in the category's commit message

7. **README update:**
   - Add each new tool to the tools table in `README.md` with a one-line description
   - Bump the tool count badge (`Tools-16` → final number)

---

## Worktree + branching strategy

Each agent works in an **isolated git worktree** off the latest `master`:

```bash
cd ~/frontegg-mcp-support
git worktree add ../frontegg-mcp-A-users feat/tools-category-A-users
git worktree add ../frontegg-mcp-B-branding feat/tools-category-B-branding
git worktree add ../frontegg-mcp-C-authconfig feat/tools-category-C-authconfig
git worktree add ../frontegg-mcp-D-comms feat/tools-category-D-comms
```

The orchestrator (me) merges in this order to minimize conflicts on `src/index.ts`:
1. Agent A → master
2. Agent B → master (resolve index.ts adds)
3. Agent C → master (resolve)
4. Agent D → master (resolve)
5. Agent E → master (if dispatched)

After each merge: `npm run build && npm test` must stay green.

---

## Tier 3 — what we're explicitly NOT doing tonight

**Defer (Frontegg API blockers, separate research project):**
- Enterprise SAML/OIDC SSO management (needs tenant-scoped auth)
- SSO provider delete/disable (no endpoint exists for vendor token)
- Sessions endpoint write-that-persists (silently no-ops)

**Could be Category E (defer or include):**
- Entitlements CRUD — Frontegg has an entitlements API but it's complex (features, plans, customers, subscriptions). Building a clean MCP surface for it is a focused project, not a side-quest. **Recommend deferring.**
- API tokens — straightforward, but a security-sensitive surface (generates real bearer tokens). **Recommend deferring** so we can think through token scoping + storage carefully.

---

## Estimated wallclock

| Stage | Time |
|---|---|
| Each agent (research + build + tests + smoke): | 3–4 hours |
| Agents run in parallel: | 3–4 hours wallclock |
| Sequential merges + conflict resolution: | 30–45 min |
| README update + final commit: | 15 min |
| **Total wallclock if parallel:** | **4–5 hours** |
| **Total wallclock if sequential:** | **15–18 hours** |

---

## What I want explicit confirmation on before dispatching

1. **Dispatch all 4 parallel agents now?** Or just Agent A first as a pilot, then the rest after reviewing A's output?
2. **Include Category E (entitlements + api tokens)?** Or defer per the rationale above?
3. **Acceptable Frontegg API impact?** The smoke tests will create real test artifacts on your tenant — users, tenants, roles, webhooks, etc. They'll need manual cleanup after. We can either (a) skip mutation smoke tests for tonight (READ only), or (b) tag everything with a `mcp-smoke-test-` prefix so it's identifiable and cleanable.
4. **Block recording for this?** This is 4–5 hours of agent work. The showcase video is paused while it runs. Acceptable, or finish recording first then start this batch?

Reply with answers and I dispatch.
