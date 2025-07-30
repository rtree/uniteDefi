import fetch from "node-fetch";

async function callHelloMCP333(name) {
  const response = await fetch("http://localhost:3000/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call_tool",
      params: {
        name: "helloMCP333",
        arguments: { name }
      },
      id: 1
    })
  });

  const result = await response.json();
  console.log(result);
}

// Example usage
callHelloMCP333("Araki");
