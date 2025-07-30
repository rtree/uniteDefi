import { MCPServer } from "@modelcontextprotocol/sdk/dist/index.js";
import { StdioTransport } from "@modelcontextprotocol/sdk/dist/transport/stdio.js";

// サーバを作成
const server = new MCPServer(
  {
    name: "hello-mcp",
    version: "1.0.0",
    description: "Simple MCP server with SDK",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツールを登録
server.addTool({
  name: "hello",
  description: "Say hello",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" }
    },
    required: ["name"]
  },
  handler: async ({ name }) => {
    return { result: `Hello, ${name}!` };
  }
});

// 標準入出力で待ち受け
await server.connect(new StdioTransport());
