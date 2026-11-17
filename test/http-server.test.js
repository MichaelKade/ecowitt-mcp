import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearConfigCache, getConfig } from "../src/config/index.js";
import { createHttpServer } from "../src/server/http.js";

const TOKEN = "t".repeat(40);

describe("HTTP MCP server", () => {
  let server;
  let base;

  beforeAll(async () => {
    clearConfigCache();
    server = createHttpServer(getConfig(), { authToken: TOKEN });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const rpc = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    });

  const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

  it("refuses to start without a strong token", () => {
    expect(() => createHttpServer(getConfig(), { authToken: "short" })).toThrow(/MCP_AUTH_TOKEN/);
    expect(() => createHttpServer(getConfig(), {})).toThrow(/MCP_AUTH_TOKEN/);
  });

  it("serves an unauthenticated health check", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
  });

  it("rejects requests without a token", async () => {
    const res = await rpc("/mcp", listTools);
    expect(res.status).toBe(401);
  });

  it("rejects requests with the wrong token", async () => {
    expect((await rpc("/mcp", listTools, { Authorization: "Bearer nope" })).status).toBe(401);
    expect((await rpc("/mcp/nope", listTools)).status).toBe(401);
  });

  it("lists tools with a bearer token", async () => {
    const res = await rpc("/mcp", listTools, { Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = json.result.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_devices",
        "get_device_realtime_info",
        "get_device_historical_info",
        "get_current_datetime",
      ])
    );
  });

  it("accepts the token as a path segment", async () => {
    const res = await rpc(`/mcp/${TOKEN}`, listTools);
    expect(res.status).toBe(200);
  });

  it("calls a tool end to end", async () => {
    const res = await rpc(
      "/mcp",
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_current_datetime", arguments: {} } },
      { Authorization: `Bearer ${TOKEN}` }
    );
    const json = await res.json();
    expect(json.result.structuredContent.datetime).toMatch(/Z$/);
  });

  it("rejects GET on the MCP endpoint", async () => {
    const res = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(405);
  });
});
