import express from "express";
import { JSONRPCServer } from "json-rpc-2.0";

const app = express();
app.use(express.json());

const server = new JSONRPCServer();

server.addMethod("initialize", async () => {
  return { capabilities: {} };
});


server.addMethod("get_manifest", async () => {
  const tools = [
    {
      name: "hello",
      description: "Say hello",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" }
        },
        required: ["name"]
      }
    }
  ];

  return {
    name: "helloMCP",
    version: "1.0.0",
    description: "A simple MCP server that says hello",
    tools
  };
});

server.addMethod("list_tools", async () => [
  {
    name: "hello",
    description: "Say hello",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: ["name"]
    }
  }
]);

server.addMethod("call_tool", async ({ name, arguments: args }) => {
  if (name === "hello") {
    return { result: `Hello, ${args.name}!` };
  }
  throw new Error("Unknown tool");
});

app.post("/", async (req, res) => {
  const jsonResponse = await server.receive(req.body);
  res.json(jsonResponse || {});
});

app.listen(3000, () => {
  console.log("MCP server running on http://localhost:3000/");
});
