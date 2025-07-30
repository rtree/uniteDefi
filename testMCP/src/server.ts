import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { createServer } from "http";
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

// HTTPサーバーを作成
const httpServer = createServer();

// トランスポートの設定
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // ステートレスモードに変更
  enableJsonResponse: true, // JSONレスポンスを有効化
  enableDnsRebindingProtection: false,
  allowedOrigins: ['*'],
});

// サーバーの起動とトランスポートの接続を同期して行う
async function startServer() {
  try {
    await server.connect(transport);

    httpServer.on('request', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

      console.log('\n=== Request ===');
      console.log('Request Method:', req.method);
      console.log('Request Headers:', req.headers);

      // レスポンスログ用の変数
      let responseBody = '';

      // finishイベントでレスポンス情報をログ出力
      res.on('finish', () => {
        console.log('\n=== Response ===');
        console.log('Status Code:', res.statusCode);
        console.log('Response Headers:', res.getHeaders());
        if (responseBody) {
          console.log('Response Body:', responseBody);
        }
      });

      // writeをオーバーライドしてレスポンスボディを取得
      const originalWrite = res.write.bind(res);
      res.write = function(chunk: any, ...args: any[]): boolean {
        if (chunk) {
          responseBody += chunk.toString();
        }
        return originalWrite(chunk, ...args);
      };

      const originalEnd = res.end.bind(res);
      res.end = function(chunk?: any, ...args: any[]): any {
        if (chunk) {
          responseBody += chunk.toString();
        }
        return originalEnd(chunk, ...args);
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
          console.log('Request Body:', body);
          try {
            const jsonRpc = JSON.parse(body);
            transport.handleRequest(req, res, jsonRpc);
          } catch (error) {
            console.error('Error handling request:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32700,
                message: 'Parse error'
              },
              id: null
            }));
          }
        });
      } else {
        transport.handleRequest(req, res);
      }
    });

    httpServer.listen(3000, () => {
      console.log('MCP Server is running on http://localhost:3000');
    });

  } catch (error) {
    console.error('Server error:', error);
    process.exit(1);
  }
}

startServer();
