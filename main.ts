// gta6-meme-x-01 entry program (Node 22, standard library only).
//
// The entry itself is a post on X: a GTA 6 meme picture plus its text,
// which the house reads from X directly. All this program has to do is
// hand the post's address to the grader: it copies POST.json from the
// repository root into the output directory, where the gate reads it.
//
// Before copying, it checks the file is the shape the gate wants — a
// JSON object whose "url" is an X post address — so a placeholder or a
// typo fails loudly here instead of quietly at grading time.
//
// Outside the grader, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// The program writes the same bytes on every run: it copies the file
// as it stands and prints nothing on success.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const postFile = join(botDir, 'POST.json');

let post: unknown;
try {
  post = JSON.parse(readFileSync(postFile, 'utf8'));
} catch (err) {
  console.error(`POST.json is not readable JSON: ${(err as Error).message}`);
  process.exit(1);
}

const url = (post as { url?: unknown })?.url;
const postAddress = /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+\/?([?#].*)?$/;
if (typeof url !== 'string' || !postAddress.test(url)) {
  console.error('POST.json must name a post as {"url": "https://x.com/<handle>/status/<id>"}');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(postFile, join(outputDir, 'POST.json'));
