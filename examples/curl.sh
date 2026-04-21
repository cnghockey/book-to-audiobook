#!/usr/bin/env bash
#
# book-to-audiobook — bash / curl example
#
# Requires:
#   - curl, jq, base64
#   - any Lightning wallet that can pay a bolt11 and return a preimage
#     (Alby, Phoenix, Zeus, LNBits, etc.)
#
# Usage:
#   BOOK=./mybook.epub LANGUAGE="Spanish" ./curl.sh
#   BOOK=./mybook.epub TRANSLATE_TO="Yoruba" ./curl.sh

set -euo pipefail

ENDPOINT="${ENDPOINT:-https://sats4ai.com/api/l402/epub-audiobook}"
BOOK="${BOOK:?set BOOK to a path to a .epub, .pdf, or .txt file}"
LANGUAGE="${LANGUAGE:-English}"
VOICE="${VOICE:-Ashley}"
TRANSLATE_TO="${TRANSLATE_TO:-}"

[[ -f "$BOOK" ]] || { echo "file not found: $BOOK" >&2; exit 1; }

echo "→ Encoding $(basename "$BOOK")"
BOOK_B64=$(base64 -w 0 "$BOOK" 2>/dev/null || base64 "$BOOK" | tr -d '\n')
FILENAME=$(basename "$BOOK")

BODY=$(jq -n \
  --arg epubBase64 "$BOOK_B64" \
  --arg fileName "$FILENAME" \
  --arg language "$LANGUAGE" \
  --arg voice "$VOICE" \
  --arg translateToLanguage "$TRANSLATE_TO" \
  '{epubBase64:$epubBase64, fileName:$fileName, language:$language, voice:$voice}
   + (if $translateToLanguage == "" then {} else {translateToLanguage:$translateToLanguage} end)')

echo "→ Step 1: requesting priced invoice"
HEADERS=$(curl -si -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY" | tr -d '\r')

WWW_AUTH=$(echo "$HEADERS" | awk 'tolower($1)=="www-authenticate:" {sub(/^[^:]+:[ ]*/,""); print; exit}')
MACAROON=$(echo "$WWW_AUTH" | sed -n 's/.*macaroon="\([^"]*\)".*/\1/p')
INVOICE=$(echo "$WWW_AUTH"  | sed -n 's/.*invoice="\([^"]*\)".*/\1/p')

if [[ -z "$MACAROON" || -z "$INVOICE" ]]; then
  echo "  ✗ Did not receive a 402 challenge. Response headers:" >&2
  echo "$HEADERS" >&2
  exit 1
fi

echo "  ✓ Got invoice"
echo ""
echo "→ Step 2: pay this invoice with your Lightning wallet, then paste the preimage"
echo ""
echo "$INVOICE"
echo ""
read -rp "preimage (hex): " PREIMAGE

echo "→ Step 3: submitting authenticated job"
RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 ${MACAROON}:${PREIMAGE}" \
  -d "$BODY")

echo "$RESPONSE" | jq .

POLL_URL=$(echo "$RESPONSE" | jq -r '.poll_url // empty')
POLL_MS=$(echo "$RESPONSE"  | jq -r '.poll_interval_ms // 5000')
[[ -z "$POLL_URL" ]] && { echo "no poll_url in response"; exit 1; }

echo ""
echo "→ Step 4: polling $POLL_URL every $((POLL_MS/1000))s"
while :; do
  sleep "$((POLL_MS/1000))"
  STATUS_JSON=$(curl -s "$POLL_URL")
  STATE=$(echo "$STATUS_JSON" | jq -r '.status // empty')
  PROGRESS=$(echo "$STATUS_JSON" | jq -r '.progress // empty')
  echo "  [$STATE${PROGRESS:+ ${PROGRESS}%}]"
  case "$STATE" in
    COMPLETED)
      RESULT_URL=$(echo "$STATUS_JSON" | jq -r '.resultUrl // .result.resultUrl // empty')
      echo ""
      echo "✓ Audiobook ready:"
      echo "   $RESULT_URL"
      exit 0
      ;;
    FAILED)
      echo ""
      echo "✗ Job failed:"
      echo "$STATUS_JSON" | jq .
      exit 1
      ;;
  esac
done
