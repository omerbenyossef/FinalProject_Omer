import asyncio
import schedule
import time
from datetime import datetime, timedelta
from playwright.async_api import async_playwright

# --- הגדרות ---
RESTAURANT_URL = "https://ontopo.com/he/il/page/18491100"
GUESTS = 4
BOOKING_TIME = "13:00"
NAME = "עומר בן יוסף"
PHONE = "0549225933"
EMAIL = "omerbenyossef77@gmail.com"


def get_next_sunday():
    today = datetime.now()
    # Sunday = weekday 6 in Python
    days_ahead = (6 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


async def book_restaurant():
    next_sunday = get_next_sunday()
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] מתחיל תהליך הזמנה ל-{next_sunday.strftime('%d/%m/%Y')} בשעה {BOOKING_TIME}")

    async with async_playwright() as p:
        # headless=False = רואים את הדפדפן (שימושי לאימות SMS)
        browser = await p.chromium.launch(headless=False, slow_mo=500)
        context = await browser.new_context(locale="he-IL")
        page = await context.new_page()

        try:
            print("נכנס לדף המסעדה...")
            await page.goto(RESTAURANT_URL, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)

            # --- שלב 1: בחירת מספר סועדים ---
            print(f"בוחר {GUESTS} סועדים...")
            # Ontopo widget - לחיצה על כפתורי + עד למספר הרצוי
            for _ in range(GUESTS - 2):  # ברירת מחדל היא בדרך כלל 2
                plus_btn = page.locator('button[aria-label*="הוסף"], button[aria-label*="plus"], [data-testid*="increase"]').first
                if await plus_btn.is_visible():
                    await plus_btn.click()
                    await page.wait_for_timeout(300)

            # --- שלב 2: בחירת תאריך ---
            print(f"בוחר תאריך: {next_sunday.strftime('%d/%m/%Y')}...")
            date_btn = page.locator('[data-testid*="date"], button:has-text("תאריך"), .date-picker').first
            if await date_btn.is_visible():
                await date_btn.click()
                await page.wait_for_timeout(1000)

            # ניווט בלוח השנה לתאריך הנכון
            target_day = str(next_sunday.day)
            day_btn = page.locator(f'button:has-text("{target_day}"), [aria-label*="{next_sunday.strftime("%d")}"]').first
            if await day_btn.is_visible():
                await day_btn.click()
                await page.wait_for_timeout(1000)

            # --- שלב 3: בחירת שעה ---
            print(f"בוחר שעה: {BOOKING_TIME}...")
            time_btn = page.locator(f'button:has-text("{BOOKING_TIME}"), [data-testid*="time"]:has-text("{BOOKING_TIME}")').first
            if await time_btn.is_visible():
                await time_btn.click()
                await page.wait_for_timeout(1000)
            else:
                # נסיון עם "13:00" בלבד
                time_btn = page.locator('button:has-text("13:00")').first
                await time_btn.click()
                await page.wait_for_timeout(1000)

            # --- שלב 4: מילוי פרטים אישיים ---
            print("ממלא פרטים אישיים...")
            await page.fill('input[name="firstName"], input[placeholder*="שם פרטי"]', "עומר")
            await page.fill('input[name="lastName"], input[placeholder*="שם משפחה"]', "בן יוסף")
            await page.fill('input[name="phone"], input[type="tel"]', PHONE)
            await page.fill('input[name="email"], input[type="email"]', EMAIL)

            # --- שלב 5: לחיצה על אישור ---
            print("שולח הזמנה...")
            submit = page.locator('button[type="submit"], button:has-text("הזמן"), button:has-text("אשר הזמנה")').first
            await submit.click()

            print("\n✓ בקשת ההזמנה נשלחה!")
            print("⚠️  אם נדרש אימות SMS — המסך פתוח, אשר ידנית.")
            print("הדפדפן יישאר פתוח למשך 2 דקות לאימות...")

            # ממתין לאימות SMS ידני אם נדרש
            await page.wait_for_timeout(120000)

        except Exception as e:
            print(f"\n✗ שגיאה: {e}")
            screenshot_path = f"error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            await page.screenshot(path=screenshot_path)
            print(f"צולם screenshot: {screenshot_path}")

        finally:
            await browser.close()
            print("הדפדפן נסגר.")


def run_booking():
    asyncio.run(book_restaurant())


if __name__ == "__main__":
    print("=" * 50)
    print("  בוט הזמנות - נאם מסעדה")
    print("=" * 50)
    next_sunday = get_next_sunday()
    print(f"ההזמנה הבאה: יום ראשון {next_sunday.strftime('%d/%m/%Y')} | 13:00 | 4 אנשים")
    print("\nלהרצה מיידית (לבדיקה): הסר את ה-# משורה הבאה")
    print("# run_booking()")
    print("\nהבוט פעיל וממתין ליום ראשון בשעה 12:00...")
    print("לעצירה: Ctrl+C\n")

    # מריץ כל יום ראשון ב-12:00 (שעה לפני ההזמנה)
    schedule.every().sunday.at("12:00").do(run_booking)

    while True:
        schedule.run_pending()
        time.sleep(60)
