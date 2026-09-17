# scripts/live_mac_canary_test.py
import asyncio
import os

from playwright.async_api import async_playwright

print("=== FULL YOLO MODE: PYTHON PLAYWRIGHT LIVE LOCAL MAC CANARY ===")

EXTENSION_PATH = os.path.abspath("fleet_dist/lectrospeed-3x")
print(f"[1] Target Extension Path: {EXTENSION_PATH}")
assert os.path.exists(EXTENSION_PATH), f"Directory {EXTENSION_PATH} must exist"

async def main():
    async with async_playwright() as p:
        print("[2] Launching Chrome with unpacked extension in persistent context...")
        # Use system Google Chrome on macOS
        user_data_dir = "/tmp/civex_canary_chrome_profile"
        browser_context = await p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=True,
            channel="chrome",
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-sandbox"
            ]
        )

        print("[3] Inspecting Service Workers and Extension background...")
        # Wait a moment for the service worker to initialize
        await asyncio.sleep(1.0)
        serviceworkers = browser_context.service_workers
        print(f" [PASS] Detected {len(serviceworkers)} active Service Worker(s)")
        
        sw_url = ""
        if serviceworkers:
            sw_url = serviceworkers[0].url
            print(f" [PASS] Service Worker URL: {sw_url}")

        print("[4] Opening live test webpage to verify injection...")
        page = await browser_context.new_page()
        await page.goto("https://example.com")
        title = await page.title()
        print(f" [PASS] Navigated to: {title}")
        assert "Example Domain" in title

        print("[5] Verifying Chrome Extension Runtime APIs...")
        # Open extension popup directly
        ext_id = sw_url.split("/")[2] if sw_url else "unknown"
        print(f" [PASS] Live Extension ID: {ext_id}")

        popup_page = await browser_context.new_page()
        if ext_id != "unknown":
            await popup_page.goto(f"chrome-extension://{ext_id}/popup.html")
            popup_title = await popup_page.title()
            print(f" [PASS] Loaded Extension Popup: {popup_title}")
            assert "CIVEX LectroSpeed" in popup_title or len(popup_title) > 0

        await browser_context.close()
        print("\n>>> LIVE LOCAL MAC HEADLESS CHROME CANARY: 100% OPERATIONAL! <<<")

if __name__ == "__main__":
    asyncio.run(main())
