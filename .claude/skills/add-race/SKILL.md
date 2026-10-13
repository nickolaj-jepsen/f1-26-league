---
name: add-race
description: Add new F1 26 league race results to the site, from the game's CSV exports or from result screenshots. Use when the user says things like "add last night's races", "add the Canada result", or pastes a results screenshot.
---

# Add race results

Each completed round is one file in `data/rounds/`, named `rNN-<calendar id>.yml` (e.g. `r07-canada.yml`). `race:` must match an `id` in `data/calendar.yml`. Rounds are raced in calendar order, so the next round is the lowest one without a file.

## From CSV exports

1. The game writes exports to `%USERPROFILE%\Documents\My Games\F1 25\session results\` (still "F1 25", even for F1 26), named `session_results_DDMMYYYY_HHMM.csv`. List the folder and pick the files newer than the newest one already in `data/raw/`.
2. Copy them **unchanged** into `data/raw/`. Never edit a raw CSV; fix things in the round file instead.
3. The CSV has no track name. Match files to rounds in time order: the earliest new file is the next unraced round. If it's unclear, guess from the best lap times compared with the real circuit and **ask the user to confirm** before writing.
4. Write the round file:

   ```yaml
   race: canada
   sessions:
     - type: race
       date: 2026-10-19        # from the filename (DDMMYYYY)
       source: csv
       file: session_results_19102026_2115.csv
   ```

5. Check the humans: in the CSV, every human except the exporter is called `"Player"`, and they're matched by team using the seats in `data/drivers.yml`. If someone drove a different car that night, add a per-session override, e.g. `players: { ferrari: jimmy }`. `npm run build` prints `unmatched human` warnings for rows it couldn't place.

## From screenshots

1. Save the image to `data/screenshots/rNN-<id>.<ext>` and reference it relative to the round file (`../screenshots/...`).
2. Transcribe what's visible into `classification`, in finishing order. Use league driver ids (`driver: casper`) for humans and `name:` exactly as the game shows it for AI. Team ids come from `data/teams.yml`.
3. Only `team` and `points` are required. Leave out what you can't read, and don't guess. A human below the cropped area gets `posMin` (the first position not visible), plus `status: dns|dnf|dsq` when the user tells you. Put any context in `notes`.

   ```yaml
   race: japan
   sessions:
     - type: race
       source: screenshot
       screenshots: [../screenshots/r03-japan.webp]
       notes: Only P1–P16 visible.
       classification:
         - { pos: 1, driver: casper, team: mclaren, points: 25 }
         - { pos: 2, name: Lewis HAMILTON, team: ferrari, points: 18 }
         - { posMin: 17, driver: nicky, team: ferrari, points: 0 }
         - { driver: nickolaj, team: racingbulls, status: dns, points: 0 }
   ```

4. Read the transcription back to the user (positions, humans, points) and ask them to confirm, especially anything that is blurry or cut off. Gamertags in screenshots: Casper = G4lXY/G4IXY, Nicky = Sm4ck!, Jimmy = DieAlot, Nickolaj = fireproof.

## Other cases

- **Sprint**: add a second entry to `sessions` with `type: sprint`. Points from all sessions count toward the standings.
- **New player**: add them to `data/drivers.yml` with their seat and every gamertag spelling seen.
- **CSV and screenshots for the same race**: use `source: csv` and add `screenshots: [...]`; they're shown on the race page.

## Finish

1. Run `npm run build`. It must pass with no `unmatched human` warnings.
2. Tell the user the new standings top 4 (from the build or by summing points), then ask before committing and pushing. A push to `main` deploys the site.
