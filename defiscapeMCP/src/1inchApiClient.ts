import { SDK, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Environment variables
const ONE_INCH_AUTH_KEY = process.env.ONE_INCH_AUTH_KEY || "YOUR_API_KEY_HERE";
const ONE_INCH_API_URL = "https://api.1inch.dev/fusion-plus";

// Initialize 1inch SDK
const oneInchSdk = new SDK({
  url: ONE_INCH_API_URL,
  authKey: ONE_INCH_AUTH_KEY,
});

// Define ActiveOrder type locally since import is not working
export interface ActiveOrder {
  orderHash: string;
  quoteId: string;
  srcChainId: number;
  dstChainId: number;
  order: {
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    maker: string;
  };
  signature: string;
  remainingMakerAmount: string;
  makerBalance: string;
  makerAllowance: string;
  isMakerContract: boolean;
  auctionStartDate: string;
  auctionEndDate: string;
}

// Define ActiveOrdersResponse type locally
export interface ActiveOrdersResponse {
  items: ActiveOrder[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}

// Define OrderStatusResponse type locally
export interface OrderStatusResponse {
  orderHash: string;
  status: string;
  order: any;
}

/**
 * 1inch Fusion+ API Client Class
 * Provides methods to interact with 1inch Fusion+ cross-chain swap orders
 */
export class OneInchFusionApiClient {
  private sdk: SDK;
  private authKey: string;
  private baseUrl: string;

  constructor(authKey?: string) {
    this.authKey = authKey || ONE_INCH_AUTH_KEY;
    this.baseUrl = ONE_INCH_API_URL;
    this.sdk = new SDK({
      url: this.baseUrl,
      authKey: this.authKey,
    });
  }

  /**
   * Get active cross-chain swap orders
   * @param params Pagination and filtering parameters
   * @returns Promise with active orders data
   */
  async getActiveOrders(params: PaginationParams = {}): Promise<ActiveOrdersResponse> {
    try {
      console.log('Fetching active orders with params:', params);
      
      const result = await this.sdk.getActiveOrders({
        page: params.page || 1,
        limit: params.limit || 100,
      });

      // If SDK doesn't return proper structure, make direct API call
      if (!result || !result.items) {
        return await this.getActiveOrdersDirect(params);
      }

      return result;
    } catch (error) {
      console.error('Error fetching active orders via SDK:', error);
      // Fallback to direct API call
      return await this.getActiveOrdersDirect(params);
    }
  }

  /**
   * Direct API call to get active orders (fallback method)
   */
  private async getActiveOrdersDirect(params: PaginationParams = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.srcChain) queryParams.append('srcChain', params.srcChain.toString());
    if (params.dstChain) queryParams.append('dstChain', params.dstChain.toString());

    const url = `${this.baseUrl}/orders/v1.0/order/active?${queryParams}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.authKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get escrow factory address for a specific chain
   * @param chainId Chain ID to get escrow factory for
   * @returns Promise with escrow factory address
   */
  async getEscrowFactory(chainId: number): Promise<EscrowFactory> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/escrow?chainId=${chainId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching escrow factory:', error);
      throw error;
    }
  }

  /**
   * Get orders by maker address
   * @param params Parameters including maker address and filters
   * @returns Promise with orders data
   */
  async getOrdersByMaker(params: OrdersByMakerParams): Promise<any> {
    try {
      // Use SDK method if available
      const result = await this.sdk.getOrdersByMaker({
        page: params.page || 1,
        limit: params.limit || 100,
        address: params.address,
      });

      return result;
    } catch (error) {
      console.error('Error fetching orders by maker via SDK:', error);
      // Fallback to direct API call
      return await this.getOrdersByMakerDirect(params);
    }
  }

  /**
   * Direct API call to get orders by maker
   */
  private async getOrdersByMakerDirect(params: OrdersByMakerParams): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.timestampFrom) queryParams.append('timestampFrom', params.timestampFrom.toString());
    if (params.timestampTo) queryParams.append('timestampTo', params.timestampTo.toString());
    if (params.srcToken) queryParams.append('srcToken', params.srcToken);
    if (params.dstToken) queryParams.append('dstToken', params.dstToken);
    if (params.withToken) queryParams.append('withToken', params.withToken);
    if (params.dstChainId) queryParams.append('dstChainId', params.dstChainId.toString());
    if (params.srcChainId) queryParams.append('srcChainId', params.srcChainId.toString());
    if (params.chainId) queryParams.append('chainId', params.chainId.toString());

    const url = `${this.baseUrl}/orders/v1.0/order/maker/${params.address}?${queryParams}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.authKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get order status by order hash
   * @param orderHash The order hash to check
   * @returns Promise with order status data
   */
  async getOrderStatus(orderHash: string): Promise<OrderStatus> {
    try {
      // Use SDK method if available
      const result = await this.sdk.getOrderStatus(orderHash);
      return result;
    } catch (error) {
      console.error('Error fetching order status via SDK:', error);
      // Fallback to direct API call
      return await this.getOrderStatusDirect(orderHash);
    }
  }

  /**
   * Direct API call to get order status
   */
  private async getOrderStatusDirect(orderHash: string): Promise<any> {
    const url = `${this.baseUrl}/orders/v1.0/order/status/${orderHash}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.authKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get orders by multiple hashes
   * @param orderHashes Array of order hashes
   * @returns Promise with orders data
   */
  async getOrdersByHashes(orderHashes: string[]): Promise<any> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/status`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderHashes: orderHashes,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching orders by hashes:', error);
      throw error;
    }
  }

  /**
   * Get quote for cross-chain swap
   * @param params Quote parameters
   * @returns Promise with quote data
   */
  async getQuote(params: QuoteParams): Promise<any> {
    try {
      const result = await this.sdk.getQuote(params);
      return result;
    } catch (error) {
      console.error('Error fetching quote:', error);
      throw error;
    }
  }

  /**
   * Get secrets for withdrawal and cancellation
   * @param orderHash Order hash to get secrets for
   * @returns Promise with secrets data
   */
  async getOrderSecrets(orderHash: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/secrets/${orderHash}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching order secrets:', error);
      throw error;
    }
  }

  /**
   * Get ready to accept secret fills for specific order
   * @param orderHash Order hash to check
   * @returns Promise with ready fills data
   */
  async getReadyToAcceptSecretFills(orderHash: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/ready-to-accept-secret-fills/${orderHash}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching ready to accept secret fills:', error);
      throw error;
    }
  }

  /**
   * Get ready to accept secret fills for all orders
   * @returns Promise with ready fills data for all orders
   */
  async getAllReadyToAcceptSecretFills(): Promise<any> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/ready-to-accept-secret-fills`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching all ready to accept secret fills:', error);
      throw error;
    }
  }

  /**
   * Get ready to execute public actions
   * @returns Promise with public actions data
   */
  async getReadyToExecutePublicActions(): Promise<any> {
    try {
      const url = `${this.baseUrl}/orders/v1.0/order/ready-to-execute-public-actions`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.authKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching ready to execute public actions:', error);
      throw error;
    }
  }

  /**
   * Test API connectivity and authentication
   * @returns Promise with test result
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      // Test with a simple escrow factory request for Ethereum
      const escrowFactory = await this.getEscrowFactory(1);
      
      return {
        success: true,
        message: 'API connection successful',
        data: {
          escrowFactory,
          authKeyConfigured: this.authKey !== "YOUR_API_KEY_HERE",
          baseUrl: this.baseUrl,
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        message: `API connection failed: ${errorMessage}`,
        data: {
          authKeyConfigured: this.authKey !== "YOUR_API_KEY_HERE",
          baseUrl: this.baseUrl,
        }
      };
    }
  }
}

/**
 * Default export - pre-configured client instance
 */
export const fusionApiClient = new OneInchFusionApiClient();

/**
 * Utility functions for common operations
 */

/**
 * Format order data for display
 */
export function formatOrderData(order: ActiveOrder): any {
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
      timeUrgency: timeRemaining < 3600000 ? 'HIGH' : timeRemaining < 7200000 ? 'MEDIUM' : 'LOW',
      chainPairPopularity: [1, 137, 42161, 10, 56].includes(order.srcChainId) && 
                           [1, 137, 42161, 10, 56].includes(order.dstChainId) ? 'HIGH' : 'MEDIUM',
    }
  };
}

/**
 * Test function to verify API functionality
 */
export async function testFusionApi(): Promise<void> {
  console.log('🧪 Testing 1inch Fusion+ API Client...\n');

  const client = new OneInchFusionApiClient();

  // Test 1: Connection test
  console.log('1️⃣ Testing API connection...');
  const connectionTest = await client.testConnection();
  console.log('Connection result:', connectionTest);
  console.log('');

  if (!connectionTest.success) {
    console.log('❌ API connection failed. Check your API key and try again.');
    return;
  }

  // Test 2: Get active orders
  console.log('2️⃣ Testing active orders retrieval...');
  try {
    const activeOrders = await client.getActiveOrders({ page: 1, limit: 5 });
    console.log(`Found ${activeOrders.items?.length || 0} active orders`);
    
    if (activeOrders.items && activeOrders.items.length > 0) {
      const firstOrder = activeOrders.items[0];
      console.log('First order sample:', {
        orderHash: firstOrder.orderHash,
        srcChain: firstOrder.srcChainId,
        dstChain: firstOrder.dstChainId,
        makingAmount: firstOrder.order.makingAmount,
        takingAmount: firstOrder.order.takingAmount,
      });
    }
  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
  }
  console.log('');

  // Test 3: Get escrow factory for Ethereum
  console.log('3️⃣ Testing escrow factory retrieval...');
  try {
    const escrowFactory = await client.getEscrowFactory(1);
    console.log('Ethereum escrow factory:', escrowFactory);
  } catch (error) {
    console.error('❌ Error fetching escrow factory:', error);
  }
  console.log('');

  console.log('✅ API Client testing completed!');
}

// If this file is run directly, execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testFusionApi().catch(console.error);
}
  }
  console.log('');

  console.log('✅ API Client testing completed!');
}

// If this file is run directly, execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testFusionApi().catch(console.error);
}
    
    if (activeOrders.items && activeOrders.items.length > 0) {
      const firstOrder = activeOrders.items[0];
      console.log('First order sample:', {
        orderHash: firstOrder.orderHash,
        srcChain: firstOrder.srcChainId,
        dstChain: firstOrder.dstChainId,
        makingAmount: firstOrder.order.makingAmount,
        takingAmount: firstOrder.order.takingAmount,
      });
    }
  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
  }
  console.log('');

  // Test 3: Get escrow factory for Ethereum
  console.log('3️⃣ Testing escrow factory retrieval...');
  try {
    const escrowFactory = await client.getEscrowFactory(1);
    console.log('Ethereum escrow factory:', escrowFactory);
  } catch (error) {
    console.error('❌ Error fetching escrow factory:', error);
  }
  console.log('');

  console.log('✅ API Client testing completed!');
}

// If this file is run directly, execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testFusionApi().catch(console.error);
}
