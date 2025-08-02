import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SDK, NetworkEnum, QuoteParams } from "@1inch/cross-chain-sdk";
import dotenv from "dotenv";

import { registerExample                  } from "./tools/_example.js";
import { registerDefiEarningOpportunities } from "./tools/defiEarning.js";
import {
         registerActiveOrders,
         registerGetActiveFusionOrdersTool,
         registerScanAllProfitTool,
         registerAnalyzeProfitTool        
                                          } from "./tools/activeOrders.js";

import {
         registerSimpleDeFiTools,
         registerMarketDataResource
                                          } from "./tools/basicInfo.js";

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
  // Market Data Resource
  registerSimpleDeFiTools(server);
  //registerMarketDataResource(server);
  // // Defi Earning Opportunities
  // registerDefiEarningOpportunities(server);
  // // Active Orders
  // registerActiveOrders(server);
  // registerGetActiveFusionOrdersTool(server);
  // registerAnalyzeProfitTool(server);
  // registerScanAllProfitTool(server);

}



