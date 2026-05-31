"""
Ontopo restaurant booking automation using Playwright.
Searches for a restaurant by name and books a table for Saturday dinner.
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import Page, async_playwright

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("booking.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "config.json"
SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"

ONTOPO_BASE_URL = "https://ontopo.com/he/il"

DAYS_MAP = {
    "sunday": 6,
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
}

HEBREW_MONTHS = {
    1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל",
    5: "מאי", 6: "יוני", 7: "יולי", 8: "אוגוסט",
    9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
}


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_next_weekday(target_day_name: str, advance_days: int = 0) -> datetime:
    """Return the next occurrence of target_day_name, at least advance_days away."""
    target = DAYS_MAP.get(target_day_name.lower(), 5)  # default Saturday
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    min_date = today + timedelta(days=advance_days)
    days_ahead = target - min_date.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return min_date + timedelta(days=days_ahead)


async def save_screenshot(page: Page, name: str):
    SCREENSHOTS_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = SCREENSHOTS_DIR / f"{name}_{ts}.png"
    await page.screenshot(path=str(path), full_page=True)
    logger.info(f"Screenshot: {path}")


async def try_click(page: Page, selectors: list[str], timeout: int = 3000) -> bool:
    """Try clicking each selector; return True if one succeeds."""
    for sel in selectors:
        try:
            await page.click(sel, timeout=timeout)
            return True
        except Exception:
            pass
    return False


async def try_fill(page: Page, selectors: list[str], value: str, timeout: int = 3000) -> bool:
    """Try filling each selector; return True if one succeeds."""
    for sel in selectors:
        try:
            el = await page.wait_for_selector(sel, timeout=timeout)
            if el:
                await el.fill(value)
                return True
        except Exception:
            pass
    return False


async def search_restaurant(page: Page, name: str, city: str) -> bool:
    """Navigate to Ontopo and search for the restaurant. Returns True if found."""
    logger.info(f"Searching for restaurant: {name} in {city}")
    await page.goto(ONTOPO_BASE_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    await save_screenshot(page, "01_homepage")

    # Try search input
    search_selectors = [
        'input[placeholder*="מסעדה"]',
        'input[placeholder*="חיפוש"]',
        'input[placeholder*="Search"]',
        'input[type="search"]',
        '[data-testid="search-input"]',
        '[class*="search"] input',
        '[class*="Search"] input',
    ]

    filled = await try_fill(page, search_selectors, name)
    if not filled:
        logger.error("Could not find search input on homepage")
        await save_screenshot(page, "error_no_search")
        return False

    await page.keyboard.press("Enter")
    await page.wait_for_timeout(2000)
    await save_screenshot(page, "02_search_results")

    # Click first matching restaurant result
    result_selectors = [
        f'[class*="restaurant-card"]:has-text("{name}")',
        f'[class*="result"]:has-text("{name}")',
        f'a:has-text("{name}")',
        f'[class*="card"]:has-text("{name}")',
    ]

    clicked = await try_click(page, result_selectors, timeout=5000)
    if not clicked:
        # Try clicking first result
        first_result_selectors = [
            '[class*="restaurant-card"]:first-child',
            '[class*="result-item"]:first-child',
            '[class*="search-result"]:first-child a',
        ]
        clicked = await try_click(page, first_result_selectors, timeout=5000)

    if not clicked:
        logger.error("Could not find restaurant in search results")
        await save_screenshot(page, "error_no_result")
        return False

    await page.wait_for_timeout(2000)
    await save_screenshot(page, "03_restaurant_page")
    logger.info(f"Opened restaurant page: {page.url}")
    return True


async def select_booking_params(page: Page, reservation_date: datetime, time_str: str, guests: int) -> bool:
    """Fill in date, time and guest count in the booking widget."""

    # ── Guests ────────────────────────────────────────────────────────────────
    logger.info(f"Setting guests: {guests}")
    guest_selectors = [
        f'button[data-guests="{guests}"]',
        f'[data-testid="guests-{guests}"]',
        f'button[aria-label*="{guests} סועדים"]',
    ]
    if not await try_click(page, guest_selectors, timeout=3000):
        # Try select element
        try:
            await page.select_option('select[name*="guest"], select[name*="people"]', str(guests), timeout=3000)
        except Exception:
            # Try +/- buttons to reach target guest count
            try:
                current_el = await page.query_selector('[class*="guest-count"], [class*="guests-number"]')
                if current_el:
                    current = int((await current_el.text_content() or "2").strip())
                    plus_btn = '[class*="guest"] [class*="plus"], [class*="guest"] button:last-child'
                    minus_btn = '[class*="guest"] [class*="minus"], [class*="guest"] button:first-child'
                    diff = guests - current
                    btn = plus_btn if diff > 0 else minus_btn
                    for _ in range(abs(diff)):
                        await try_click(page, [btn], timeout=1000)
            except Exception:
                logger.warning("Could not set guest count precisely")

    await save_screenshot(page, "04_guests")

    # ── Date ──────────────────────────────────────────────────────────────────
    logger.info(f"Setting date: {reservation_date.strftime('%d/%m/%Y')}")
    date_iso = reservation_date.strftime("%Y-%m-%d")

    date_filled = await try_fill(
        page,
        ['input[type="date"]', 'input[name*="date"]', 'input[placeholder*="תאריך"]'],
        date_iso,
    )

    if not date_filled:
        # Try opening a calendar and clicking the correct day
        await try_click(
            page,
            ['[class*="datepicker"]', '[class*="calendar-btn"]', '[class*="date-picker"]', 'input[placeholder*="תאריך"]'],
            timeout=3000,
        )
        await page.wait_for_timeout(500)
        day_num = str(reservation_date.day)
        day_selectors = [
            f'[class*="calendar"] td:has-text("{day_num}")',
            f'[class*="calendar"] button:has-text("{day_num}")',
            f'[class*="day"]:has-text("{day_num}")',
            f'td[data-date="{date_iso}"]',
        ]
        if not await try_click(page, day_selectors, timeout=3000):
            logger.warning("Could not set date via calendar")

    await save_screenshot(page, "05_date")

    # ── Time ──────────────────────────────────────────────────────────────────
    logger.info(f"Setting time: {time_str}")
    time_selectors = [
        f'button:has-text("{time_str}")',
        f'[data-time="{time_str}"]',
        f'[class*="time-slot"]:has-text("{time_str}")',
        f'[class*="timeslot"]:has-text("{time_str}")',
        f'option[value="{time_str}"]',
    ]
    time_set = await try_click(page, time_selectors, timeout=3000)
    if not time_set:
        await try_fill(page, ['select[name*="time"]', 'input[name*="time"]'], time_str)

    await save_screenshot(page, "06_time")

    # ── Search for available slots ─────────────────────────────────────────────
    search_btn_selectors = [
        'button:has-text("חפש")',
        'button:has-text("מצא שולחן")',
        'button:has-text("הצג שעות")',
        'button:has-text("Search")',
        '[class*="search-btn"]',
        '[class*="find-btn"]',
        'button[type="submit"]',
    ]
    await try_click(page, search_btn_selectors, timeout=3000)
    await page.wait_for_timeout(2000)
    await save_screenshot(page, "07_slots")
    return True


async def confirm_booking(page: Page, time_str: str, contact: dict, dry_run: bool) -> bool:
    """Click a matching time slot then fill in and submit the contact form."""

    # Click the specific time slot
    slot_selectors = [
        f'button:has-text("{time_str}")',
        f'[class*="slot"]:has-text("{time_str}")',
        f'[class*="time"]:has-text("{time_str}")',
    ]
    slot_clicked = await try_click(page, slot_selectors, timeout=5000)
    if not slot_clicked:
        # Click any available slot
        any_slot_selectors = [
            '[class*="available-slot"]:first-child',
            '[class*="time-slot"]:first-child',
            '[class*="slot"]:first-child',
        ]
        await try_click(page, any_slot_selectors, timeout=3000)

    await page.wait_for_timeout(1500)
    await save_screenshot(page, "08_booking_form")

    # Fill name
    if contact.get("name"):
        await try_fill(
            page,
            ['input[name*="name"]', 'input[placeholder*="שם"]', 'input[placeholder*="Name"]', "#name", "#full_name"],
            contact["name"],
        )

    # Fill phone
    if contact.get("phone"):
        await try_fill(
            page,
            ['input[type="tel"]', 'input[name*="phone"]', 'input[placeholder*="טלפון"]', "#phone", "#mobile"],
            contact["phone"],
        )

    # Fill email
    if contact.get("email"):
        await try_fill(
            page,
            ['input[type="email"]', 'input[name*="email"]', 'input[placeholder*="מייל"]', "#email"],
            contact["email"],
        )

    await save_screenshot(page, "09_form_filled")

    if dry_run:
        logger.info("DRY RUN mode – booking form filled but NOT submitted.")
        return True

    # Submit
    submit_selectors = [
        'button:has-text("אשר הזמנה")',
        'button:has-text("הזמן")',
        'button:has-text("שלח")',
        'button:has-text("Confirm")',
        'button:has-text("Book")',
        'button[type="submit"]',
    ]
    submitted = await try_click(page, submit_selectors, timeout=5000)
    if not submitted:
        logger.error("Could not find submit button")
        await save_screenshot(page, "error_no_submit")
        return False

    await page.wait_for_timeout(3000)
    await save_screenshot(page, "10_confirmation")
    logger.info("Booking submitted successfully!")
    return True


async def run_booking(guests: int | None = None) -> bool:
    config = load_config()
    booking = config["booking"]
    options = config["options"]

    contact = {
        "name": os.getenv("CONTACT_NAME", ""),
        "phone": os.getenv("CONTACT_PHONE", ""),
        "email": os.getenv("CONTACT_EMAIL", ""),
    }

    if not contact["name"] or not contact["phone"]:
        logger.error("Missing contact details. Copy .env.example to .env and fill in your details.")
        return False

    if guests is None:
        guests = booking.get("guests", 2)

    reservation_date = get_next_weekday(
        booking["reservation_day"],
        advance_days=booking.get("advance_days", 5),
    )
    reservation_time = booking["reservation_time"]

    logger.info(
        f"Starting booking: {config['restaurant_name']} | "
        f"{reservation_date.strftime('%d/%m/%Y')} ({booking['reservation_day']}) "
        f"at {reservation_time} | {guests} guests"
    )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=options.get("headless", True),
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = await browser.new_context(
            locale="he-IL",
            timezone_id="Asia/Jerusalem",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()

        try:
            found = await search_restaurant(page, config["restaurant_name"], config.get("restaurant_city", ""))
            if not found:
                return False

            params_ok = await select_booking_params(page, reservation_date, reservation_time, guests)
            if not params_ok:
                return False

            success = await confirm_booking(page, reservation_time, contact, options.get("dry_run", False))
            return success

        except Exception as exc:
            logger.exception(f"Booking failed: {exc}")
            if options.get("screenshot_on_error", True):
                await save_screenshot(page, "error_unexpected")
            return False
        finally:
            await browser.close()


async def run_with_retry(guests: int | None = None) -> bool:
    config = load_config()
    attempts = config["options"].get("retry_attempts", 3)
    delay = config["options"].get("retry_delay_seconds", 60)

    for attempt in range(1, attempts + 1):
        logger.info(f"Attempt {attempt}/{attempts}")
        success = await run_booking(guests)
        if success:
            return True
        if attempt < attempts:
            logger.info(f"Retrying in {delay} seconds…")
            await asyncio.sleep(delay)

    logger.error("All booking attempts failed.")
    return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Book a restaurant on Ontopo")
    parser.add_argument("--guests", type=int, default=None, help="Number of guests (overrides config)")
    parser.add_argument("--dry-run", action="store_true", help="Fill form but do not submit")
    args = parser.parse_args()

    if args.dry_run:
        config = load_config()
        config["options"]["dry_run"] = True
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

    result = asyncio.run(run_with_retry(guests=args.guests))
    sys.exit(0 if result else 1)
