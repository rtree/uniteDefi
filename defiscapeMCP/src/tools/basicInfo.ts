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

export function registerSimpleDeFiTools(server: McpServer) {
  /**
   * Simple tool to get token information and prices
   */
  
  server.registerTool(
    "getTokenInfo",
    {
      title: "Get Token Information and Price",
      description: "Get basic information about any token including current price, symbol, and decimals. Great for learning about DeFi tokens.",
      inputSchema: {
        tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid token address (e.g., 0xA0b86a33E6417c5aD3dE73E45AA42FE19f23E96f for USDC)"),
        chainId: z.number().default(1).describe("Chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum)"),
      },
    },
    async (input) => {
      try {
        const { tokenAddress, chainId } = input;
        
        // Get token information from 1inch Token API
        const tokenResponse = await fetch(`https://api.1inch.dev/token/v1.2/${chainId}/custom`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tokens: [tokenAddress] }),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Failed to get token info: ${tokenResponse.statusText}`);
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData[tokenAddress];

        // Get current price using spot price API
        const priceResponse = await fetch(`https://api.1inch.dev/price/v1.1/${chainId}/${tokenAddress}?currency=USD`, {
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
          },
        });

        let priceInfo = null;
        if (priceResponse.ok) {
          priceInfo = await priceResponse.json();
        }

        const result = {
          tokenInfo: {
            address: tokenAddress,
            name: token?.name || "Unknown",
            symbol: token?.symbol || "Unknown", 
            decimals: token?.decimals || 18,
            chainId: chainId,
            chainName: getChainName(chainId),
          },
          priceData: priceInfo ? {
            priceUSD: priceInfo[tokenAddress],
            lastUpdated: new Date().toISOString(),
          } : null,
          basicExplanation: {
            whatIsThis: `${token?.symbol || 'This token'} is a digital asset on ${getChainName(chainId)}`,
            decimals: `This token has ${token?.decimals || 18} decimal places, meaning 1 token = 10^${token?.decimals || 18} smallest units`,
            currentValue: priceInfo?.[tokenAddress] ? `Currently worth $${priceInfo[tokenAddress]} USD` : "Price not available",
          }
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );

  /**
   * Simple tool to get supported chains and popular tokens
   */
  server.registerTool(
    "getPopularTokens",
    {
      title: "Get Popular DeFi Tokens",
      description: "Get a list of popular DeFi tokens with their basic information. Perfect for learning about common DeFi assets.",
      inputSchema: {
        chainId: z.number().default(1).describe("Chain ID to get tokens for"),
        limit: z.number().default(10).describe("Number of tokens to return"),
      },
    },
    async (input) => {
      try {
        const { chainId, limit } = input;

        // Get 1inch whitelisted tokens (these are popular/verified tokens)
        const response = await fetch(`https://api.1inch.dev/token/v1.2/${chainId}`, {
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to get tokens: ${response.statusText}`);
        }

        const tokensData = await response.json();
        
        // Convert object to array and take first N tokens
        const tokens = Object.entries(tokensData)
          .slice(0, limit)
          .map(([address, token]: [string, any]) => ({
            address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            explanation: getTokenExplanation(token.symbol),
          }));

        const result = {
          chainInfo: {
            chainId,
            chainName: getChainName(chainId),
            description: getChainDescription(chainId),
          },
          popularTokens: tokens,
          beginner_tips: [
            "These are verified tokens that are safe to interact with",
            "Always double-check token addresses before trading",
            "Start with small amounts when learning DeFi",
            "Stablecoins (USDC, USDT, DAI) are good for beginners as they maintain $1 value",
          ]
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );

  /**
   * Simple tool to compare token prices across chains
   */
  server.registerTool(
    "compareTokenPrices",
    {
      title: "Compare Token Prices Across Chains",
      description: "Compare the same token's price on different blockchains to understand cross-chain arbitrage opportunities (price differences).",
      inputSchema: {
        tokenSymbol: z.string().describe("Token symbol to compare (e.g., USDC, ETH, WBTC)"),
        chains: z.array(z.number()).default([1, 137, 42161]).describe("Array of chain IDs to compare"),
      },
    },
    async (input) => {
      try {
        const { tokenSymbol, chains } = input;
        const priceComparisons = [];

        for (const chainId of chains) {
          try {
            // Get tokens for this chain
            const tokensResponse = await fetch(`https://api.1inch.dev/token/v1.2/${chainId}`, {
              headers: {
                'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
              },
            });

            const tokensData: Record<string, ProviderTokenDto> = await tokensResponse.json();
            
            // Find token by symbol
            const tokenData = Object.values(tokensData).find((token: ProviderTokenDto) => 
              token.symbol.toLowerCase() === tokenSymbol.toLowerCase()
            );

            if (!tokenData) continue;

            const tokenAddress = tokenData.address;

            // Get price
            const priceResponse = await fetch(`https://api.1inch.dev/price/v1.1/${chainId}/${tokenAddress}?currency=USD`, {
              headers: {
                'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
              },
            });

            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              priceComparisons.push({
                chainId,
                chainName: getChainName(chainId),
                tokenAddress,
                tokenName: tokenData.name,
                priceUSD: priceData[tokenAddress],
              });
            }

          } catch (error) {
            console.warn(`Failed to get price for ${tokenSymbol} on chain ${chainId}:`, error);
          }
        }

        // Calculate arbitrage opportunities
        const prices = priceComparisons.map(p => p.priceUSD).filter(p => p);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const arbitrageOpportunity = ((maxPrice - minPrice) / minPrice * 100).toFixed(2);

        const result = {
          tokenSymbol: tokenSymbol.toUpperCase(),
          priceComparisons,
          arbitrageAnalysis: {
            lowestPrice: minPrice,
            highestPrice: maxPrice,
            priceDifferencePercent: arbitrageOpportunity,
            explanation: `If you buy ${tokenSymbol} on the cheapest chain and sell on the most expensive, you could potentially profit ${arbitrageOpportunity}% (before fees and gas costs)`,
            isOpportunity: parseFloat(arbitrageOpportunity) > 1,
          },
          beginnerNote: "This shows price differences across chains. In real DeFi, people profit from these differences using cross-chain bridges and arbitrage bots.",
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );

  /**
   * Tool to find token address from symbol
   */
  server.registerTool(
    "findTokenBySymbol",
    {
      title: "Find Token Address by Symbol",
      description: "Search for a token's contract address and chain information using its symbol (e.g., USDC, ETH, WBTC). Essential for getting the exact token address needed for other operations.",
      inputSchema: {
        tokenSymbol: z.string().describe("Token symbol to search for (e.g., USDC, ETH, WBTC)"),
        chainId: z.number().optional().describe("Specific chain ID to search on (optional - if not provided, searches across all supported chains)"),
        limit: z.number().default(5).describe("Maximum number of results to return per chain"),
      },
    },
    async (input) => {
      try {
        const { tokenSymbol, chainId, limit } = input;
        const results = [];

        // If chainId is specified, search only that chain
        const chainsToSearch = chainId ? [chainId] : [1, 137, 42161, 10, 56, 100, 43114]; // Popular chains

        for (const currentChainId of chainsToSearch) {
          try {
            // Use the search API to find tokens by symbol
            const searchResponse = await fetch(`https://api.1inch.dev/token/v1.4/${currentChainId}/search?query=${encodeURIComponent(tokenSymbol)}&limit=${limit}`, {
              headers: {
                'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
              },
            });

            if (!searchResponse.ok) {
              console.warn(`Search failed for chain ${currentChainId}: ${searchResponse.statusText}`);
              continue;
            }

            const searchData = await searchResponse.json();
            
            // Filter results to exact symbol matches (case insensitive)
            const exactMatches = searchData.items?.filter((token: ProviderTokenDto) => 
              token.symbol.toLowerCase() === tokenSymbol.toLowerCase()
            ) || [];

            if (exactMatches.length > 0) {
              results.push({
                chainId: currentChainId,
                chainName: getChainName(currentChainId),
                tokens: exactMatches.map((token: ProviderTokenDto) => ({
                  address: token.address,
                  symbol: token.symbol,
                  name: token.name,
                  decimals: token.decimals,
                  providers: token.providers,
                  tags: token.tags,
                  explanation: getTokenExplanation(token.symbol),
                })),
              });
            }

          } catch (error) {
            console.warn(`Error searching chain ${currentChainId}:`, error);
          }
        }

        const result = {
          searchedSymbol: tokenSymbol.toUpperCase(),
          totalChainsFound: results.length,
          results,
          usage: {
            howToUse: "Copy the 'address' field to use in other tools like getTokenInfo or price comparisons",
            example: results.length > 0 ? `Use address: ${results[0].tokens[0]?.address} on ${results[0].chainName}` : "No tokens found",
          },
          beginnerTip: results.length > 1 
            ? `${tokenSymbol} exists on multiple chains! Make sure to use the correct address for the chain you want to interact with.`
            : results.length === 1 
            ? `${tokenSymbol} found on ${results[0].chainName}. Use the provided address for transactions on this network.`
            : `${tokenSymbol} not found. Try checking the spelling or use 'searchTokensByName' for partial matches.`,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );

  /**
   * Tool to search tokens by partial name or symbol
   */
  server.registerTool(
    "searchTokensByName",
    {
      title: "Search Tokens by Name or Symbol",
      description: "Search for tokens using partial names or symbols. Great for discovering tokens when you're not sure of the exact symbol.",
      inputSchema: {
        query: z.string().describe("Search query (partial token name or symbol, e.g., 'usd' to find stablecoins)"),
        chainId: z.number().default(1).describe("Chain ID to search on"),
        limit: z.number().default(10).describe("Maximum number of results to return"),
      },
    },
    async (input) => {
      try {
        const { query, chainId, limit } = input;

        const searchResponse = await fetch(`https://api.1inch.dev/token/v1.4/${chainId}/search?query=${encodeURIComponent(query)}&limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
          },
        });

        if (!searchResponse.ok) {
          throw new Error(`Search failed: ${searchResponse.statusText}`);
        }

        const searchData = await searchResponse.json();
        
        const tokens = searchData.items?.map((token: ProviderTokenDto) => ({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          providers: token.providers,
          tags: token.tags,
          explanation: getTokenExplanation(token.symbol),
          matchReason: {
            symbolMatch: token.symbol.toLowerCase().includes(query.toLowerCase()),
            nameMatch: token.name.toLowerCase().includes(query.toLowerCase()),
          },
        })) || [];

        const result = {
          searchQuery: query,
          chainId,
          chainName: getChainName(chainId),
          totalResults: tokens.length,
          tokens,
          searchTips: [
            "Use exact symbols (e.g., 'USDC') for precise matches",
            "Use partial names (e.g., 'wrapped') to find related tokens", 
            "Check multiple chains as the same token may exist on different networks",
            "Always verify the contract address before making transactions",
          ],
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );

  /**
   * Tool to get all supported chains and their info
   */
  server.registerTool(
    "getSupportedChains",
    {
      title: "Get Supported Blockchain Networks",
      description: "Get a list of all blockchain networks supported by 1inch, with their chain IDs and basic information.",
      inputSchema: {
        includeTestnets: z.boolean().default(false).describe("Whether to include test networks"),
      },
    },
    async (input) => {
      try {
        const { includeTestnets } = input;

        // Get supported chain IDs from the API
        const chainsResponse = await fetch('https://api.1inch.dev/token/v1.4/chain-ids', {
          headers: {
            'Authorization': `Bearer ${ONE_INCH_AUTH_KEY}`,
          },
        });

        if (!chainsResponse.ok) {
          throw new Error(`Failed to get supported chains: ${chainsResponse.statusText}`);
        }

        const chainIds: number[] = await chainsResponse.json();
        
        // Filter out testnets if not requested
        const filteredChainIds = includeTestnets 
          ? chainIds 
          : chainIds.filter(id => ![5, 11155111, 80001, 421613].includes(id)); // Common testnet IDs

        const supportedChains = filteredChainIds.map(chainId => ({
          chainId,
          chainName: getChainName(chainId),
          description: getChainDescription(chainId),
          isTestnet: [5, 11155111, 80001, 421613].includes(chainId),
          isMainnet: ![5, 11155111, 80001, 421613].includes(chainId),
        }));

        const result = {
          totalChains: supportedChains.length,
          includesTestnets: includeTestnets,
          supportedChains,
          popularChains: supportedChains.filter(chain => 
            [1, 137, 42161, 10, 56].includes(chain.chainId)
          ),
          usage: {
            tip: "Use the chainId values in other tools to specify which blockchain network to query",
            example: "Use chainId: 1 for Ethereum, 137 for Polygon, 42161 for Arbitrum",
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    },
  );
}

// Helper functions
function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: "Ethereum",
    137: "Polygon", 
    42161: "Arbitrum",
    10: "Optimism",
    56: "BNB Chain",
    100: "Gnosis",
    43114: "Avalanche",
  };
  return chains[chainId] || `Chain ${chainId}`;
}

function getChainDescription(chainId: number): string {
  const descriptions: Record<number, string> = {
    1: "The original blockchain for smart contracts, highest security but expensive gas fees",
    137: "Polygon - Fast and cheap transactions, compatible with Ethereum",
    42161: "Arbitrum - Layer 2 scaling solution for Ethereum, lower fees",
    10: "Optimism - Another Layer 2 for Ethereum with low fees",
    56: "Binance Smart Chain - Fast and cheap, popular for trading",
  };
  return descriptions[chainId] || "A blockchain network";
}

function getTokenExplanation(symbol: string): string {
  const explanations: Record<string, string> = {
    'USDC': 'USD Coin - A stablecoin always worth ~$1, backed by real US dollars',
    'USDT': 'Tether - Another stablecoin worth ~$1, most widely used',
    'DAI': 'DAI - Decentralized stablecoin worth ~$1, created by MakerDAO protocol',
    'WETH': 'Wrapped Ethereum - ETH in ERC-20 token format, same value as ETH',
    'WBTC': 'Wrapped Bitcoin - Bitcoin on Ethereum blockchain, backed 1:1 by real Bitcoin',
    'UNI': 'Uniswap Token - Governance token for Uniswap decentralized exchange',
    'AAVE': 'AAVE Token - Governance token for AAVE lending protocol',
    'COMP': 'Compound Token - Governance token for Compound lending protocol',
  };
  return explanations[symbol] || 'A cryptocurrency token used in DeFi applications';
}


interface ProviderTokenDto {
  chainId: number;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  providers: string[];
  eip2612?: boolean;
  isFoT?: boolean;
  displayedSymbol?: string;
  tags: string[];
}

// For the complete API response
interface TokenInfoMap {
  [tokenAddress: string]: ProviderTokenDto;
}

// For error responses
interface BadRequestErrorDto {
  statusCode: number;
  message: string;
  error: string;
}
