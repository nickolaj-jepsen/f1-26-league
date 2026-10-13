# F1 26 League

Results and standings for our F1 26 league, published at https://nickolaj-jepsen.github.io/f1-26-league/.

It's a static [Astro](https://astro.build) site. Every push to `main` builds it and deploys it to GitHub Pages.

## Data

Everything lives in `data/`:

| Path | What |
| --- | --- |
| `drivers.yml` | League drivers, their seat for the season, and gamertag spellings |
| `teams.yml` | Teams as the game names them, plus colours |
| `calendar.yml` | The 24-round 2026 calendar |
| `rounds/rNN-<id>.yml` | One file per raced round, sourced from a CSV export or screenshots |
| `raw/` | The game's CSV exports, unchanged |
| `screenshots/` | Result screenshots for races without an export |

Points are taken from the game as-is. The constructors' table counts every car, AI included.

## Adding a race

In Claude Code, ask it to "add last night's races" or paste a screenshot. The `add-race` skill (`.claude/skills/add-race/SKILL.md`) has the details, and you can also follow it by hand.

## Development

```sh
npm install
npm run dev      # http://localhost:4321/f1-26-league/
npm run build
```
