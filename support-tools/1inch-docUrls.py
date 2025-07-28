from playwright.sync_api import sync_playwright
import time
URL = "https://portal.1inch.dev/documentation/apis/swap/classic-swap/quick-start"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    time.sleep(3)  # SPAレンダリング待ち
    # 左サイドバーのリンクを抽出
    links = page.eval_on_selector_all(
        "nav a",  # 実ブラウザで確認して適切なセレクタを調整
        "els => els.map(el => el.href)"
    )
    for link in links:
        print(link)
    browser.close()

    