"""
Weekly scheduler – runs the Ontopo restaurant booking every week
on the day/time defined in config.json under scheduler.run_day / run_time.

Usage:
    python scheduler.py                  # run scheduler continuously
    python scheduler.py --now            # trigger booking immediately (useful for testing)
    python scheduler.py --now --guests 4 # immediate booking for 4 guests
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

import schedule
import time as _time

from restaurant_booking import CONFIG_PATH, run_with_retry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("scheduler.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

SCHEDULE_DAYS = {
    "sunday": schedule.every().sunday,
    "monday": schedule.every().monday,
    "tuesday": schedule.every().tuesday,
    "wednesday": schedule.every().wednesday,
    "thursday": schedule.every().thursday,
    "friday": schedule.every().friday,
    "saturday": schedule.every().saturday,
}


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def booking_job(guests: int | None = None, dry_run: bool = False):
    logger.info("=== Weekly booking job started ===")
    result = asyncio.run(run_with_retry(guests=guests, dry_run=dry_run or None))
    if result:
        logger.info("=== Booking job completed successfully ===")
    else:
        logger.error("=== Booking job FAILED ===")


def setup_schedule(guests: int | None = None, dry_run: bool = False):
    config = load_config()
    sched_cfg = config.get("scheduler", {})
    run_day = sched_cfg.get("run_day", "monday").lower()
    run_time = sched_cfg.get("run_time", "10:00")

    day_scheduler = SCHEDULE_DAYS.get(run_day)
    if day_scheduler is None:
        logger.error(f"Unknown scheduler day: {run_day}. Use monday–sunday.")
        sys.exit(1)

    day_scheduler.at(run_time).do(booking_job, guests=guests, dry_run=dry_run)

    logger.info(
        f"Scheduler ready – will book every {run_day.capitalize()} at {run_time} "
        f"(restaurant: {config['restaurant_name']}, "
        f"reservation: {config['booking']['reservation_day']} {config['booking']['reservation_time']})"
    )


def main():
    parser = argparse.ArgumentParser(description="Weekly Ontopo restaurant booking scheduler")
    parser.add_argument("--now", action="store_true", help="Run booking immediately instead of waiting")
    parser.add_argument("--guests", type=int, default=None, help="Number of guests (overrides config)")
    parser.add_argument("--dry-run", action="store_true", help="Fill form but do not submit")
    args = parser.parse_args()

    if args.now:
        logger.info("Running booking immediately (--now flag)")
        booking_job(guests=args.guests, dry_run=args.dry_run)
        return

    setup_schedule(guests=args.guests, dry_run=args.dry_run)

    logger.info("Scheduler running. Press Ctrl+C to stop.")
    try:
        while True:
            schedule.run_pending()
            _time.sleep(30)
    except KeyboardInterrupt:
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    main()
