import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const teams = defineCollection({
  loader: file('./data/teams.yml'),
  schema: z.object({
    name: z.string(),
    short: z.string(),
    color: z.string(),
  }),
});

const drivers = defineCollection({
  loader: file('./data/drivers.yml'),
  schema: z.object({
    name: z.string(),
    gamertag: z.string(),
    aliases: z.array(z.string()).default([]),
    team: z.string(),
  }),
});

const calendar = defineCollection({
  loader: file('./data/calendar.yml'),
  schema: z.object({
    round: z.number().int(),
    name: z.string(),
    circuit: z.string(),
    country: z.string(),
    date: z.coerce.date(),
    sprint: z.boolean().default(false),
  }),
});

const status = z.enum(['finished', 'dnf', 'dns', 'dsq']);

// One row of a hand-typed (screenshot) classification. Everything but team and points is
// optional because screenshots are often cropped; `posMin` records "somewhere P17 or lower".
const classificationEntry = z
  .object({
    pos: z.number().int().optional(),
    posMin: z.number().int().optional(),
    driver: z.string().optional(),
    name: z.string().optional(),
    team: z.string(),
    status: status.default('finished'),
    grid: z.number().int().optional(),
    stops: z.number().int().optional(),
    best: z.string().optional(),
    time: z.string().optional(),
    points: z.number().default(0),
  })
  .refine((e) => e.driver || e.name, { message: 'Entry needs either `driver` (league id) or `name` (AI driver)' });

const session = z.object({
  type: z.enum(['race', 'sprint', 'qualifying']).default('race'),
  date: z.coerce.date().optional(),
  notes: z.string().optional(),
  // Seats that differ from drivers.yml for this session only, e.g. { ferrari: jimmy }.
  players: z.record(z.string(), z.string()).optional(),
});

const rounds = defineCollection({
  loader: glob({ pattern: '*.yml', base: './data/rounds' }),
  schema: ({ image }) =>
    z.object({
      race: z.string(),
      sessions: z.array(
        z.discriminatedUnion('source', [
          session.extend({
            source: z.literal('csv'),
            file: z.string(),
            screenshots: z.array(image()).default([]),
          }),
          session.extend({
            source: z.literal('screenshot'),
            screenshots: z.array(image()).min(1),
            classification: z.array(classificationEntry),
          }),
        ]),
      ),
    }),
});

export const collections = { teams, drivers, calendar, rounds };
