# get-bynext-loop-doc-1inchdev.py
from playwright.sync_api import sync_playwright
import os
import re
from PyPDF2 import PdfMerger
import time
BASE_URL = "https://portal.1inch.dev/documentation/apis/authentication"
STARTNUMBER = 1  # 開始ページ番号
BASE_URL = "https://portal.1inch.dev/documentation/apis/swap/fusion-plus/swagger/quoter?method=post&path=%2Fv1.0%2Fquote%2Fbuild"
STARTNUMBER = 15
BASE_URL = "https://portal.1inch.dev/documentation/apis/swap/intent-swap/swagger/relayer?method=post&path=%2Fv2.0%2F1%2Forder%2Fsubmit"
STARTNUMBER = 33
BASE_URL = "https://portal.1inch.dev/documentation/apis/history/swagger?method=post&path=%2Fv2.0%2Fhistory%2F%7Baddress%7D%2Fsearch%2Fevents"
STARTNUMBER = 83

OUTPUT_DIR = "1inch_docs"
MERGED_PDF_PATH = "1inch_full_documentation.pdf"
def safe_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', '_', name)
def scroll_to_bottom(page, step=800, delay=0.2):
    """
    ページを少しずつスクロールしてLazy Loadコンテンツを全て表示させる
    """
    script = """
        async ({step, delay}) => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            let totalHeight = 0;
            const distance = step;
            while (totalHeight < document.body.scrollHeight) {
                window.scrollBy(0, distance);
                totalHeight += distance;
                await sleep(delay * 1000);
            }
        }
    """
    page.evaluate(script, {"step": step, "delay": delay})
def reset_scroll(page):
    """
    Reset the scroll parent element's height and overflow to ensure full-page screenshots.
    """
    page.evaluate("""
    () => {
        const scrollBox = document.querySelector('.tui-scrollbar__container');
        if (scrollBox) {
            scrollBox.style.height = 'auto';
            scrollBox.style.maxHeight = 'none';
            scrollBox.style.overflow = 'visible';
        }
        document.body.style.overflow = 'visible';
        document.documentElement.style.overflow = 'visible';
    }
    """)
def scrape_1inch_docs(
    base_url: str = BASE_URL,
    output_dir: str = OUTPUT_DIR,
    merged_pdf_path: str = MERGED_PDF_PATH,
    headless: bool = False,
    slow_mo: int = 500
):
    """
    1inchのドキュメントをクロールして各ページをPDF化し、
    最後に1つのPDFに結合する。
    """
    os.makedirs(output_dir, exist_ok=True)
    pdf_paths = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, slow_mo=slow_mo)
        browser_context = browser.new_context(viewport={"width": 1600, "height": 12000})
        page = browser.new_page()
        page.goto(base_url, wait_until="networkidle")
        # Cookie同意ボタン
        try:
            agree_button = page.locator("button:has-text('I agree')")
            if agree_button.count() > 0:
                print("🍪 Cookie consent found. Clicking 'I agree'.")
                agree_button.first.click()
                time.sleep(1)
        except Exception as e:
            print(f"Cookie consent check failed: {e}")
        # ポップアップのXボタンをクリック
        try:
            page.click(
                "#cdk-overlay-2 div.text-day-static-white.absolute.right-0.top-0.cursor-pointer.p-3.hover\\:opacity-50.ng-tns-c3156289045-3",
                timeout=3000
            )
            print("🦄 Popup closed")
        except Exception as e:
            print("🦄 Popup not found, skipping", e)
        page_num = STARTNUMBER
        visited_urls = set()
        while True:
            current_url = page.url
            if current_url in visited_urls:
                print(":warning: 同じURLに戻ったため終了します")
                break
            visited_urls.add(current_url)
            # --- ページ全体をスクロールして全要素を表示 ---
            scroll_to_bottom(page)
            # Reset scroll settings before capturing the screenshot
            reset_scroll(page)
            # ページ全体のスクリーンショット保存
            full_height = page.evaluate("document.body.scrollHeight")
            title = page.title().replace(" - 1inch Developer Portal", "")
            safe_base = safe_filename(f"{page_num:02d}_{title}")
            img_path = os.path.join(output_dir, safe_base + ".png")
            txt_path = os.path.join(output_dir, safe_base + ".txt")
            print(f"[{page_num}] Saving screenshot: {img_path}")
            # スクリーンショット（ページ全体）
            page.screenshot(path=img_path, full_page=True)
            # ページ全体のテキストを取得して保存
            page_text = page.evaluate("document.body.innerText")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(page_text)
            # スクリーンショット保存完了待機
            for _ in range(50):
                if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
                    break
                time.sleep(0.1)
            pdf_paths.append(img_path)
            # ページ全体をPDFとして保存
            pdf_path = os.path.join(output_dir, safe_base + ".pdf")
            page.pdf(path=pdf_path, format="A4")
            print(f"[{page_num}] Saving PDF: {pdf_path}")
            # PDF保存完了待機
            for _ in range(50):
                if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
                    break
                time.sleep(0.1)
            pdf_paths.append(pdf_path)
            # "Next"リンク
            next_link = page.locator("dev-portal-documentation-pagination >> text=Next")
            if next_link.count() == 0:
                print("✅ Next link not found. Finished scraping.")
                break
            next_text = next_link.last.inner_text()
            print(f"➡️ Clicking Next link: {next_text}")
            prev_url = page.url
            next_link.last.click()
            # URL変化を待つ
            try:
                page.wait_for_url(lambda url: url != prev_url, timeout=10000)
            except:
                print("⚠️ Timeout waiting for URL change. Stopping.")
                break
            page_num += 1
        browser.close()
    print("\n🎉 All screenshots and text files saved in: {output_dir}")
    return pdf_paths
if __name__ == "__main__":
    scrape_1inch_docs()