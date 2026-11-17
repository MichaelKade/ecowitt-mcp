#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "../config/index.js";
import { createMCPServer } from "./create.js";

export { createMCPServer };

try {
  // Create and configure the MCP server instance
  const config = getConfig();
  const server = await createMCPServer(config);

  // Initialize stdio transport and establish connection
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Ecowitt MCP Server started successfully");
} catch (error) {
  console.error("Failed to start Ecowitt MCP Server:", error.message);
  process.exit(1);
}
