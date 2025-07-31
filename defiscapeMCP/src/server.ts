import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { createServer } from "http";
import { z } from "zod";
// 1inch SDKのコンポーネントをインポート
import { SDK, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import dotenv from "dotenv";

// 環境変数の読み込み
dotenv.config();

// 環境変数からAPIキーを読み込み
const ONE_INCH_AUTH_KEY = process.env.ONE_INCH_AUTH_KEY || "YOUR_API_KEY_HERE";
const ONE_INCH_API_URL = "https://api.1inch.dev/fusion-plus";

// サーバー本体
const server = new McpServer({
  name: "DefiScape MCP Server",
  version: "0.1.0",
});

// 1inch SDKを初期化 (サーバー起動時に一度だけ実行)
const oneInchSdk = new SDK({
  url: ONE_INCH_API_URL,
  authKey: ONE_INCH_AUTH_KEY,
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
 * 新しいツール: DeFi収益機会検索 (findDeFiEarningOpportunities)
 * 1inch Fusion+ Quoter API を利用して、指定されたトークンペアとチェーン間での
 * クロスチェーンスワップの引用情報（Quoter）を提供します。
 * これにより、LLM利用者はDeFiにおける潜在的な収益機会を特定できます。
 */
server.registerTool(
  "findDeFiEarningOpportunities",
  {
    title: "Find DeFi Earning Opportunities via 1inch Fusion+",
    description: "Finds potential cross-chain swap earning opportunities by getting quotes from 1inch Fusion+ API. Provides details on estimated destination token amount and auction parameters. Use getTokenAddresses tool first to get valid token addresses. Example valid addresses: ETH on Ethereum: 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE, USDC on Ethereum: 0xA0b86a33E6417c5aD3dE73E45AA42FE19f23E96f",
    inputSchema: {
      // 送金元チェーンID。数値IDを使用
      srcChainId: z.number().describe("ID of the source blockchain (e.g., 1 for Ethereum, 137 for Polygon)"),
      // 送金先チェーンID。数値IDを使用
      dstChainId: z.number().describe("ID of the destination blockchain (e.g., 100 for Gnosis, 42161 for Arbitrum)"),
      // 送金元トークンアドレス。0xから始まる42文字の16進数アドレス
      srcTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address. Use getTokenAddresses tool to find valid addresses. Example: 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for ETH"),
      // 送金先トークンアドレス。0xから始まる42文字の16進数アドレス
      dstTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address. Use getTokenAddresses tool to find valid addresses. Example: 0x7F5c764cBc14f9669B88837ca1490cCa17c31607 for USDC on Optimism"),
      // 送金元トークン量。トークンの最小単位での文字列。例: 1 ETH = '1000000000000000000'
      amount: z.string().regex(/^\d+$/, "Amount must be a string of digits representing the token's smallest divisible unit"),
      // ウォレットアドレス
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address. Example: 0x742d35Cc6634C0532925a3b8d8B5Df09F24fA734"),
      // 推定を行うかどうか。デフォルトはfalse
      enableEstimate: z.boolean().optional().describe("If enabled, gets estimation from 1inch swap builder and generates quoteId. Default is false."),
      // 手数料をBPS形式で指定。1%は100bps
      fee: z.number().optional().describe("Fee in bps format, 1% is 100bps."),
    },
  },
  async (input, extra) => {
    try {
      const {
        srcChainId,
        dstChainId,
        srcTokenAddress,
        dstTokenAddress,
        amount,
        walletAddress,
        enableEstimate,
        fee,
      } = input;

      // QuoteParamsオブジェクトを構築
      const quoteParams: QuoteParams = {
        srcChainId,
        dstChainId,
        srcTokenAddress,
        dstTokenAddress,
        amount,
        walletAddress,
        enableEstimate: enableEstimate ?? false,
        // fee は QuoteParams に含まれていないため削除
      };

      // 1inch Fusion+ Quoter APIを呼び出し、quoteの詳細を取得
      const quote = await oneInchSdk.getQuote(quoteParams);

      // LLM向けに整形された情報を抽出
      const recommendedPreset = quote.recommendedPreset;
      const presetDetails = quote.presets[recommendedPreset];

      if (!presetDetails) {
        throw new Error(`No details found for recommended preset: ${recommendedPreset}`);
      }

      const responseContent = {
        quoteId: quote.quoteId,
        srcTokenAmount: quote.srcTokenAmount?.toString() || "0",
        dstTokenAmount: quote.dstTokenAmount?.toString() || "0",
        recommendedPreset: recommendedPreset,
        auctionDetails: {
          auctionDuration: presetDetails.auctionDuration?.toString() || "0",
          startAuctionIn: presetDetails.startAuctionIn?.toString() || "0",
          initialRateBump: presetDetails.initialRateBump?.toString() || "0",
          auctionStartAmount: presetDetails.auctionStartAmount?.toString() || "0",
          auctionEndAmount: presetDetails.auctionEndAmount?.toString() || "0",
          costInDstToken: presetDetails.costInDstToken?.toString() || "0",
          gasCostEstimate: (presetDetails as any).gasCost?.gasPriceEstimate || (presetDetails as any).gasBumpEstimate || "N/A",
        },
        // 価格情報（利用可能な場合）
        prices: quote.prices ? {
          srcTokenUsd: quote.prices.usd?.srcToken?.toString(),
          dstTokenUsd: quote.prices.usd?.dstToken?.toString(),
        } : undefined,
        // ボリューム情報（利用可能な場合）
        volume: quote.volume ? {
          srcTokenUsd: quote.volume.usd?.srcToken?.toString(),
          dstTokenUsd: quote.volume.usd?.dstToken?.toString(),
        } : undefined,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(responseContent, null, 2) }],
      };
    } catch (error) {
      console.error("Error finding DeFi earning opportunities:", error);
      let errorMessage = "An unknown error occurred while finding DeFi earning opportunities.";

      if (error instanceof Error) {
        errorMessage = error.message;
        // 1inch APIから返される可能性のある特定のエラーをチェック
        if (errorMessage.includes("Input data is invalid") || errorMessage.includes("400")) {
            errorMessage = "Input data is invalid. Please check source/destination chain IDs, token addresses, amount format, and wallet address. Token amounts must be in the correct decimal format (e.g., 10^18 for ETH).";
        } else if (errorMessage.includes("Cannot sync token")) {
            errorMessage = "Cannot sync token: The token either doesn't exist on the blockchain or isn't valid. Double check the correct chain ID in relation to the token used.";
        } else if (errorMessage.includes("Insufficient liquidity")) {
            errorMessage = "Insufficient liquidity: The aggregator couldn't find a swap route due to low liquidity. Make sure the liquidity pool has been queried and has at least 10k of a connector token, and check token decimals.";
        } else if (errorMessage.includes("500 internal server error")) {
            errorMessage = "Internal server error on 1inch API. This might be due to incorrectly formatted request parameters or underlying protocol issues. Ensure token amounts are in minimum divisible units (e.g., wei for ETH).";
        }
      }

      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
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
