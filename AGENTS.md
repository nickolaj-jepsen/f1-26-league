## Project

Static site with the standings for our F1 26 league, deployed to GitHub Pages (`base: /f1-26-league`). All data is in `data/` (see README). `src/lib/league.ts` loads it, parses the raw CSVs at build time, and computes the standings and stats. To add results, use the `add-race` skill.

- Link internally with `url()` from `src/lib/league.ts` so the base path is applied.
- Never edit files in `data/raw/`. They are the game's exports, kept unchanged.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
