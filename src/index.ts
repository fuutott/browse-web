#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestPayloadSchema } from "./types.js";
import { Fetcher } from "./Fetcher.js";
import process from "process";
import { downloadLimit } from "./types.js";

// Create and configure the MCP server
function createServer() {
  const server = new Server(
    {
      name: "fetch-url",
      version: "0.2.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "fetch-url",
          description: "Fetch a website and return its title, headings, links, and text content in structured format",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "URL of the website to fetch",
              },
              headers: {
                type: "object",
                description: "Optional headers to include in the request",
              },
              max_length: {
                type: "number",
                description: `Maximum number of characters to return for content (default: ${downloadLimit})`,
              },
              start_index: {
                type: "number",
                description: "Start content from this character index (default: 0)",
              },
              findInPage: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Optional search terms to prioritize which links and content to return",
              },
              maxLinks: {
                type: "number",
                description: "Maximum number of links to extract from the page (default: 40)",
              },
            },
            required: ["url"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const validatedArgs = RequestPayloadSchema.parse(args);

    if (request.params.name === "fetch-url") {
      const fetchResult = await Fetcher.fetch(validatedArgs);
      return fetchResult;
    }
    throw new Error("Tool not found");
  });

  return server;
}

// Start server with stdio transport
async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Fetch Server (stdio) started");
}

// Start server with HTTP transport
async function startHttpServer() {
  const app = express();
  app.use(express.json());

  // Configure CORS to expose Mcp-Session-Id header for browser-based clients
  app.use(
    cors({
      origin: "*", // Allow all origins - adjust as needed for production
      exposedHeaders: ["Mcp-Session-Id"],
    })
  );

  // Handle MCP requests
  app.post("/mcp", async (req, res) => {
    const server = createServer();
    
    try {
      // Create a new transport for each request to prevent request ID collisions
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Clean up transport when request closes
      res.on("close", () => {
        transport.close();
        server.close();
      });

      // Connect server to transport
      await server.connect(transport);
      
      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // Handle unsupported methods for /mcp endpoint
  app.get("/mcp", async (req, res) => {
    console.log("Received GET MCP request");
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for MCP requests.",
      },
      id: null,
    });
  });

  app.delete("/mcp", async (req, res) => {
    console.log("Received DELETE MCP request");
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for MCP requests.",
      },
      id: null,
    });
  });

  // Start the HTTP server
  const PORT = parseInt(process.env.PORT || "3037");
  
  app.listen(PORT, () => {
    console.log(`MCP Fetch Server (HTTP) running on http://localhost:${PORT}/mcp`);
    console.log(`Use this URL as the MCP server endpoint in your client configuration.`);
  }).on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}

async function main() {
  // Check command line arguments or environment variable to determine transport
  const args = process.argv.slice(2);
  const transportMode = args.includes("--http") || args.includes("-h") || process.env.MCP_TRANSPORT === "http" ? "http" : "stdio";

  if (transportMode === "http") {
    await startHttpServer();
  } else {
    await startStdioServer();
  }
}

// Handle server shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down MCP server...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
