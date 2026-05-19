/**
 * SDK compatibility shim for upstream-imported platform tools.
 *
 * Upstream code (frontegg/frontegg-mcp-server) imports `McpServer` from
 * `@modelcontextprotocol/sdk/server/mcp.js`. That module exists in SDK 1.x;
 * this server is on SDK 0.6.x, which only ships the low-level `Server` class.
 *
 * To avoid editing every upstream tool file, we re-export our RegistryAdapter
 * under the name `McpServer`. The adapter implements the exact `.tool()`
 * method signature upstream relies on, so the import-site change is the only
 * port-effort: each upstream file now imports `McpServer` from our shim
 * rather than the SDK module.
 *
 * Mechanically, the sed pass that ESM-ported upstream's relative imports
 * also rewrote the SDK import to point here.
 */

export { RegistryAdapter as McpServer } from './registry-adapter.js';
