import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { JSONRPCServerAndClient } from "json-rpc-2.0";

const app = express();

// JSON-RPCサーバを作成
const rpc = new JSONRPCServerAndClient();

// ツールのエンドポイントを実装
rpc.addMethod("list_tools", async () => {
  return [
    {
      name: "hello",
      description: "Say hello to someone",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" }
        },
        required: ["name"]
      }
    }
  ];
});

rpc.addMethod("call_tool", async ({ name, arguments: args }) => {
  if (name === "hello") {
    return { result: `Hello, ${args.name}!` };
  }
  throw new Error("Unknown tool");
});

// HTTPで受け付ける
app.use(express.json());
app.post("/", async (req, res) => {
  const jsonRPCResponse = await rpc.receive(req.body);
  res.json(jsonRPCResponse || {});
});

app.listen(3000, () => {
  console.log("MCP server listening on port 3000");
});
