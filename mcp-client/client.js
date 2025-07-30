import OpenAI from "openai";
import dotenv from "dotenv";

// .env ファイルから環境変数を読み込む
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // dotenv から読み込んだ API キーを使用
});

const response = await client.chat.completions.create({
  model: "gpt-4.1", // MCP対応モデル
  messages: [
    { role: "user", content: "Say hello to Taro using the MCP server" }
  ],
  tools: [
    {
      type: "mcp_server",
      server_url: "http://localhost:3000/", // あなたのMCPサーバのURL
    }
  ]
});

console.log(JSON.stringify(response, null, 2));