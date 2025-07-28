from playwright.sync_api import sync_playwright
import os, time, re

BASE_URL = "https://portal.1inch.dev/documentation/overview"
OUTPUT_DIR = "1inch_docs_textcrawl"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 保存用のファイル名を安全化
def safe_filename(name):
    return re.sub(r'[\\/:*?"<>|]', '_', name)

def crawl_all_by_buttons(page, buttons_to_visit):
    visited = set()
    page.wait_for_load_state("networkidle")
    for label in buttons_to_visit:
        print(f"\n=== Processing {label} ===")

        # 該当ボタンを探してクリック
        try:
            btn = page.get_by_role("button", name=label, exact=True)
            btn.wait_for(timeout=5000)
            btn.click()
            time.sleep(1)
        except Exception as e:
            print(f"Skip {label}: {e}")
            continue

        # URL取得
        current_url = page.url
        if current_url in visited:
            continue
        visited.add(current_url)

        # スクリーンショット
        safe = safe_filename(label)
        png_path = os.path.join(OUTPUT_DIR, safe + ".png")
        txt_path = os.path.join(OUTPUT_DIR, safe + ".txt")

        page.screenshot(path=png_path, full_page=True)
        content_text = page.evaluate("document.body.innerText")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(content_text)

        print(f"Saved {png_path} and text.")

def main():
    # クロールしたいボタン名（先に navsSnippet.txt から抽出したものをセット）
    buttons_to_visit = [
        "Overview",
        "Authentication",
        "Swap APIs",
        "Cross-Chain Swaps (Fusion+)",
        "Intent Swaps (Fusion)",
        # 必要に応じて追加
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(BASE_URL)
        time.sleep(5)  # SPA レンダリング待ち

        crawl_all_by_buttons(page, buttons_to_visit)

        browser.close()

if __name__ == "__main__":
    main()
