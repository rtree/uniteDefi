import os
from dotenv import load_dotenv
from openai import OpenAI

# .envファイルを読み込む
load_dotenv()

# 環境変数からAPIキーを取得
api_key = os.getenv("OPENAI_API_KEY")

# OpenAIクライアントを初期化
client = OpenAI(api_key=api_key)

response = client.chat.completions.create(
    model="gpt-4.1",
    messages=[{"role": "user", "content": "Say hello to Taro"}],
    tools=[
        {
            "type": "mcp_server",
            "server_url": "http://localhost:3000/",  # 先ほどのサーバ
        }
    ]
)

print(response)
