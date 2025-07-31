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
    description: "Finds potential cross-chain swap earning opportunities by getting quotes from 1inch Fusion+ API. Provides details on estimated destination token amount and auction parameters. Input 'srcChainId' and 'dstChainId' should be NetworkEnum values (e.g., 1 for Ethereum, 100 for Gnosis, etc.).",
    inputSchema: z.object({
      // 送金元チェーンID。NetworkEnumまたは対応する数値IDを使用
      srcChainId: z.nativeEnum(NetworkEnum, {
        description: "ID of the source blockchain (e.g., NetworkEnum.ETHEREUM or 1)",
      }),
      // 送金先チェーンID。NetworkEnumまたは対応する数値IDを使用
      dstChainId: z.nativeEnum(NetworkEnum, {
        description: "ID of the destination blockchain (e.g., NetworkEnum.GNOSIS or 100)",
      }),
      // 送金元トークンアドレス。0xから始まる42文字の16進数アドレス
      srcTokenAddress: z.string().startsWith("0x").length(42, "Must be a 42-character hexadecimal address starting with 0x"),
      // 送金先トークンアドレス。0xから始まる42文字の16進数アドレス
      dstTokenAddress: z.string().startsWith("0x").length(42, "Must be a 42-character hexadecimal address starting with 0x"),
      // 送金元トークン量。トークンの最小単位（例: ETHならwei）での文字列。例: 1 ETH = '1000000000000000000'
      amount: z.string().regex(/^\d+$/, "Amount must be a string of digits representing the token's smallest divisible unit. E.g., '1000000000000000000' for 1 ETH (18 decimals)."),
      // ウォレットアドレス
      walletAddress: z.string().startsWith("0x").length(42, "Must be a 42-character hexadecimal address starting with 0x"),
      // 推定を行うかどうか。デフォルトはfalse
      enableEstimate: z.boolean().optional().describe("If enabled, gets estimation from 1inch swap builder and generates quoteId. Default is false."),
      // 手数料をBPS形式で指定。1%は100bps
      fee: z.number().optional().describe("Fee in bps format, 1% is 100bps."),
    }),
  },
  async (input) => {
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
        enableEstimate: enableEstimate ?? false, // 指定がなければfalseをデフォルトに
        fee: fee, // オプションの手数料
      };

      // 1inch Fusion+ Quoter APIを呼び出し、quoteの詳細を取得
      const quote = await oneInchSdk.getQuote(quoteParams);

      // LLM向けに整形された情報を抽出
      const recommendedPreset = quote.recommendedPreset; // 例: 'fast', 'medium', 'slow', 'custom'
      const presetDetails = quote.presets[recommendedPreset]; // 推奨プリセットの詳細を取得

      if (!presetDetails) {
        throw new Error(`No details found for recommended preset: ${recommendedPreset}`);
      }

      const responseContent = {
        quoteId: quote.quoteId, // クォートの一意の識別子
        srcTokenAmount: quote.srcTokenAmount, // クォートで使用された送金元トークン量
        dstTokenAmount: quote.dstTokenAmount, // 推定される受取トークン量
        recommendedPreset: recommendedPreset, // 推奨されるスワッププリセット
        auctionDetails: { // ダッチオークションの詳細
          auctionDuration: presetDetails.auctionDuration, // オークション期間（秒）
          startAuctionIn: presetDetails.startAuctionIn, // オークション開始までの時間（秒）
          initialRateBump: presetDetails.initialRateBump, // 初期レートの上昇値（最大値と最小値の差）
          auctionStartAmount: presetDetails.auctionStartAmount, // オークション開始時の数量
          auctionEndAmount: presetDetails.auctionEndAmount, // オークション終了時の数量
          costInDstToken: presetDetails.costInDstToken, // 目的地トークンでのコスト
          gasCostEstimate: presetDetails.gasCost?.gasPriceEstimate, // 推定ガス価格
        },
      };

      return {
        content: [{ type: "json", json: responseContent }],
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
