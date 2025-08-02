
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SDK, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import dotenv from "dotenv";

// Initialize 1inch SDK with API key and URL
dotenv.config();
const ONE_INCH_AUTH_KEY = process.env.ONE_INCH_AUTH_KEY || "YOUR_API_KEY_HERE";
const ONE_INCH_API_URL = "https://api.1inch.dev/fusion-plus";
const oneInchSdk = new SDK({
  url: ONE_INCH_API_URL,
  authKey: ONE_INCH_AUTH_KEY,
});

export function registerDefiEarningOpportunities(server: McpServer) {

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

}