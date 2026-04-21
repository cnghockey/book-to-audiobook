/**
 * book-to-audiobook — TypeScript example (Node 18+).
 *
 * No dependencies — uses built-in fetch, fs, readline.
 *
 * Usage:
 *   npx tsx typescript.ts ./mybook.epub --language Spanish
 *   npx tsx typescript.ts ./mybook.epub --translate-to Yoruba
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ENDPOINT = "https://sats4ai.com/api/l402/epub-audiobook";

interface JobBody {
    epubBase64: string;
    fileName: string;
    language?: string;
    voice?: string;
    speed?: number;
    modelId?: string;
    selectedChapterIndices?: number[];
    translateToLanguage?: string;
}

function parseChallenge(header: string): { macaroon: string; invoice: string } {
    const mac = header.match(/macaroon="([^"]+)"/);
    const inv = header.match(/invoice="([^"]+)"/);
    if (!mac || !inv) throw new Error(`Could not parse L402 challenge: ${header}`);
    return { macaroon: mac[1], invoice: inv[1] };
}

async function run(body: JobBody): Promise<void> {
    // Step 1 — request priced invoice
    const r1 = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (r1.status !== 402) {
        throw new Error(`Expected 402, got ${r1.status}: ${await r1.text()}`);
    }
    const { macaroon, invoice } = parseChallenge(r1.headers.get("www-authenticate") ?? "");

    // Step 2 — pay out-of-band
    console.log("\nPay this invoice with your Lightning wallet:\n");
    console.log(invoice + "\n");
    const rl = readline.createInterface({ input, output });
    const preimage = (await rl.question("preimage (hex): ")).trim();
    rl.close();

    // Step 3 — submit authenticated job
    const r2 = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `L402 ${macaroon}:${preimage}`,
        },
        body: JSON.stringify(body),
    });
    if (!r2.ok) throw new Error(`Submission failed: ${r2.status} ${await r2.text()}`);
    const job = await r2.json();
    console.log("\n202 Accepted:", job);

    const pollUrl: string = job.poll_url;
    const pollMs: number = job.poll_interval_ms ?? 5000;

    // Step 4 — poll
    console.log(`\nPolling ${pollUrl} every ${Math.round(pollMs / 1000)}s`);
    while (true) {
        await new Promise((r) => setTimeout(r, pollMs));
        const status = await (await fetch(pollUrl)).json();
        const progress = status.progress !== undefined ? ` ${status.progress}%` : "";
        console.log(`  [${status.status}${progress}]`);
        if (status.status === "COMPLETED") {
            const resultUrl = status.resultUrl ?? status.result?.resultUrl;
            console.log(`\n✓ Audiobook ready: ${resultUrl}`);
            return;
        }
        if (status.status === "FAILED") throw new Error(`Job failed: ${JSON.stringify(status)}`);
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    if (argv.length < 1 || argv[0].startsWith("--")) {
        console.error("Usage: typescript.ts <book-path> [--language Spanish] [--voice Ashley] [--speed 1.0] [--translate-to Yoruba] [--chapters 0,1,2]");
        process.exit(1);
    }
    const bookPath = argv[0];
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };

    const bytes = await fs.readFile(bookPath);
    const body: JobBody = {
        epubBase64: bytes.toString("base64"),
        fileName: path.basename(bookPath),
        language: get("--language") ?? "English",
        voice: get("--voice") ?? "Ashley",
        speed: Number(get("--speed") ?? "1.0"),
    };
    const translateTo = get("--translate-to");
    if (translateTo) body.translateToLanguage = translateTo;
    const chapters = get("--chapters");
    if (chapters) body.selectedChapterIndices = chapters.split(",").map((n) => Number(n));

    await run(body);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
