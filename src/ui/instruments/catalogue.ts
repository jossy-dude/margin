import { ANY } from './catalog/anySubject';
import { DISCRETE } from './catalog/discrete';
import { ECON } from './catalog/economics';
import { DB } from './catalog/database';
import { PROG } from './catalog/programming';
import { TECH } from './catalog/tech';
import type { GroupDef, GroupId, InstrumentDef } from './types';

/**
 * The catalogue: twenty-two instruments in the six groups the reference groups them in, in the
 * reference's order. Group order is the order here — `Works in any subject`, then economics,
 * discrete mathematics, emerging technology, computer programming, database systems — because the
 * picker renders this array flat and the group headings fall out of the id changes.
 *
 * `INSTRUMENTS` is 22. The app's four ORIGINAL kinds (spines / glass / trace / ticker) are a
 * different system answering day-wide questions, so they are exported separately by `DayBar` and the
 * picker shows them as their own group ABOVE this. 26 kinds in Settings; 22 instruments here.
 */
export const GROUPS: GroupDef[] = [
  { id: 'any', n: 'Works in any subject', hint: 'Seven that read the clock' },
  { id: 'econ', n: 'Intro to Economics', hint: 'Three takes' },
  { id: 'discrete', n: 'Discrete Mathematics', hint: 'Three takes' },
  { id: 'tech', n: 'Emerging Technology', hint: 'Three takes' },
  { id: 'prog', n: 'Computer Programming', hint: 'Three takes' },
  { id: 'db', n: 'Database Systems', hint: 'Three takes' },
];

export const INSTRUMENTS: InstrumentDef[] = ([
  ['any', ANY],
  ['econ', ECON],
  ['discrete', DISCRETE],
  ['tech', TECH],
  ['prog', PROG],
  ['db', DB],
] as [GroupId, Omit<InstrumentDef, 'g'>[]][]).flatMap(([g, list]) =>
  list.map((it) => ({ ...it, g })),
);

export const instrument = (id: string): InstrumentDef | undefined => INSTRUMENTS.find((i) => i.id === id);

/** Every catalogue id, for tests and for the Settings picker. */
export const INSTRUMENT_IDS = INSTRUMENTS.map((i) => i.id);
