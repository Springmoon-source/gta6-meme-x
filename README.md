# gta6-meme-x

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/Springmoon-source/gta6-meme-x/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/Springmoon-source/gta6-meme-x/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

One GTA 6 meme, drawn entirely with code: a Leonida-sunset checklist of everything we got before GTA VI — a whole pandemic, AI agents with jobs, space tourists, and turning into my dad — while make.fun's ghost leans in with a marker to tick the last box at last: GTA VI, out 19 November 2026 after the thirteen-year wait. The meme is the first picture of a post on X; the post is the entry, and `POST.json` names it. `make-meme.mjs` renders `meme.png` from scratch (a small software rasteriser and a hand-authored 5x7 pixel font, Node standard library only, byte-identical on every run), and `main.ts` hands `POST.json` to the grader.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=p4drgggs&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
