import os
from agents     import Agent, run           # SDK 本体
from agents.mcp import MCPServerStdio       # MCP 拡張

# --- 1) MCP サーバー定義 ---
mcp_server = MCPServerStdio(
    params={
        "command": "tsx",                  # Node 実行コマンド
        "args": ["src/server.t"
        "s"],         # 相対パスはプロジェクトルート基準
        # "cwd": os.getcwd(),             # ルート以外から起動したい場｀合に指定
    },
)

# --- 2) Agent 定義 ---
agent = Agent(
    name="Math & Greeting Bot",
    instructions=(
        "Use the available tools (add / greeting) to answer accurately.\n"
        "If no tool fits, respond normally."
    ),
    model="gpt-4o-mini",                   # お好みで gpt-4o / gpt-4o-mini
    mcp_servers=[mcp_server],              # ← これだけでツール自動マージ
)

# --- 3) 実行 ---
result = run(agent, "2 と 3 を足して、Alice に挨拶して")
print(result.output)                       # => 「5 です。Hello, Alice!」
