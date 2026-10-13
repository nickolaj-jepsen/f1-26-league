import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { parseSessionCsv, type Row } from './csv';

export type Status = 'finished' | 'dnf' | 'dns' | 'dsq';
export type SessionType = 'race' | 'sprint' | 'qualifying';

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
}

export interface Driver {
  id: string;
  name: string;
  gamertag: string;
  aliases: string[];
  team: Team;
}

export interface Entry {
  pos?: number;
  /** Known lower bound when the exact position is unknown (cropped screenshot). */
  posMin?: number;
  driver?: Driver;
  name: string;
  human: boolean;
  team: Team;
  status: Status;
  grid?: number;
  stops?: number;
  best?: string;
  bestMs?: number;
  time?: string;
  points: number;
  fastestLap: boolean;
}

export interface Incident {
  time: string;
  lap?: number;
  driver?: Driver;
  name: string;
  team?: Team;
  incident: string;
  penalty: string;
}

export interface Session {
  type: SessionType;
  source: 'csv' | 'screenshot';
  date?: Date;
  notes?: string;
  csvFile?: string;
  screenshots: ImageMetadata[];
  entries: Entry[];
  incidents: Incident[];
}

export interface Round {
  id: string;
  round: number;
  name: string;
  circuit: string;
  country: string;
  realDate: Date;
  sprint: boolean;
  /** Empty until the league has raced it. */
  sessions: Session[];
  done: boolean;
}

export interface League {
  teams: Map<string, Team>;
  drivers: Driver[];
  calendar: Round[];
  done: Round[];
}

export function lapMs(t: string | undefined): number | undefined {
  const m = t?.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  return Math.round((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000);
}

const statusOrder: Record<Status, number> = { finished: 0, dnf: 1, dsq: 2, dns: 3 };

function sortEntries(entries: Entry[]): Entry[] {
  // Stable sort keeps the file order for rows with neither pos nor posMin.
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const pa = a.e.pos ?? a.e.posMin ?? Infinity;
      const pb = b.e.pos ?? b.e.posMin ?? Infinity;
      if (pa !== pb) return pa - pb;
      return statusOrder[a.e.status] - statusOrder[b.e.status] || a.i - b.i;
    })
    .map(({ e }) => e);
}

function markFastestLap(entries: Entry[]) {
  const timed = entries.filter((e) => e.bestMs !== undefined);
  if (timed.length === 0) return;
  const best = Math.min(...timed.map((e) => e.bestMs!));
  for (const e of timed) e.fastestLap = e.bestMs === best;
}

function makeResolver(teams: Map<string, Team>, drivers: Driver[], players: Record<string, string> = {}) {
  const byTeamName = new Map([...teams.values()].map((t) => [t.name.toLowerCase(), t]));
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const seat = new Map(drivers.map((d) => [d.team.id, d]));
  for (const [teamId, driverId] of Object.entries(players)) {
    const d = byId.get(driverId);
    if (!d) throw new Error(`Unknown driver "${driverId}" in players override`);
    seat.set(teamId, d);
  }

  const team = (gameName: string): Team => {
    const t = byTeamName.get(gameName.toLowerCase());
    if (!t) throw new Error(`Unknown team "${gameName}" — add it to data/teams.yml`);
    return t;
  };

  // The game anonymises other humans as "Player", so they're identified by seat (team).
  const human = (name: string, t: Team): Driver | undefined => {
    if (name === 'Player') return seat.get(t.id);
    return drivers.find((d) => d.aliases.some((a) => a.toLowerCase() === name.toLowerCase()));
  };

  return { team, human, byId };
}

function loadCsvSession(file: string, resolver: ReturnType<typeof makeResolver>) {
  const { results, incidents } = parseSessionCsv(readFileSync(resolve('data/raw', file), 'utf8'));

  const entries = results.map((r: Row): Entry => {
    const team = resolver.team(r['Team']);
    const isHuman = r['driver type'] === 'Player';
    const driver = isHuman ? resolver.human(r['Driver'], team) : undefined;
    if (isHuman && !driver) console.warn(`[${file}] unmatched human "${r['Driver']}" (${team.short})`);
    const time = r['Time'];
    const status: Status = /^DNF$/i.test(time) ? 'dnf' : /^DSQ$/i.test(time) ? 'dsq' : /^DNS$/i.test(time) ? 'dns' : 'finished';
    return {
      pos: Number(r['Pos.']) || undefined,
      driver,
      name: driver?.name ?? (r['Driver'] === 'Player' ? `Player (${team.short})` : r['Driver']),
      human: isHuman,
      team,
      status,
      grid: Number(r['Grid']) || undefined,
      stops: r['Stops'] !== '' ? Number(r['Stops']) : undefined,
      best: r['Best'] || undefined,
      bestMs: lapMs(r['Best']),
      time: status === 'finished' ? time.replace(/^\+\s+/, '+') : undefined,
      points: Number(r['Pts.']) || 0,
      fastestLap: false,
    };
  });

  const incidentList = incidents.map((r: Row): Incident => {
    let team: Team | undefined;
    try {
      team = resolver.team(r['Team']);
    } catch {
      team = undefined;
    }
    const driver = team ? resolver.human(r['Driver'], team) : undefined;
    return {
      time: r['Time'],
      lap: Number(r['Lap']) || undefined,
      driver,
      name: driver?.name ?? r['Driver'],
      team,
      incident: r['Incident'],
      penalty: r['Penalty'],
    };
  });

  return { entries, incidents: incidentList };
}

type RoundSession = CollectionEntry<'rounds'>['data']['sessions'][number];

function loadSession(s: RoundSession, teams: Map<string, Team>, drivers: Driver[]): Session {
  const resolver = makeResolver(teams, drivers, s.players);
  let entries: Entry[];
  let incidents: Incident[] = [];

  if (s.source === 'csv') {
    ({ entries, incidents } = loadCsvSession(s.file, resolver));
  } else {
    entries = s.classification.map((c): Entry => {
      const team = teams.get(c.team);
      if (!team) throw new Error(`Unknown team id "${c.team}"`);
      const driver = c.driver ? resolver.byId.get(c.driver) : undefined;
      if (c.driver && !driver) throw new Error(`Unknown driver id "${c.driver}"`);
      return {
        pos: c.pos,
        posMin: c.posMin,
        driver,
        name: driver?.name ?? c.name!,
        human: !!driver,
        team,
        status: c.status,
        grid: c.grid,
        stops: c.stops,
        best: c.best,
        bestMs: lapMs(c.best),
        time: c.time,
        points: c.points,
        fastestLap: false,
      };
    });
  }

  entries = sortEntries(entries);
  markFastestLap(entries);

  return {
    type: s.type,
    source: s.source,
    date: s.date,
    notes: s.notes,
    csvFile: s.source === 'csv' ? s.file : undefined,
    screenshots: s.screenshots,
    entries,
    incidents,
  };
}

let cached: Promise<League> | undefined;

export function getLeague(): Promise<League> {
  return (cached ??= buildLeague());
}

async function buildLeague(): Promise<League> {
  const teams = new Map((await getCollection('teams')).map((t): [string, Team] => [t.id, { id: t.id, ...t.data }]));

  const drivers = (await getCollection('drivers')).map((d): Driver => {
    const team = teams.get(d.data.team);
    if (!team) throw new Error(`Driver ${d.id} has unknown team "${d.data.team}"`);
    return { id: d.id, ...d.data, team };
  });

  const roundFiles = await getCollection('rounds');
  const calendar = (await getCollection('calendar'))
    .map((c): Round => {
      const files = roundFiles.filter((r) => r.data.race === c.id);
      if (files.length > 1) throw new Error(`More than one round file for "${c.id}"`);
      const sessions = (files[0]?.data.sessions ?? []).map((s) => loadSession(s, teams, drivers));
      return {
        id: c.id,
        ...c.data,
        realDate: c.data.date,
        sessions,
        done: sessions.length > 0,
      };
    })
    .sort((a, b) => a.round - b.round);

  for (const r of roundFiles) {
    if (!calendar.some((c) => c.id === r.data.race)) throw new Error(`Round file ${r.id} references unknown race "${r.data.race}"`);
  }

  return { teams, drivers, calendar, done: calendar.filter((r) => r.done) };
}

// ---------- derived data ----------

export function mainSession(round: Round): Session | undefined {
  return round.sessions.find((s) => s.type === 'race') ?? round.sessions[0];
}

export function raceDate(round: Round): Date | undefined {
  return round.sessions.find((s) => s.date)?.date;
}

export function entryFor(session: Session, driver: Driver): Entry | undefined {
  return session.entries.find((e) => e.driver?.id === driver.id);
}

export function roundPoints(round: Round, driver: Driver): number {
  return round.sessions.reduce((sum, s) => sum + (entryFor(s, driver)?.points ?? 0), 0);
}

export interface DriverStats {
  driver: Driver;
  points: number;
  starts: number;
  wins: number;
  podiums: number;
  dnfs: number;
  dns: number;
  fastestLaps: number;
  bestFinish?: number;
  avgFinish?: number;
  positionsGained: number;
  warnings: number;
  penalties: number;
  /** Count of finishes per position, used for count-back tie-breaks. */
  finishes: number[];
}

export function driverStats(league: League, driver: Driver): DriverStats {
  const s: DriverStats = {
    driver,
    points: 0,
    starts: 0,
    wins: 0,
    podiums: 0,
    dnfs: 0,
    dns: 0,
    fastestLaps: 0,
    positionsGained: 0,
    warnings: 0,
    penalties: 0,
    finishes: [],
  };
  const finishPositions: number[] = [];

  for (const round of league.done) {
    for (const session of round.sessions) {
      const e = entryFor(session, driver);
      if (!e) continue;
      s.points += e.points;
      if (e.status === 'dns') {
        s.dns++;
        continue;
      }
      if (session.type !== 'race') continue;
      s.starts++;
      if (e.status === 'dnf' || e.status === 'dsq') s.dnfs++;
      if (e.fastestLap) s.fastestLaps++;
      if (e.status === 'finished' && e.pos) {
        finishPositions.push(e.pos);
        s.finishes[e.pos] = (s.finishes[e.pos] ?? 0) + 1;
        if (e.pos === 1) s.wins++;
        if (e.pos <= 3) s.podiums++;
        if (e.grid) s.positionsGained += e.grid - e.pos;
      }
      for (const inc of session.incidents) {
        if (inc.driver?.id !== driver.id) continue;
        if (inc.penalty === 'Warning') s.warnings++;
        else if (inc.penalty !== 'DNF') s.penalties++;
      }
    }
  }

  if (finishPositions.length) {
    s.bestFinish = Math.min(...finishPositions);
    s.avgFinish = finishPositions.reduce((a, b) => a + b, 0) / finishPositions.length;
  }
  return s;
}

function countBack(a: number[], b: number[]): number {
  for (let p = 1; p < Math.max(a.length, b.length); p++) {
    const d = (b[p] ?? 0) - (a[p] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function driverStandings(league: League): DriverStats[] {
  return league.drivers
    .map((d) => driverStats(league, d))
    .sort((a, b) => b.points - a.points || countBack(a.finishes, b.finishes));
}

export interface TeamStanding {
  team: Team;
  points: number;
  wins: number;
  drivers: Map<string, number>;
}

/** Full constructors' championship: every car's points, AI included. */
export function constructorStandings(league: League): TeamStanding[] {
  const rows = new Map<string, TeamStanding>(
    [...league.teams.values()].map((t) => [t.id, { team: t, points: 0, wins: 0, drivers: new Map() }]),
  );
  for (const round of league.done) {
    for (const session of round.sessions) {
      for (const e of session.entries) {
        const row = rows.get(e.team.id)!;
        row.points += e.points;
        if (e.pos === 1 && session.type === 'race') row.wins++;
        row.drivers.set(e.name, (row.drivers.get(e.name) ?? 0) + e.points);
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/** Cumulative points per driver after each completed round. */
export function progression(league: League): { driver: Driver; points: number[] }[] {
  return league.drivers.map((driver) => {
    let total = 0;
    return { driver, points: league.done.map((r) => (total += roundPoints(r, driver))) };
  });
}

export function positionLabel(e: Entry | undefined): string {
  if (!e) return '—';
  if (e.status === 'dns') return 'DNS';
  if (e.status === 'dsq') return 'DSQ';
  if (e.status === 'dnf') return 'DNF';
  if (e.pos) return `P${e.pos}`;
  if (e.posMin) return `P${e.posMin}+`;
  return '—';
}

export function formatDate(d: Date | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function url(path = ''): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
