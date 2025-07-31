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

/**
 * 3) Tool ─ Get Token Addresses
 *    Fetch available token addresses from 1inch API for a specific chain
 */
server.registerTool(
  "getTokenAddresses",
  {
    title: "Get Token Addresses",
    description: "Fetch available token addresses from 1inch API for a specific blockchain. Returns common tokens like ETH, USDC, USDT, etc.",
    inputSchema: {
      chainId: z.number().describe("Chain ID (1 = Ethereum, 10 = Optimism, 137 = Polygon, 42161 = Arbitrum)"),
      limit: z.number().optional().default(20).describe("Maximum number of tokens to return (default: 20)")
    },
  },
  async ({ chainId, limit = 20 }) => {
    try {
      const response = await fetch(`https://api.1inch.dev/swap/v6.1/${chainId}/tokens`, {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY_HERE', // Note: Replace with actual API key
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Extract and format token information
      const tokens = Object.entries(data.tokens || {})
        .slice(0, limit)
        .map(([address, token]: [string, any]) => ({
          address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI
        }));

      const responseText = {
        chainId,
        totalTokens: Object.keys(data.tokens || {}).length,
        tokens,
        commonExamples: {
          ethereum: {
            ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            USDC: "0xA0b86a33E6417c5aD3dE73E45AA42FE19f23E96f",
            USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
          },
          optimism: {
            ETH: "0x4200000000000000000000000000000000000006",
            USDC: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
            OP: "0x4200000000000000000000000000000000000042"
          }
        }
      };

      return {
        content: [{ type: "text", text: JSON.stringify(responseText, null, 2) }],
      };
    } catch (error) {
      console.error("Error fetching token addresses:", error);
      
      // Provide fallback common token addresses
      const fallbackTokens = {
        1: { // Ethereum
          ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          USDC: "0xA0b86a33E6417c5aD3dE73E45AA42FE19f23E96f",
          USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
          WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          "1INCH": "0x111111111117dc0aa78b770fa6a738034120c302"
        },
        10: { // Optimism
          ETH: "0x4200000000000000000000000000000000000006",
          USDC: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
          OP: "0x4200000000000000000000000000000000000042",
          WETH: "0x4200000000000000000000000000000000000006"
        },
        137: { // Polygon
          MATIC: "0x0000000000000000000000000000000000001010",
          USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
          USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
          WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"
        }
      };

      const chainTokens = fallbackTokens[chainId as keyof typeof fallbackTokens] || {};
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            error: "Could not fetch from 1inch API, using fallback data",
            chainId,
            fallbackTokens: chainTokens,
            note: "These are common token addresses. For live data, ensure API key is configured."
          }, null, 2) 
        }],
      };
    }
  },
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
