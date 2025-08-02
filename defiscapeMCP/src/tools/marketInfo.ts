
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

export function registerMarketDataResource(server: McpServer) {
  /**
   * 6) Resource ─ リアルタイム市場データ
   *    URI 例: market-data://chains/1/prices → Ethereum上のトークン価格情報
   */
  server.registerResource(
    "market-data",
    new ResourceTemplate("market-data://{dataType}/{chainId?}/{tokenAddress?}", { list: undefined }),
    {
      title: "Real-time Market Data Resource",
      description: "Access to real-time token prices, gas prices, and market conditions for resolver decision making",
    },
    async (uri, { dataType, chainId, tokenAddress }) => {
      try {
        // Ensure chainId is a string, handle case where it might be string[]
        const chainIdStr = Array.isArray(chainId) ? chainId[0] : chainId;
        
        if (dataType === "escrow-factory" && chainIdStr) {
          // エスクローファクトリーアドレスの取得
          const response = await fetch(`${ONE_INCH_API_URL}/orders/v1.0/order/escrow?chainId=${chainIdStr}`, {
            headers: {
              'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
            },
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const escrowData = await response.json();
          
          return {
            contents: [{ 
              uri: uri.href, 
              text: JSON.stringify({
                chainId: parseInt(chainIdStr),
                escrowFactoryAddress: escrowData.address,
                lastUpdated: new Date().toISOString(),
              }, null, 2),
              mimeType: "application/json"
            }],
          };
        } else {
          throw new Error(`Unsupported data type: ${dataType}`);
        }
      } catch (error) {
        console.error("Error fetching market data:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          contents: [{ 
            uri: uri.href, 
            text: `Error: ${errorMessage}`,
            mimeType: "text/plain"
          }],
        };
      }
    },
  );
}
