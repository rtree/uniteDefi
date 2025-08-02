
# DefiScape MCP Server
A Model Context Protocol (MCP) server that connects large language models to 1inch’s Fusion+ DeFi APIs.
The server exposes a set of LLM-friendly tools and resources so assistants can discover DeFi information, query market data, and analyze cross‑chain swap opportunities.

# Project Structure
<img width="857" height="368" alt="image" src="https://github.com/user-attachments/assets/f4e74335-a7b7-4c96-918d-7e597fcdf85e" />


# Features

## Token & Market Data
- getTokenInfo – fetch token metadata and USD prices.
- getPopularTokens – list verified/whitelisted tokens on a chain.
- compareTokenPrices – check a token’s price across multiple chains.
- findTokenBySymbol / searchTokensByName – resolve token addresses.
- getSupportedChains – enumerate 1inch‑supported networks.

## DeFi Opportunities
- findDeFiEarningOpportunities – query Fusion+ quotes to estimate cross‑chain swap returns.
- getActiveFusionOrders – list open Fusion+ orders for resolvers.
- scanAllProfitOpportunities – batch analysis of all active orders (experimental).

## Example Tool
- add – simple addition example to show MCP tool structure.

# Getting Started

## Install dependencies

```
cd defiscapeMCP
npm install
```

Set environment variables
```
MCP_PRESHARED_KEY=your-secret
ONE_INCH_AUTH_KEY=your-1inch-api-key
```

Run the server
```
npm run dev
```

The MCP server listens on http://localhost:3000.
Requests must include Authorization: Bearer <MCP_PRESHARED_KEY>.

# Usage

Goto OpenAI's dashboard -> Goto playground and register this MCP server like this
<img width="1018" height="783" alt="image" src="https://github.com/user-attachments/assets/cbda3e1f-8b04-4465-b907-a35f66c70263" />

Then ask like this
```
What info you can get from DeFi?
Cross-Chain Token Price Comparison of ETH, WBTC and DAI. 
```

# Additional Notes

testMCP contains minimal server examples for experimentation.
support-tools holds helper crawler scripts and downloaded 1inch documentation.
Tools for DeFi earnings and active orders require a valid 1inch API key.
Feel free to adapt or extend the tools to fit your LLM’s needs!
