from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Desktop viewport screenshots
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # 1. Landing/Home page
    page.goto('http://localhost:3001')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='screenshots/01_landing_desktop.png', full_page=True)
    print("Captured: Landing page (desktop)")

    # 2. Try dark mode
    page.emulate_media(color_scheme='dark')
    page.wait_for_timeout(500)
    page.screenshot(path='screenshots/02_landing_desktop_dark.png', full_page=True)
    print("Captured: Landing page dark mode (desktop)")

    # Reset to light mode
    page.emulate_media(color_scheme='light')

    # 3. Try navigating to /app (protected route - will likely redirect to login)
    page.goto('http://localhost:3001/app')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)
    page.screenshot(path='screenshots/03_app_page_desktop.png', full_page=True)
    print("Captured: App page (desktop)")

    # 4. Try test-chat page
    page.goto('http://localhost:3001/test-chat')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)
    page.screenshot(path='screenshots/04_test_chat_desktop.png', full_page=True)
    print("Captured: Test chat page (desktop)")

    page.close()

    # Mobile viewport screenshots
    mobile = browser.new_page(viewport={"width": 390, "height": 844})

    # 5. Landing page mobile
    mobile.goto('http://localhost:3001')
    mobile.wait_for_load_state('networkidle')
    mobile.screenshot(path='screenshots/05_landing_mobile.png', full_page=True)
    print("Captured: Landing page (mobile)")

    # 6. App page mobile
    mobile.goto('http://localhost:3001/app')
    mobile.wait_for_load_state('networkidle')
    mobile.wait_for_timeout(1000)
    mobile.screenshot(path='screenshots/06_app_page_mobile.png', full_page=True)
    print("Captured: App page (mobile)")

    # 7. Test chat mobile
    mobile.goto('http://localhost:3001/test-chat')
    mobile.wait_for_load_state('networkidle')
    mobile.wait_for_timeout(1000)
    mobile.screenshot(path='screenshots/07_test_chat_mobile.png', full_page=True)
    print("Captured: Test chat page (mobile)")

    mobile.close()

    # Tablet viewport
    tablet = browser.new_page(viewport={"width": 768, "height": 1024})

    # 8. Landing page tablet
    tablet.goto('http://localhost:3001')
    tablet.wait_for_load_state('networkidle')
    tablet.screenshot(path='screenshots/08_landing_tablet.png', full_page=True)
    print("Captured: Landing page (tablet)")

    tablet.close()
    browser.close()
    print("\nAll screenshots captured successfully!")
