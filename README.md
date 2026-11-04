# book-to-audiobook

**Book-to-audiobook API. Turn any EPUB, PDF, or TXT into an audiobook — in any of 600+ languages. Pay per character with Bitcoin Lightning. No signup, no API key, no KYC.**

> Alternative to ACX / Audible self-publishing (no platform gate), ElevenLabs + your own pipeline (no translation), and Speechify Pro (consumer app, not an API). MCP-native for agent frameworks.

A compound **AI audiobook generator API** that bundles book parsing (EPUB, PDF, TXT), chapter detection, text-to-speech with chapter markers, and optional translation into one HTTP endpoint. Useful for self-publishing audiobooks in underserved languages (Yoruba, Marathi, Cebuano, Swahili, Twi, Tamil, Amharic, Bengali, …), turning PDFs and reports into commute-friendly audio, translating foreign-language books into your own, or narrating in a cloned voice. Built on Sats4AI's L402 payment protocol.

Search terms: *epub to audiobook api, pdf to audiobook, ai audiobook generator, text to audiobook api, ai narration, self publish audiobook, audible alternative api, speechify alternative api, multilingual tts, yoruba audiobook, marathi audiobook, mcp audiobook tool, l402 tts*.

---

## What makes it different

- **602+ languages.** The default voice tier speaks Yoruba, Marathi, Bengali, Cebuano, Swahili, Twi, Tamil, Amharic, and hundreds more — the long tail Audible and mainstream TTS APIs don't touch.
- **Translation built in.** Feed a book in one language, set `translateToLanguage`, and get an audiobook narrated in the translated language. Translation cost is folded into the same payment.
- **Voice choice.** Three narration tiers — wide-coverage multilingual (100 chars/sat), premium emotion-control (50 chars/sat), or voice cloning from a reference clip (10 chars/sat). Pick per book.
- **Pay per character, no subscription.** Minimum 500 sats per job. POST once without payment to receive a priced invoice based on the actual character count of your book.
- **Front/back matter filtering.** Automatically skips preambles, tables of contents, indexes. Or pass `selectedChapterIndices` to pick exactly which chapters to narrate.
- **MCP-native.** Agent frameworks can call this as a single tool — the Lightning payment challenge is negotiated inside the protocol, no separate wallet integration needed.

---

## Quickstart

### Via MCP (agent-native — payment handled inline)

Sats4AI ships an MCP server bundling this and 35+ other services. Your agent discovers the `epub-audiobook` tool and invokes it directly — no "get 402, pay, retry" dance to write.

```
{
  "mcpServers": {
    "sats4ai": {
      "command": "npx",
      "args": ["-y", "sats4ai-mcp"]
    }
  }
}
```

### Via HTTP (any language, any Lightning wallet)

```bash
# Step 1: POST without auth → receive 402 + a priced Lightning invoice
#         (price depends on the book's character count and voice tier)
BOOK_B64=$(base64 -w 0 mybook.epub)

curl -i -X POST https://sats4ai.com/api/l402/epub-audiobook \
  -H "Content-Type: application/json" \
  -d "{
    \"epubBase64\": \"$BOOK_B64\",
    \"fileName\": \"mybook.epub\",
    \"language\": \"Spanish\",
    \"voice\": \"Ashley\",
    \"translateToLanguage\": \"Spanish\"
  }"

# Response:
#   HTTP/1.1 402 Payment Required
#   WWW-Authenticate: L402 macaroon="<b64>", invoice="lnbc..."

# Step 2: Pay the invoice with any Lightning wallet → you get a preimage

# Step 3: Retry with Authorization header
#         (same body — must match exactly; the macaroon commits to it)
curl -X POST https://sats4ai.com/api/l402/epub-audiobook \
  -H "Authorization: L402 <macaroon>:<preimage>" \
  -H "Content-Type: application/json" \
  -d "{ ...same body... }"

# Response (202 Accepted — async job):
#   { "jobId": "...", "jobType": "epub-audiobook", "status": "QUEUED",
#     "poll_url": "https://sats4ai.com/api/l402/job-status?requestId=...&jobType=epub-audiobook",
#     "poll_interval_ms": 5000 }

# Step 4: Poll until status is COMPLETED, then download resultUrl
curl "$POLL_URL"
# { "status": "COMPLETED", "resultUrl": "https://..." }
```

See [examples/](examples/) for runnable scripts in curl, Python, and TypeScript — each handles the full flow: encode, pay, poll, download.

---

## How it works

```
┌──────────┐   1. POST book           ┌─────────────┐
│  Client  │ ──────────────────────>  │   Sats4AI   │
│          │                          │ epub-audio  │
│          │ <────── 402 + invoice ── │   endpoint  │
└──────────┘   (priced per char)      └─────────────┘
      │
      │ 2. Pay via Lightning wallet
      │
      ▼
┌──────────┐   3. POST + L402 auth         Parse book (EPUB/PDF/TXT)
│  Client  │ ──────────────────────>         │
│          │ <────── 202 + jobId ──        Detect chapters
│          │                                  │
│          │ 4. Poll job-status           Translate (optional)
│          │ ──────────────────────>         │
│          │                               Synthesize per chapter
│          │ <── { status, progress }       │
│          │                               Stitch + chapter markers
│          │ 5. status=COMPLETED              │
│          │ <── { resultUrl } ───────── Upload + sign URL
└──────────┘
```

---

## Pricing

Dynamic per-character pricing. Minimum 500 sats per job. Exact amount is returned on the first POST (unauthorized) as a Lightning invoice.

| Voice tier | Character rate | Best for |
|---|---|---|
| Wide-coverage multilingual | 100 chars / sat | Underserved languages (Yoruba, Marathi, Cebuano, Twi, …) |
| Premium emotion-control | 50 chars / sat | English / high-resource languages, expressive narration |
| Voice clone (from sample) | 10 chars / sat | Narrate in your own voice, or a cloned voice |

Translation (when `translateToLanguage` is set) adds a per-character cost for the source-to-target conversion step, folded into the same invoice.

See [/api/estimate-cost](https://sats4ai.com/api/estimate-cost) to price a job before paying.

---

## Real use cases

- **Audiobooks in languages Audible won't cover.** Self-publish a Yoruba or Marathi audiobook when no platform does. You own the output; no platform gate.
- **Translate + narrate in one step.** Feed an English book, set `translateToLanguage: "Spanish"` — get a Spanish audiobook. One payment, one job.
- **Private audiobook of documents you own.** Long PDFs, reports, research papers you want to listen to on a commute. Your data doesn't train anyone's model.
- **Narrate in someone's voice.** Use the voice-clone tier with a sample clip — narrate a children's book in a parent's voice, or preserve a relative's narration style.
- **Agent-driven content pipelines.** An autonomous agent can produce audiobooks on demand without owning any TTS infrastructure or managing subscriptions.

---

## Request reference

| Field | Required | Example |
|---|---|---|
| `epubBase64` | yes | base64-encoded EPUB, PDF, or TXT (max 50 MB) |
| `fileName` | yes | `"mybook.epub"` (extension matters) |
| `voice` | no | `"Ashley"` |
| `language` | no | `"English"` (narration language name) |
| `speed` | no | `1.0` (range 0.5–2.0) |
| `modelId` | no | `"best"` — or pick a tier explicitly |
| `selectedChapterIndices` | no | `[0, 1, 2, 3]` (0-based). Omit for auto-filter. |
| `translateToLanguage` | no | `"Spanish"` — translate before narrating |

Full JSON Schema: [sats4ai.com/api/openapi.json](https://sats4ai.com/api/openapi.json) (tag: `epub-audiobook`).

---

## Polling

The 202 response gives you a `poll_url` and `poll_interval_ms`. Poll it:

```bash
curl "$POLL_URL"
# { "status": "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED", "progress": 0-100, "resultUrl": "..." }
```

Typical duration: a few minutes for a short book, up to 10 minutes for longer works. The job is cached server-side, safe to poll every 5–10 seconds.

---

## Compare

| | book-to-audiobook (Sats4AI) | Typical audiobook pipeline |
|---|---|---|
| Language coverage | 602+ (including Yoruba, Marathi, Cebuano, Twi, Swahili, Amharic, …) | Usually English + 10–30 big-languages |
| Translation | Built in — one API call | Build your own translate→narrate pipeline |
| Pricing | Per character (minimum 500 sats), no subscription | Monthly subscription + per-character on top |
| Signup | None | Email + credit card + sometimes org verification |
| Output ownership | Yours — no platform gate | Platform may restrict distribution |
| MCP-native | Yes | No (build your own agent integration) |

## Related

- [`ai-caller`](https://github.com/cnghockey/ai-caller) — AI voice agent API, pay per call with Lightning.
- [`pay-per-use-fax`](https://github.com/cnghockey/pay-per-use-fax) — Send a fax with Lightning, no contract.
- [`fax-to-email`](https://github.com/cnghockey/fax-to-email) — Receive faxes to your inbox, no monthly number rental.
- [`sats4ai-mcp`](https://github.com/cnghockey/sats4ai-mcp-server) — MCP server bundling all 35+ Sats4AI services.
- [`sats4ai-l402-examples`](https://github.com/cnghockey/sats4ai-l402-examples) — Full L402 examples across every service.

## Links

- **Sats4AI homepage** — https://sats4ai.com
- **Developer docs** — https://sats4ai.com/docs
- **OpenAPI spec** — https://sats4ai.com/api/openapi.json
- **L402 protocol reference** — https://sats4ai.com/docs#payment-protocols

## Support / donate
We turn the pile of books on your nightstand into audiobooks, in 600+ languages. The dishes will never be the same.

If this was useful to you and you like what we do, consider sending a few sats our way:

⚡ **`sats4ai@blink.sv`**

(It's a **Bitcoin Lightning** address: pay it from any Lightning wallet. Looks like an email, isn't one. Lightning sats only: no on-chain, no fiat, no cards, no altcoins, no refunds on gratitude.)

Not this time? That's cool too. We've been there. A star on the repo is a free hug.

## License

MIT — see [LICENSE](LICENSE).

<details>
<summary>Repository setup (for maintainers)</summary>

```bash
gh repo create cnghockey/book-to-audiobook --public --source=. \
  --description "Book-to-audiobook API — turn any EPUB/PDF/TXT into an audiobook in 600+ languages, with optional translation. Pay per character with Bitcoin Lightning. No signup." \
  --homepage "https://sats4ai.com" \
  --push

gh repo edit cnghockey/book-to-audiobook \
  --add-topic audiobook \
  --add-topic audiobook-generator \
  --add-topic ai-audiobook \
  --add-topic epub-to-audiobook \
  --add-topic pdf-to-audiobook \
  --add-topic text-to-speech \
  --add-topic tts \
  --add-topic multilingual \
  --add-topic translation \
  --add-topic ai-narration \
  --add-topic mcp \
  --add-topic model-context-protocol \
  --add-topic l402 \
  --add-topic lightning-network \
  --add-topic bitcoin \
  --add-topic pay-per-use \
  --add-topic no-signup \
  --add-topic self-publishing \
  --add-topic audible-alternative \
  --add-topic speechify-alternative
```

</details>
