import { Server } from "@modelcontextprotocol/sdk";
import axios from "axios";
import "dotenv/config";

const BASE = "https://api.1inch.dev";
const API_KEY = process.env.ONEINCH_API_KEY!;

const server = new Server({
  name: "1inch MCP Server",
  version: "0.1.0",
});

async function call(endpoint: string, params: any = {}) {
  const url = `${BASE}${endpoint}`;
  const res = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return res.data;
}

// 例: Spot Price Aggregator
server.tool("spotPrice", {
  description: "Get spot price for a token pair",
  inputSchema: {
    type: "object",
    properties: {
      chainId: { type: "number" },
      baseToken: { type: "string" },
      quoteToken: { type: "string" },
    },
    required: ["chainId", "baseToken", "quoteToken"],
  },
  execute: async (input) => {
    const { chainId, baseToken, quoteToken } = input;
    const data = await call(`/price/v1.1/${chainId}`, {
      baseToken,
      quoteToken,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

// Fusion+ オーダー
server.tool("fusionOrders", {
  description: "Get active Fusion+ orders",
  inputSchema: {
    type: "object",
    properties: { chainId: { type: "number" } },
    required: ["chainId"],
  },
  execute: async ({ chainId }) => {
    const data = await call(`/fusion/orders/v1.0/${chainId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});

server.listen();
