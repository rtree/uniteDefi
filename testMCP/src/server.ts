// PRJROOT/testMCP/src/server.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpServerTransport } from "@modelcontextprotocol/sdk/server/http.js";
import { z } from "zod";

// サーバー本体
const server = new McpServer({
  name: "demo-server",
  version: "1.0.0",
});

/**
 * 1) Tool ─ 計算機 (add)
 *    LLM から {"a":1,"b":2} が届くと 3 を返す
 */
server.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  }),
);

/**
 * 2) Resource ─ 動的あいさつ
 *    URI 例: greeting://Alice → "Hello, Alice!"
 */
server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource",
    description: "Dynamic greeting generator",
  },
  async (uri, { name }) => ({
    contents: [{ uri: uri.href, text: `Hello, ${name}!` }],
  }),
);

// HTTPサーバーとして起動（ポート3000で待ち受け）
const transport = new HttpServerTransport({
  port: 3000
});
await server.connect(transport);

console.log('MCP Server is running on http://localhost:3000');
