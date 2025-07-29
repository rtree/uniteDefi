import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

(async () => {
  // dev 中のサーバーへ同じ tsx で接続
  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["src/server.ts"],
  });

  const client = new Client({ name: "demo-client", version: "0.1.0" });
  await client.connect(transport);

  // ツール呼び出し
  const sum = await client.callTool({
    name: "add",
    arguments: { a: 7, b: 5 },
  });
  
  if (sum) {
    if 
  }
  console.log("add →", sum.content?.[0].text); // => 12

  // リソース読み取り
  const greet = await client.readResource({ uri: "greeting://Alice" });
  console.log("greeting →", greet.contents?.[0].text); // => Hello, Alice!

  transport.dispose();       // 終了処理
})();
