#!/usr/bin/env node

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getConfig } from "../config/index.js";
import { createMCPServer } from "./create.js";

const MAX_BODY_BYTES = 1024 * 1024;
const MIN_TOKEN_LENGTH = 32;

/**
 * Constant-time string comparison (hashes first so lengths always match).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Extract the access token supplied with a request.
 * Accepts either `Authorization: Bearer <token>` on `/mcp`, or the token as a
 * path segment (`/mcp/<token>`) for clients that can only be given a URL.
 * @param {import("node:http").IncomingMessage} req
 * @param {string} pathname
 * @returns {string|null}
 */
export function extractToken(req, pathname) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const match = pathname.match(/^\/mcp\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonRpcError(res, status, message) {
  sendJson(res, status, { jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

/**
 * Create the HTTP server exposing the MCP endpoint (Streamable HTTP, stateless).
 * @param {Object} config - Application config from getConfig()
 * @param {Object} options
 * @param {string} options.authToken - Shared secret required on every MCP request
 * @returns {import("node:http").Server}
 */
export function createHttpServer(config, { authToken }) {
  if (!authToken || authToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(`MCP_AUTH_TOKEN is required and must be at least ${MIN_TOKEN_LENGTH} characters`);
  }

  return createServer((req, res) => routeRequest(req, res, config, authToken));
}

async function routeRequest(req, res, config, authToken) {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/healthz" || pathname === "/") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (pathname !== "/mcp" && !pathname.startsWith("/mcp/")) {
    return sendJson(res, 404, { error: "Not found" });
  }

  const token = extractToken(req, pathname);
  if (!token || !safeEqual(token, authToken)) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="ecowitt-mcp"');
    return jsonRpcError(res, 401, "Unauthorized");
  }

  // Stateless mode: no sessions, so only POST carries requests.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonRpcError(res, 405, "Method not allowed");
  }

  return handleMcpRequest(req, res, config);
}

async function handleMcpRequest(req, res, config) {
  try {
    const body = await readJsonBody(req);
    const server = await createMCPServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("Error handling MCP request:", error.message);
    if (!res.headersSent) {
      jsonRpcError(res, error.status ?? 500, error.status ? error.message : "Internal server error");
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    const config = getConfig();
    const port = Number(process.env.PORT ?? 3000);
    const httpServer = createHttpServer(config, { authToken: process.env.MCP_AUTH_TOKEN });
    httpServer.listen(port, () => {
      console.error(`Ecowitt MCP HTTP server listening on port ${port} (POST /mcp)`);
    });
    const shutdown = () => httpServer.close(() => process.exit(0));
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to start Ecowitt MCP HTTP server:", error.message);
    process.exit(1);
  }
}
