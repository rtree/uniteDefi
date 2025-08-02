import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import dotenv from "dotenv";
import { registerAllTools } from "./tools.js"

dotenv.config();
// Prepare MCP server
const PRESHARED_KEY = process.env.MCP_PRESHARED_KEY || "PRESHARED-KEY";
const server = new McpServer({
  name: "DefiScape MCP Server",
  version: "0.1.0",
});
registerAllTools(server);
// Simple authentication middleware
function authenticateRequest(req: any): boolean {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return false;
  }
  
  // Support both "Bearer TOKEN" and "TOKEN" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
    
  return token === PRESHARED_KEY;
}

// Prepare intermediary servers
const httpServer = createServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
  enableJsonResponse: true,
  enableDnsRebindingProtection: false,
  allowedOrigins: ['*'],
});

async function startServer() {
  try {
    await server.connect(transport);

    httpServer.on('request', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

      console.log('\n=== Request ===');
      console.log('Request Method:', req.method);
      console.log('Request Headers:', req.headers);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Authentication check for non-OPTIONS requests
      if (!authenticateRequest(req)) {
        console.log('Authentication failed');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing preshared key'
          },
          id: null
        }));
        return;
      }

      console.log('Authentication successful');

      // Response logging setup
      let responseBody = '';

      res.on('finish', () => {
        console.log('\n=== Response ===');
        console.log('Status Code:', res.statusCode);
        console.log('Response Headers:', res.getHeaders());
        if (responseBody) {
          console.log('Response Body:', responseBody);
        }
      });

      // Override write and end to capture response body
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
      console.log(`Authentication: Preshared key required (${PRESHARED_KEY})`);
    });

  } catch (error) {
    console.error('Server error:', error);
    process.exit(1);
  }
}

startServer();
