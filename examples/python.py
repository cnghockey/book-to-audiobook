"""
book-to-audiobook — Python example.

Requires:
    pip install requests

Usage:
    python python.py ./mybook.epub --language Spanish
    python python.py ./mybook.epub --translate-to Yoruba
"""

from __future__ import annotations

import argparse
import base64
import pathlib
import re
import sys
import time

import requests

ENDPOINT = "https://sats4ai.com/api/l402/epub-audiobook"


def parse_challenge(www_authenticate: str) -> tuple[str, str]:
    mac = re.search(r'macaroon="([^"]+)"', www_authenticate)
    inv = re.search(r'invoice="([^"]+)"', www_authenticate)
    if not (mac and inv):
        raise RuntimeError(f"Could not parse L402 challenge: {www_authenticate!r}")
    return mac.group(1), inv.group(1)


def run(book_path: pathlib.Path, body_extras: dict) -> None:
    body = {
        "epubBase64": base64.b64encode(book_path.read_bytes()).decode(),
        "fileName": book_path.name,
        **body_extras,
    }

    # Step 1 — request priced invoice
    r = requests.post(ENDPOINT, json=body)
    if r.status_code != 402:
        sys.exit(f"Expected 402, got {r.status_code}: {r.text}")
    macaroon, invoice = parse_challenge(r.headers["WWW-Authenticate"])

    # Step 2 — pay out-of-band
    print("\nPay this invoice with your Lightning wallet:\n")
    print(invoice + "\n")
    preimage = input("preimage (hex): ").strip()

    # Step 3 — submit authenticated job
    r = requests.post(
        ENDPOINT,
        json=body,
        headers={"Authorization": f"L402 {macaroon}:{preimage}"},
    )
    r.raise_for_status()
    job = r.json()
    print("\n202 Accepted:", job)

    poll_url = job["poll_url"]
    poll_ms = job.get("poll_interval_ms", 5000)

    # Step 4 — poll
    print(f"\nPolling {poll_url} every {poll_ms / 1000:.0f}s")
    while True:
        time.sleep(poll_ms / 1000)
        status = requests.get(poll_url).json()
        state = status.get("status")
        progress = status.get("progress")
        print(f"  [{state}{f' {progress}%' if progress is not None else ''}]")
        if state == "COMPLETED":
            result_url = status.get("resultUrl") or status.get("result", {}).get("resultUrl")
            print(f"\n✓ Audiobook ready: {result_url}")
            return
        if state == "FAILED":
            sys.exit(f"✗ Job failed: {status}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("book", type=pathlib.Path, help="Path to .epub, .pdf, or .txt")
    p.add_argument("--language", default="English", help="Narration language name")
    p.add_argument("--voice", default="Ashley")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--translate-to", default=None, help="Translate book before narrating")
    p.add_argument("--chapters", default=None,
                   help="Comma-separated 0-based chapter indices (omit for auto-filter)")
    args = p.parse_args()

    if not args.book.is_file():
        sys.exit(f"file not found: {args.book}")

    extras: dict = {"language": args.language, "voice": args.voice, "speed": args.speed}
    if args.translate_to:
        extras["translateToLanguage"] = args.translate_to
    if args.chapters:
        extras["selectedChapterIndices"] = [int(x) for x in args.chapters.split(",")]

    run(args.book, extras)


if __name__ == "__main__":
    main()
