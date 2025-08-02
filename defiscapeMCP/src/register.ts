import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SDK, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import dotenv from "dotenv";
import { registerExample } from "./tools/example.js"; // Import example tools if needed

// Initialize 1inch SDK with API key and URL
dotenv.config();
const ONE_INCH_AUTH_KEY = process.env.ONE_INCH_AUTH_KEY || "YOUR_API_KEY_HERE";
const ONE_INCH_API_URL = "https://api.1inch.dev/fusion-plus";
const oneInchSdk = new SDK({
  url: ONE_INCH_API_URL,
  authKey: ONE_INCH_AUTH_KEY,
});


export function registerAllTools(server: McpServer) {

  registerExample(server);

  
  /**
   * 4) Resource ─ アクティブなクロスチェーンオーダー情報
   */
  server.registerResource(
    "fusion-orders",
    new ResourceTemplate("fusion-orders://{orderType}", { list: undefined }),
    {
      title: "1inch Fusion+ Orders Resource",
      description: "Access to active cross-chain swap orders for resolver opportunities",
    },
    async (uri, { orderType }) => {
      // ...existing fusion-orders implementation...
      try {
        if (orderType === "active") {
          const activeOrders = await oneInchSdk.getActiveOrders({ page: 1, limit: 100 });
          
          const orderData = {
            totalOrders: activeOrders.items?.length || 0,
            orders: activeOrders.items?.map(order => ({
              orderHash: order.orderHash,
              srcChainId: order.srcChainId,
              dstChainId: order.dstChainId,
              makerAsset: order.order.makerAsset,
              takerAsset: order.order.takerAsset,
              makingAmount: order.order.makingAmount,
              takingAmount: order.order.takingAmount,
              auctionStartDate: order.auctionStartDate,
              auctionEndDate: order.auctionEndDate,
              remainingMakerAmount: order.remainingMakerAmount,
            })) || [],
            lastUpdated: new Date().toISOString(),
          };

          return {
            contents: [{ 
              uri: uri.href, 
              text: JSON.stringify(orderData, null, 2),
              mimeType: "application/json"
            }],
          };
        } else {
          throw new Error(`Unknown order type: ${orderType}`);
        }
      } catch (error) {
        console.error("Error fetching fusion orders:", error);
        return {
          contents: [{ 
            uri: uri.href, 
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            mimeType: "text/plain"
          }],
        };
      }
    },
  );

  // Register remaining tools...
  registerAnalyzeProfitTool(server);
  registerScanAllProfitTool(server);
  registerMarketDataResource(server);
  registerGetActiveFusionOrdersTool(server);
}

// Helper functions for tool registration...
function registerAnalyzeProfitTool(server: McpServer) {
  server.registerTool(
    "analyzeProfitOpportunity",
    {
      title: "Analyze Profit Opportunity for Specific Order",
      description: "Analyzes the profitability of fulfilling a specific cross-chain order by calculating potential profit margins, gas costs, and optimal timing based on auction mechanics",
      inputSchema: {
        orderHash: z.string().describe("The order hash to analyze for profit opportunities"),
        resolverAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address for the resolver wallet"),
        maxGasPrice: z.number().optional().describe("Maximum gas price (in Gwei) the resolver is willing to pay"),
        minProfitThreshold: z.number().optional().describe("Minimum profit threshold in USD to consider the opportunity viable"),
      },
    },
    async (input) => {
      // ...existing analyzeProfitOpportunity implementation...
      try {
        const { orderHash, resolverAddress, maxGasPrice, minProfitThreshold } = input;

        const orderStatus = await oneInchSdk.getOrderStatus(orderHash);
        
        if (orderStatus.status !== "pending") {
          return {
            content: [{ type: "text", text: `Order ${orderHash} is not in pending status. Current status: ${orderStatus.status}` }],
          };
        }

        const activeOrders = await oneInchSdk.getActiveOrders({ page: 1, limit: 500 });
        const activeOrder = activeOrders.items?.find(order => order.orderHash === orderHash);
        
        if (!activeOrder) {
          return {
            content: [{ type: "text", text: `Active order with hash ${orderHash} not found` }],
          };
        }

        const order = orderStatus.order;
        const quoteParams = {
          srcChainId: activeOrder.srcChainId,
          dstChainId: activeOrder.dstChainId,
          srcTokenAddress: order.makerAsset,
          dstTokenAddress: order.takerAsset,
          amount: order.makingAmount,
          walletAddress: resolverAddress,
          enableEstimate: true,
        };

        const quote = await oneInchSdk.getQuote(quoteParams);
        
        const recommendedPreset = quote.recommendedPreset;
        const presetDetails = quote.presets[recommendedPreset];
        
        const gasEstimate = presetDetails?.costInDstToken ? Number(presetDetails.costInDstToken) : 0;
        const gasCostWei = BigInt(gasEstimate) * BigInt(maxGasPrice ? maxGasPrice * 1e9 : 20e9);
        const gasCostEth = Number(gasCostWei) / 1e18;
        
        const inputAmount = Number(order.makingAmount) / 1e18;
        const outputAmount = Number(quote.dstTokenAmount) / 1e18;
        const potentialProfit = inputAmount - outputAmount - gasCostEth;
        
        const currentTime = Math.floor(Date.now() / 1000);
        const auctionStartTime = orderStatus.auctionStartDate || 0;
        const auctionDuration = orderStatus.auctionDuration || 0;
        const timeRemaining = (auctionStartTime + auctionDuration) - currentTime;
        
        const analysis = {
          orderHash,
          profitable: potentialProfit > (minProfitThreshold || 0),
          estimatedProfit: potentialProfit,
          gasCost: gasCostEth,
          inputAmount,
          outputAmount,
          auctionInfo: {
            timeRemaining: Math.max(0, timeRemaining),
            isActive: timeRemaining > 0,
            startTime: auctionStartTime,
            duration: auctionDuration
          },
          recommendation: potentialProfit > (minProfitThreshold || 0) 
            ? "Proceed with fulfillment" 
            : "Skip - insufficient profit margin"
        };

        return {
          content: [{
            type: "text",
            text: `Profit Analysis for Order ${orderHash}:\n\n` +
                  `🔍 Order Status: ${orderStatus.status}\n` +
                  `💰 Estimated Profit: ${analysis.estimatedProfit.toFixed(6)} ETH\n` +
                  `⛽ Gas Cost: ${analysis.gasCost.toFixed(6)} ETH\n` +
                  `📥 Input Amount: ${analysis.inputAmount.toFixed(6)} tokens\n` +
                  `📤 Output Amount: ${analysis.outputAmount.toFixed(6)} tokens\n` +
                  `⏰ Time Remaining: ${analysis.auctionInfo.timeRemaining}s\n` +
                  `✅ Profitable: ${analysis.profitable ? 'Yes' : 'No'}\n` +
                  `📋 Recommendation: ${analysis.recommendation}`
          }],
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: "text", text: `Error analyzing profit opportunity: ${errorMessage}` }],
        };
      }
    },
  );
}

// Continue with other tool registration functions...
function registerScanAllProfitTool(server: McpServer) {
  /**
   * 5) Tool ─ バッチ収益機会スキャナー
   *    全アクティブオーダーを一括でスキャンし、最も収益性の高い機会を特定
   */
  server.registerTool(
    "scanAllProfitOpportunities",
    {
      title: "Scan All Active Orders for Profit Opportunities",
      description: "Scans all active cross-chain orders and returns a ranked list of the most profitable opportunities for resolvers. This is the 'one-shot' profit opportunity finder.",
      inputSchema: {
        resolverAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address for the resolver wallet"),
        maxGasPrice: z.number().optional().describe("Maximum gas price (in Gwei) the resolver is willing to pay"),
        minProfitThreshold: z.number().optional().describe("Minimum profit threshold in USD to consider opportunities viable"),
        targetChains: z.array(z.number()).optional().describe("Array of chain IDs to focus on (e.g., [1, 137, 42161])"),
        maxResults: z.number().default(10).describe("Maximum number of top opportunities to return"),
      },
    },
    async (input) => {
      try {
        const { 
          resolverAddress, 
          maxGasPrice, 
          minProfitThreshold, 
          targetChains, 
          maxResults 
        } = input;
  
        console.log("Starting comprehensive profit opportunity scan...");
  
        // 1. 全アクティブオーダーを取得
        const activeOrders = await oneInchSdk.getActiveOrders({ 
          page: 1, 
          limit: 500 // 最大取得数
        });
  
        if (!activeOrders.items || activeOrders.items.length === 0) {
          return {
            content: [{ type: "text", text: "No active orders found for analysis." }],
          };
        }
  
        console.log(`Found ${activeOrders.items.length} active orders. Analyzing...`);
  
        // 2. フィルタリング（オプション）
        let ordersToAnalyze = activeOrders.items;
        
        if (targetChains && targetChains.length > 0) {
          ordersToAnalyze = ordersToAnalyze.filter(order => 
            targetChains.includes(order.srcChainId) || targetChains.includes(order.dstChainId)
          );
        }
  
        // 3. 各オーダーの収益性を並行分析
        const profitAnalyses = await Promise.allSettled(
          ordersToAnalyze.slice(0, 50).map(async (order) => { // 最初の50件のみ分析（レート制限対策）
            try {
              // オーダーステータスの確認
              const orderStatus = await oneInchSdk.getOrderStatus(order.orderHash);
              
              if (orderStatus.status !== "pending") {
                return null; // pendingでないオーダーはスキップ
              }
  
              // 見積もりパラメータの構築（アクティブオーダーからチェーンIDを使用）
              const quoteParams = {
                srcChainId: order.srcChainId,
                dstChainId: order.dstChainId,
                srcTokenAddress: order.order.takerAsset,
                dstTokenAddress: order.order.makerAsset,
                amount: order.order.takingAmount,
                walletAddress: resolverAddress,
                enableEstimate: true,
              };
  
              // 現在の市場価格取得（エラーハンドリング付き）
              let currentQuote;
              try {
                currentQuote = await oneInchSdk.getQuote(quoteParams);
              } catch (quoteError) {
                const errorMessage = quoteError instanceof Error ? quoteError.message : 'Unknown quote error';
                console.warn(`Failed to get quote for order ${order.orderHash}:`, errorMessage);
                return null;
              }
  
              // オークション進行度の計算
              const now = Date.now();
              const auctionStart = new Date(order.auctionStartDate).getTime();
              const auctionDuration = orderStatus.auctionDuration * 1000; // ミリ秒に変換
              const auctionProgress = Math.min((now - auctionStart) / auctionDuration, 1);
  
              // 基本的な収益性計算
              const expectedOutput = BigInt(order.order.makingAmount);
              const marketInput = BigInt(currentQuote.dstTokenAmount || "0");
              const rawProfit = expectedOutput - marketInput;
              const profitMarginPercent = marketInput > 0n ? 
                Number(rawProfit * 100n / marketInput) : 0;
  
              // スコアリング（0-100）
              let score = 0;
              const factors = [];
  
              // 利益マージンスコア
              if (profitMarginPercent > 0) {
                score += Math.min(profitMarginPercent * 10, 40); // 最大40点
                factors.push(`Profit margin: ${profitMarginPercent.toFixed(2)}%`);
              }
  
              // オークション進行度スコア
              if (auctionProgress > 0.5) {
                score += (auctionProgress - 0.5) * 60; // 最大30点
                factors.push(`Auction progress: ${(auctionProgress * 100).toFixed(1)}%`);
              }
  
              // ガス価格考慮
              const gasEstimate = currentQuote.presets?.[currentQuote.recommendedPreset]?.costInDstToken;
              if (gasEstimate && !isNaN(Number(gasEstimate))) {
                const gasCost = Number(gasEstimate);
                if (!maxGasPrice || gasCost <= (maxGasPrice * 1e9)) { // Convert to wei for comparison
                  score += 20; // ガス価格OK
                  factors.push(`Gas cost acceptable: ${gasCost} wei`);
                } else {
                  score -= 10; // ガス価格高すぎ
                  factors.push(`Gas cost too high: ${gasCost} wei`);
                }
              }
  
              // チェーン流動性ボーナス（主要チェーンは有利）
              const majorChains = [1, 137, 42161, 10, 56]; // Ethereum, Polygon, Arbitrum, Optimism, BSC
              if (majorChains.includes(order.srcChainId) && majorChains.includes(order.dstChainId)) {
                score += 10;
                factors.push("Major chain pair");
              }
  
              return {
                orderHash: order.orderHash,
                score: Math.round(score),
                profitMarginPercent,
                rawProfitWei: rawProfit.toString(),
                auctionProgress: Math.round(auctionProgress * 100),
                timeRemaining: Math.max(0, auctionStart + auctionDuration - now),
                chains: `${order.srcChainId} → ${order.dstChainId}`,
                tokenPair: `${order.order.takerAsset.substring(0, 8)}... → ${order.order.makerAsset.substring(0, 8)}...`,
                amounts: {
                  input: order.order.takingAmount,
                  output: order.order.makingAmount,
                },
                gasEstimate,
                scoringFactors: factors,
                recommendation: score > 60 ? "FILL_NOW" : score > 30 ? "MONITOR" : "SKIP"
              };
  
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown analysis error';
              console.warn(`Error analyzing order ${order.orderHash}:`, errorMessage);
              return null;
            }
          })
        );
  
        // 4. 結果の整理とランキング
        const validAnalyses = profitAnalyses
          .map(result => result.status === "fulfilled" ? result.value : null)
          .filter(analysis => analysis !== null)
          .sort((a, b) => b.score - a.score) // スコア降順
          .slice(0, maxResults);
  
        // 5. 最終レポート生成
        const report = {
          scanTimestamp: new Date().toISOString(),
          totalOrdersScanned: ordersToAnalyze.length,
          validOpportunitiesFound: validAnalyses.length,
          topOpportunities: validAnalyses,
          summary: {
            bestScore: validAnalyses.length > 0 ? validAnalyses[0].score : 0,
            averageScore: validAnalyses.length > 0 ? 
              Math.round(validAnalyses.reduce((sum, a) => sum + a.score, 0) / validAnalyses.length) : 0,
            recommendedActions: {
              fillNow: validAnalyses.filter(a => a.recommendation === "FILL_NOW").length,
              monitor: validAnalyses.filter(a => a.recommendation === "MONITOR").length,
              skip: validAnalyses.filter(a => a.recommendation === "SKIP").length,
            }
          },
          scanParameters: {
            resolverAddress,
            maxGasPrice,
            minProfitThreshold,
            targetChains,
            maxResults,
          }
        };
  
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
  
      } catch (error) {
        console.error("Error during profit opportunity scan:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: "text", text: `Error during profit scan: ${errorMessage}` }],
        };
      }
    },
  );
}

function registerMarketDataResource(server: McpServer) {
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

function registerGetActiveFusionOrdersTool(server: McpServer) {
  /**
   * 7) Tool - Get Active Fusion Orders
   *    Retrieves current active cross-chain swap orders that resolvers can fulfill
   */
  server.registerTool(
    "getActiveFusionOrders",
    {
      title: "Get Active Fusion Orders",
      description: "Retrieves all currently active cross-chain swap orders available for resolvers to fulfill. Shows order details including amounts, chains, auction timing, and profitability indicators.",
      inputSchema: {
        page: z.number().default(1).describe("Page number for pagination (default: 1)"),
        limit: z.number().default(100).describe("Number of orders to retrieve (default: 100, max: 500)"),
        srcChain: z.number().optional().describe("Filter by source chain ID (e.g., 1 for Ethereum)"),
        dstChain: z.number().optional().describe("Filter by destination chain ID (e.g., 137 for Polygon)"),
      },
    },
    async (input) => {
      try {
        // Check if we have a valid API key
        if (!ONE_INCH_AUTH_KEY || ONE_INCH_AUTH_KEY === "YOUR_API_KEY_HERE") {
          return {
            content: [{ 
              type: "text", 
              text: "❌ 1inch API authentication required.\n\n" +
                    "To access active fusion orders, you need to:\n" +
                    "1. Get an API key from https://portal.1inch.dev/\n" +
                    "2. Set the ONE_INCH_AUTH_KEY environment variable\n" +
                    "3. Restart the server\n\n" +
                    "The 1inch Fusion+ API provides access to cross-chain swap orders that resolvers can fulfill for profit."
            }]
          };
        }
  
        const { page, limit, srcChain, dstChain } = input;
  
        // Build query parameters
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });
        
        if (srcChain) params.append('srcChain', srcChain.toString());
        if (dstChain) params.append('dstChain', dstChain.toString());
  
        // Fetch active orders using direct API call since SDK is having auth issues
        const response = await fetch(`${ONE_INCH_API_URL}/orders/v1.0/order/active?${params}`, {
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
            'Content-Type': 'application/json',
          },
        });
  
        if (!response.ok) {
          if (response.status === 401) {
            return {
              content: [{ 
                type: "text", 
                text: "❌ Invalid API key. Please check your 1inch API key from https://portal.1inch.dev/"
              }]
            };
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
  
        const ordersData = await response.json();
        
        // Format the response for better readability
        const formattedOrders = {
          summary: {
            totalOrders: ordersData.meta?.totalItems || 0,
            currentPage: ordersData.meta?.currentPage || 1,
            totalPages: ordersData.meta?.totalPages || 1,
            lastUpdated: new Date().toISOString(),
          },
          orders: ordersData.items?.map((order: any) => {
            const now = Date.now();
            const auctionStart = new Date(order.auctionStartDate).getTime();
            const auctionEnd = new Date(order.auctionEndDate).getTime();
            const timeRemaining = Math.max(0, auctionEnd - now);
            const auctionProgress = Math.min((now - auctionStart) / (auctionEnd - auctionStart), 1);
  
            return {
              orderHash: order.orderHash,
              chains: {
                source: order.srcChainId,
                destination: order.dstChainId,
                route: `Chain ${order.srcChainId} → Chain ${order.dstChainId}`,
              },
              tokens: {
                makerAsset: order.order.makerAsset,
                takerAsset: order.order.takerAsset,
                makingAmount: order.order.makingAmount,
                takingAmount: order.order.takingAmount,
                remainingAmount: order.remainingMakerAmount,
              },
              auction: {
                startDate: order.auctionStartDate,
                endDate: order.auctionEndDate,
                timeRemainingMs: timeRemaining,
                timeRemainingHours: Math.round(timeRemaining / (1000 * 60 * 60) * 10) / 10,
                progressPercent: Math.round(auctionProgress * 100),
                status: timeRemaining > 0 ? 'ACTIVE' : 'EXPIRED',
              },
              fulfillmentData: {
                quoteId: order.quoteId,
                signature: order.signature?.substring(0, 20) + '...' || 'N/A',
                makerBalance: order.makerBalance,
                makerAllowance: order.makerAllowance,
                isMakerContract: order.isMakerContract,
              },
              profitabilityIndicators: {
                auctionMaturity: auctionProgress > 0.5 ? 'HIGH' : auctionProgress > 0.2 ? 'MEDIUM' : 'LOW',
                timeUrgency: timeRemaining < 3600000 ? 'HIGH' : timeRemaining < 7200000 ? 'MEDIUM' : 'LOW', // 1-2 hours
                chainPairPopularity: [1, 137, 42161, 10, 56].includes(order.srcChainId) && 
                                   [1, 137, 42161, 10, 56].includes(order.dstChainId) ? 'HIGH' : 'MEDIUM',
              }
            };
          }) || [],
          filterApplied: {
            sourceChain: srcChain || 'All',
            destinationChain: dstChain || 'All',
            pageSize: limit,
          },
          instructions: {
            forResolvers: "These are active cross-chain swap orders waiting to be fulfilled. Higher auction progress and time urgency may indicate better profit opportunities.",
            nextSteps: [
              "Use analyzeProfitOpportunity tool with specific orderHash for detailed analysis",
              "Use scanAllProfitOpportunities tool to rank all orders by profitability",
              "Monitor auction progress - orders become more profitable as time progresses"
            ]
          }
        };
  
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(formattedOrders, null, 2)
          }]
        };
  
      } catch (error) {
        console.error("Error fetching active fusion orders:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ 
            type: "text", 
            text: `❌ Error fetching active fusion orders: ${errorMessage}\n\n` +
                  "- Invalid API key\n" +
                  "- Network connectivity issues\n" +
                  "- 1inch API service unavailable\n" +
                  "- Rate limiting\n\n" +
                  "Please check your API key and try again."
          }]
        };
      }
    },
  );
}
