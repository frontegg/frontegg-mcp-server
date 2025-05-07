#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { registerAllTools } from "./tools/index";
import { logger } from "./utils/logger";
import { getValidToken } from "./auth";
import express, { Request, Response } from "express";

/**
 * Simple stateless Streamable‑HTTP server.
 *
 *  • Exposes a single endpoint `/mcp` that accepts POST requests containing JSON‑RPC payloads.
 *  • No session management (sessionIdGenerator: undefined) – ideal for horizontally‑scaled deployments.
 *  • GET requests are rejected with HTTP 405 (spec‑compliant when SSE streaming is not offered).
 */
async function main(): Promise<void> {
  // Ensure we have a valid Frontegg vendor token cached.
  await getValidToken();

  logger.info("Starting Frontegg MCP HTTP Server…");

  // Create the MCP server and register all Frontegg tools.
  const server = new McpServer({
    name: "Frontegg-MCP-HTTP-Server",
    version: "1.0.0",
  });
  registerAllTools(server);

  // In‑memory map: sessionId ➜ transport (stateful SSE)
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Select port (env PORT or CLI arg ‑‑port n, default 3000)
  const cliPort = (() => {
    const idx = process.argv.indexOf("--port");
    if (idx !== -1 && process.argv[idx + 1]) {
      const p = parseInt(process.argv[idx + 1], 10);
      if (!isNaN(p)) return p;
    }
    return undefined;
  })();
  const PORT =
    cliPort ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  const app = express();

  app.use(express.json());

  // POST /mcp – create new transport or dispatch to existing one
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Existing session
      if (sessionId) {
        const t = transports[sessionId];
        if (!t) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Unknown session id" },
            id: null,
          });
          return;
        }
        await t.handleRequest(req as any, res as any, req.body);
        return;
      }

      // No session header → create new transport (expects initialize request)
      const t = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await server.connect(t);
      await t.handleRequest(req as any, res as any, req.body);

      if (t.sessionId) {
        transports[t.sessionId] = t;
        t.onclose = () => {
          delete transports[t.sessionId!];
        };
      }
    } catch (err) {
      logger.error(`Error handling MCP request: ${String(err)}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET /mcp – open SSE stream for existing session
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // If no session yet, indicate that SSE isn't available at this point so
    // Cursor will fall back to POST / initialize.
    if (!sessionId) {
      return res.status(405).set("Allow", "POST").send("Method Not Allowed");
    }

    const t = transports[sessionId];
    if (!t) {
      return res.status(400).json({ error: "Unknown session id" });
    }

    try {
      await t.handleRequest(req as any, res as any);
    } catch (err) {
      logger.error(`Error opening SSE stream: ${String(err)}`);
      if (!res.headersSent) {
        res.status(500).send("Failed to open SSE stream");
      }
    }
  });

  // DELETE /mcp – close existing session
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing mcp-session-id header" },
        id: null,
      });
    }

    const t = transports[sessionId];
    if (!t) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unknown session id" },
        id: null,
      });
    }

    try {
      // Close the transport and remove it from the map
      await t.close();
      delete transports[sessionId];
      logger.info(`Closed session ${sessionId}`);
      res.status(204).send(); // No Content
    } catch (err) {
      logger.error(`Error closing session ${sessionId}: ${String(err)}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Fallback 404
  app.use((_req: Request, res: Response) => res.status(404).send("Not Found"));

  app.listen(PORT, () => {
    logger.info(`Frontegg MCP HTTP Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.error(`Failed to start HTTP MCP server: ${String(err)}`);
  process.exit(1);
});
