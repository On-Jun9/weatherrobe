#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDatabase } from "./db/connection.js";
import { createServer } from "./app.js";

const server = createServer();
const transport = new StdioServerTransport();

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});
process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});

await server.connect(transport);
