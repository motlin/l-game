import {HAMMER, HB, HBREAK, ODDS, type OddsItem} from "../art.ts";
import {$, $$as, $as, cleanName, parseJSON} from "../dom.ts";
import {CONN, DMAP, GENPL, keyOf, LPATH, type Placements} from "../geometry.ts";
import {type IsoBoard, cellAt as isoCellAt, render as isoRender} from "../iso.ts";
import {L_SHAPE, PIECE, T_SHAPE} from "../piece.ts";
import {Redo} from "../redo.ts";
import {getItem, setItem} from "../storage.ts";
import {MODE_CHANGED, NAMES_RESET, view, VIEW_CHANGED} from "../view.ts";
import {type Floor, islands, connected, moveTile, nbs, targets} from "./floor.ts";

// Moving Tiles: the L game (or the battle) on a floor whose tiles move. After moving your piece and optionally a
// blocker, you may lift one empty tile and set it down elsewhere, as long as the floor stays in one piece.

const CW = 100,
	COLLAPSE_AT = 10,
	// the empty grid around the starting floor, so tiles can wander out to its edge
	OFF = 3;
const DEF: Record<number, string[]> =
{
	2: ["#e0463a", "#2f6be0"],
	4: ["#e0463a", "#f2c12e", "#2ea44f", "#2f6be0"],
};
const DEFN = ["P1", "P2", "P3", "P4"];

interface TilesOptions
{
	n: number;
	seats: string[];
	level: string;
	names?: (string | null)[];
	cols?: Record<number, string[]>;
	tcols?: string[];
	noblock?: boolean;
	hammers?: boolean;
}
const mo: TilesOptions =
{
	n: 2,
	seats: ["h", "c", "c", "c"],
	level: "hard",
};
const msave = (): void =>
{
	try
	{
		setItem("lgame-mt", JSON.stringify(mo));
	}
	catch
	{
		// Storage is unavailable, so the settings last only until the page reloads.
	}
};

interface MState extends Floor
{
	L: number[];
	alive: number[];
	pts: number[];
	pending: number[];
	turn: number;
	phase: "L" | "B" | "T";
	over: boolean;
	ended: boolean;
	dead: number[];
	dt: number[];
	moves: number;
	news: string;
	hh: number[];
	hc?: number[];
	hnews: string;
	round?: number;
	newRound?: boolean;
	low?: (number | null)[];
	ko?: number;
	hbk?:
	{
		c: number;
		t: number;
	};
}

let NP = 2,
	BASE = 4,
	G = 10,
	NC = 100,
	TEAM = false,
	COLS: string[] = [],
	placements: Placements = GENPL(G, L_SHAPE);
const PL = (j: number): number[] => placements.PL[j]!;
// L vs T in Moving Tiles: floor size and opening (L for player 1, T for player 2)
// (tested with Hard vs Hard: one blocker in the corner and L first came out about 58% L, 42% T; with two blockers the T
// won almost every game)
const LTB = 4,
	LTS =
	{
		L: [
			[
				[2, 3],
				[3, 1],
				[3, 2],
				[3, 3],
			],
			[
				[1, 0],
				[1, 1],
				[1, 2],
				[2, 1],
			],
		],
		B: [[0, 0]],
		t: 0,
	};
const mate = (a: number, b: number): boolean => TEAM && a % 2 === b % 2;
const nm = (p: number): string => cleanName((mo.names ?? [])[p]) || DEFN[p]!;

// a roomy grid: the starting board sits in the middle, tiles can wander out to its edge
function setup(): void
{
	NP = mo.n === 4 ? 4 : 2;
	TEAM = PIECE === "LT" && NP === 4;
	BASE = NP === 2 ? (PIECE === "T" ? 5 : PIECE === "LT" ? LTB : 4) : 6;
	G = BASE + 2 * OFF;
	NC = G * G;
	const saved = mo.cols?.[NP];
	COLS = [...(saved?.length === NP ? saved : DEF[NP]!)];
	if (PIECE === "LT" && NP === 4)
	{
		const tc = mo.tcols ?? ["#e0463a", "#2f6be0"];
		COLS = [tc[0]!, tc[1]!, tc[0]!, tc[1]!];
	}
	placements = GENPL(G, PIECE === "T" ? T_SHAPE : L_SHAPE, PIECE === "LT" ? [T_SHAPE] : []);
}
const rc = (r: number, c: number): number => (r + OFF) * G + (c + OFF);
const place = (cs: number[]): number => placements.PIDX.get(keyOf(cs))!;

let started = false;
// Takes back an undo within the turn.
const redo = new Redo();
let S: MState = blank();
let snap = "",
	sel: number[] = [],
	selB = -1,
	wasSel = false,
	pick = -1,
	drag = false,
	busy = false,
	gid = 0,
	lastL:
	{
		p: number;
		j: number;
	} | null = null,
	lastT:
	{
		from: number;
		to: number;
	} | null = null,
	startSeat = 0,
	msgT = 0,
	fresh: number[] = [];

// A stand-in until the first match starts.
function blank(): MState
{
	return {
		L: [],
		alive: [],
		sc: [],
		pts: [],
		B: [],
		tiles: [],
		stone: [],
		crack: -1,
		pending: [],
		turn: 0,
		phase: "L",
		over: false,
		ended: false,
		dead: [],
		dt: [],
		moves: 0,
		news: "",
		hams: [],
		hh: [],
		hnews: "",
	};
}

function start(): MState
{
	setup();
	const T = Array.from(
		{
			length: NC,
		},
		() => 0,
	);
	for (let r = 0; r < BASE; r++) for (let c = 0; c < BASE; c++) T[rc(r, c)] = 1;
	let L: number[], B: number[];
	// T game, 2 players: a 5x5 floor and one blocker (on 4x4 whoever moves a tile first almost always wins at once)
	if (NP === 2 && PIECE === "LT")
	{
		L = LTS.L.map((cs) => place(cs.map(([r, c]) => rc(r!, c!))));
		B = LTS.B.map(([r, c]) => rc(r!, c!));
	}
	else if (NP === 2 && PIECE === "T")
	{
		L = [
			[rc(0, 0), rc(0, 1), rc(0, 2), rc(1, 1)],
			[rc(4, 2), rc(4, 3), rc(4, 4), rc(3, 3)],
		].map(place);
		B = [rc(4, 0)];
	}
	else if (NP === 2)
	{
		L = [
			[rc(0, 1), rc(0, 2), rc(1, 2), rc(2, 2)],
			[rc(1, 1), rc(2, 1), rc(3, 1), rc(3, 2)],
		].map(place);
		B = [rc(0, 0), rc(3, 3)];
	}
	else
	{
		L = (
			PIECE === "T"
				? [
						[rc(1, 1), rc(2, 1), rc(3, 1), rc(2, 0)],
						[rc(1, 4), rc(1, 3), rc(1, 2), rc(0, 3)],
						[rc(4, 4), rc(3, 4), rc(2, 4), rc(3, 5)],
						[rc(4, 1), rc(4, 2), rc(4, 3), rc(5, 2)],
					]
				: PIECE === "LT"
					? [
							[rc(1, 1), rc(2, 1), rc(3, 1), rc(3, 2)],
							[rc(1, 4), rc(1, 3), rc(1, 2), rc(0, 3)],
							[rc(4, 4), rc(3, 4), rc(2, 4), rc(2, 3)],
							[rc(4, 1), rc(4, 2), rc(4, 3), rc(5, 2)],
						]
					: [
							[rc(1, 1), rc(2, 1), rc(3, 1), rc(3, 2)],
							[rc(1, 4), rc(1, 3), rc(1, 2), rc(2, 2)],
							[rc(4, 4), rc(3, 4), rc(2, 4), rc(2, 3)],
							[rc(4, 1), rc(4, 2), rc(4, 3), rc(3, 3)],
						]
		).map(place);
		B = [rc(0, 0), rc(0, 5), rc(5, 0), rc(5, 5)];
	}
	if (mo.noblock) B = [];
	return {
		L,
		alive: Array<number>(NP).fill(1),
		sc: Array<number[] | null>(NP).fill(null),
		pts: Array<number>(NP).fill(0),
		B,
		tiles: T,
		stone: [],
		crack: -1,
		pending: [],
		turn: NP === 4 ? startSeat++ % 4 : PIECE === "LT" ? LTS.t : 0,
		phase: "L",
		over: false,
		ended: false,
		dead: [],
		dt: Array<number>(NP).fill(0),
		moves: 0,
		news: "",
		hams: [],
		hh: Array<number>(NP).fill(0),
		hnews: "",
	};
}
const pn = (p: number): string =>
	PL(S.L[p]!).length < 4 ? "piece" : placements.SH[S.L[p]!] === 5 || PIECE === "T" ? "T" : "L";
const cellsOf = (q: number, T: MState = S): number[] => (T.alive[q] ? PL(T.L[q]!) : (T.sc[q] ?? []));
const loneStatue = (T: MState, q: number): boolean => !T.alive[q] && T.sc[q]?.length === 1;
// What covers each spot: 1 to 4 a player's piece, 9 a blocker, 8 no tile.
function occ(T: MState): Uint8Array
{
	const o = new Uint8Array(NC);
	for (let c = 0; c < NC; c++) if (!T.tiles[c]) o[c] = 8;
	T.L.forEach((_j, q) =>
	{
		for (const c of cellsOf(q, T)) o[c] = q + 1;
	});
	for (const b of T.B) o[b] = 9;
	return o;
}
// How many places player p's piece can move to (and which, into list), with hammers as in the battle.
function mob(o: Uint8Array, T: MState, p: number, list?: number[]): number
{
	let n = 0;
	const ck = T.crack,
		hh = T.hh[p] ?? 0,
		AL = T.alive,
		HS = T.hams;
	for (const j of placements.BY[placements.SH[T.L[p]!]!]!)
	{
		if (j === T.L[p]) continue;
		const cs = PL(j);
		if (ck >= 0 && cs.includes(ck)) continue;
		const have = hh + (HS.length ? cs.filter((c) => HS.includes(c)).length : 0);
		let ok = true,
			other = 0;
		const hit: Record<number, number[]> = {};
		for (const c of cs)
		{
			const v = o[c]!;
			if (!v || v === p + 1) continue;
			if (v <= NP && AL[v - 1])
			{
				if (mate(p, v - 1))
				{
					ok = false;
					break;
				}
				(hit[v] ??= []).push(c);
				continue;
			}
			if (v === 9 || v <= NP)
			{
				other++;
				continue;
			}
			ok = false;
			break;
		}
		if (ok)
		{
			let cost = other;
			for (const k of Object.keys(hit).map(Number))
			{
				const rest = PL(T.L[k - 1]!).filter((x) => !hit[k]!.includes(x));
				if (!CONN(rest, G))
				{
					cost = 1e9;
					break;
				}
				cost += hit[k]!.length;
			}
			ok = cost <= have;
		}
		if (ok)
		{
			n++;
			if (list) list.push(j);
		}
	}
	return n;
}
const alive = (): number[] => [...Array(NP).keys()].filter((q) => S.alive[q]);
const done = (): boolean =>
{
	const al = alive();
	return TEAM ? new Set(al.map((x) => x % 2)).size <= 1 : al.length <= 1;
};
const legal = (p: number): number[] =>
{
	const r: number[] = [];
	mob(occ(S), S, p, r);
	return r;
};
const human = (p: number): boolean => mo.seats[p] === "h";
const myTurn = (): boolean => started && !S.over && !busy && human(S.turn) && !view.turning;
const HAMS = (): number[] => S.hams;
// an empty tile: no L, statue or blocker on it (and not the cracking tile)
function movable(T: MState): number[]
{
	const o = occ(T),
		res: number[] = [];
	for (let c = 0; c < NC; c++)
		if (
			T.tiles[c] &&
			c !== T.crack &&
			(o[c] === 0 || o[c] === 9 || (o[c]! <= NP && loneStatue(T, o[c]! - 1))) &&
			targets(T, c, G).length
		)
			res.push(c);
	return res;
}
const addNews = (t: string): void =>
{
	S.news += (S.news ? " " : "") + t;
};
function eliminate(q: number, killer: number | null): void
{
	S.alive[q] = 0;
	S.sc[q] = [...PL(S.L[q]!)];
	S.dead.push(q);
	S.dt[q] = S.moves + 1;
	fresh.push(q);
	if (killer === null)
	{
		for (const x of alive()) S.pts[x]!++;
		addNews(
			`${nm(q)} had no move at the start of their turn because the floor closed in: turned to stone (natural causes).`,
		);
	}
	else if (mate(killer, q))
		addNews(
			`${nm(q)} had no move at the start of their turn: boxed in by their own teammate's move, so nobody scores.`,
		);
	else
	{
		if (NP === 4) S.pts[killer]!++;
		addNews(`${nm(q)} had no move at the start of their turn${NP === 4 ? `: checkmated by ${nm(killer)}` : ""}.`);
	}
}
const cellsOfStatueAt = (c: number): boolean =>
	[...Array(NP).keys()].some((q) => !S.alive[q] && cellsOf(q).includes(c));
function chooseCrack(mover: number): void
{
	const skip = S.alive[mover] ? PL(S.L[mover]!) : [],
		cand: number[] = [];
	for (let c = 0; c < NC; c++) if (S.tiles[c] && !skip.includes(c)) cand.push(c);
	if (!cand.length)
	{
		S.crack = -1;
		return;
	}
	const whole = cand.filter((c) =>
		{
			if (cellsOfStatueAt(c)) return true;
			const tl = [...S.tiles];
			tl[c] = 0;
			return connected(tl, G);
		}),
		c2 = whole.length ? whole : cand;
	const safe = c2.filter((c) =>
		{
			const T =
			{
				...S,
				crack: c,
			};
			const o = occ(T);
			return alive().every((q) => mob(o, T, q) > 0);
		}),
		pool = safe.length ? safe : c2;
	S.crack = pool[Math.floor(Math.random() * pool.length)]!;
	S.pending = alive();
	addNews("A tile is cracking (red outline). It falls after everyone has moved once, and it can't be moved.");
}
function fall(): void
{
	const c = S.crack;
	S.crack = -1;
	S.pending = [];
	const sq = [...Array(NP).keys()].find((q) => !S.alive[q] && cellsOf(q).includes(c));
	if (sq !== undefined)
	{
		S.sc[sq] = S.sc[sq]!.filter((x) => x !== c);
		if (!S.stone.includes(c)) S.stone.push(c);
		addNews(`A tile gave way under ${nm(sq)}'s statue: that piece sank and became stone floor.`);
		return;
	}
	S.tiles[c] = 0;
	S.stone = S.stone.filter((x) => x !== c);
	let m = "The cracked tile fell away.";
	if (HAMS().includes(c))
	{
		S.hams = HAMS().filter((x) => x !== c);
		m += " The hammer on it fell too.";
	}
	const drop: number[] = [];
	{
		const bi = S.B.indexOf(c);
		if (bi >= 0) drop.push(bi);
	}
	// if that split the floor, every island but the biggest floats away with whatever stands on it
	const parts = islands(S.tiles, G);
	if (parts.length > 1)
	{
		const Lon = (part: number[]): number => alive().filter((q) => PL(S.L[q]!).some((x) => part.includes(x))).length;
		parts.sort((a, b) => b.length - a.length || Lon(b) - Lon(a));
		const gone = new Set(parts.slice(1).flat());
		for (const x of gone) S.tiles[x] = 0;
		if (HAMS().some((x) => gone.has(x)))
		{
			S.hams = HAMS().filter((x) => !gone.has(x));
			m += " A hammer drifted away with them.";
		}
		S.stone = S.stone.filter((x) => !gone.has(x));
		S.B.forEach((b, i) =>
		{
			if (gone.has(b) && !drop.includes(i)) drop.push(i);
		});
		const lost = alive().filter((q) => PL(S.L[q]!).some((x) => gone.has(x)));
		for (let q = 0; q < NP; q++)
		{
			const part = S.sc[q];
			if (!S.alive[q] && part) S.sc[q] = part.filter((x) => !gone.has(x));
		}
		m += ` The floor split, and ${gone.size} tile${gone.size === 1 ? "" : "s"} drifted away from the main island`;
		if (lost.length)
		{
			for (const q of lost)
			{
				S.alive[q] = 0;
				S.sc[q] = [];
				S.dead.push(q);
				S.dt[q] = S.moves + 1;
				fresh.push(q);
			}
			const left = alive();
			for (const x of left) S.pts[x]! += lost.length;
			m += `, carrying ${lost.map(nm).join(" and ")} off the board (natural causes${left.length ? `, +${lost.length} for everyone still standing` : ""})`;
		}
		m += ".";
	}
	if (drop.length)
	{
		for (const i of drop)
		{
			const o = occ(S),
				free: number[] = [];
			for (let x = 0; x < NC; x++) if (!o[x]) free.push(x);
			if (!free.length) break;
			S.B[i] = free[Math.floor(Math.random() * free.length)]!;
		}
		m +=
			drop.length === 1
				? " A blocker dropped back down somewhere else."
				: " Its blockers dropped back down on the main island.";
	}
	addNews(m);
}
function collapse(p: number): void
{
	if (S.crack >= 0)
	{
		S.pending = S.pending.filter((q) => q !== p && S.alive[q]);
		if (S.pending.length) return;
		fall();
	}
	if (S.crack < 0 && alive().length > 1) chooseCrack(p);
}
function endTurn(): void
{
	const p = S.turn;
	fresh = [];
	S.news = S.hnews || "";
	S.hnews = "";
	const o = occ(S),
		stuck = new Set(alive().filter((q) => q !== p && mob(o, S, q) === 0));
	S.moves++;
	if (NP === 4 && S.moves >= COLLAPSE_AT) collapse(p);
	// an L is only out when its own turn starts and it has no move
	let n = p;
	for (let g = 0; g < NP; g++)
	{
		if (done())
		{
			S.over = true;
			break;
		}
		do n = (n + 1) % NP;
		while (!S.alive[n]);
		if (legal(n).length)
		{
			S.turn = n;
			break;
		}
		eliminate(n, stuck.has(n) ? p : null);
	}
	S.newRound = false;
	if (!S.over && S.turn <= p)
	{
		S.round = (S.round ?? 0) + 1;
		S.newRound = true;
	}
	{
		const t = S.hamt ?? {},
			round = S.round ?? 0,
			old = HAMS().filter((c) => round - (t[c] ?? round) >= 5);
		if (old.length)
		{
			S.hams = HAMS().filter((c) => !old.includes(c));
			S.news =
				(S.news ? `${S.news} ` : "") +
				(old.length === 1
					? "A hammer nobody picked up crumbled away."
					: `${old.length} hammers nobody picked up crumbled away.`);
		}
	}
	if (mo.hammers && S.newRound && S.round! % 3 === 0 && HAMS().length < 3) spawnHammer();
	if (done()) S.over = true;
	{
		const o2 = occ(S);
		S.low = S.low ?? Array<number | null>(NP).fill(null);
		for (const q of alive())
		{
			if (mob(o2, S, q) <= 2)
			{
				S.low[q] ??= S.moves;
			}
			else S.low[q] = null;
		}
	}
	S.phase = "L";
	sel = [];
	selB = -1;
	pick = -1;
	snap = JSON.stringify(S);
	render();
	maybeAI();
}

// ---- computer players
interface AIMove
{
	s: number;
	j: number;
	bi: number;
	to: number;
	src: number;
	dst: number;
}
function aiMove(p: number): AIMove | null
{
	const LV = mo.level,
		hard = LV !== "easy",
		fair = LV === "fair",
		others = alive().filter((q) => q !== p && !mate(p, q)),
		pals = alive().filter((q) => q !== p && mate(p, q));
	const prot = new Set(
		fair
			? others.filter(
					(q) => S.low && S.low[q] !== null && S.low[q] !== undefined && S.moves - S.low[q] < alive().length,
				)
			: [],
	);
	const lead =
		NP === 4
			? ((): number =>
				{
					const m = Math.max(...others.map((q) => S.pts[q]!));
					const top = others.filter((q) => S.pts[q] === m);
					return m > 0 && top.length === 1 ? top[0]! : -1;
				})()
			: -1;
	const target =
		lead >= 0
			? lead
			: ((): number =>
				{
					let n = p;
					for (let g = 0; g < NP; g++)
					{
						n = (n + 1) % NP;
						if (S.alive[n] && n !== p && !mate(p, n)) return n;
					}
					return -1;
				})();
	const ev = (T: MState): number =>
	{
		const o = occ(T);
		let kills = 0,
			press = 0;
		for (const q of others)
		{
			const m = mob(o, T, q);
			if (!m) kills += prot.has(q) ? -0.3 : !fair || q === target ? 1 : 0.15;
			else if (!prot.has(q)) press += Math.max(0, 12 - m) * (q === target ? 5 : fair ? 0.6 : 1.2);
		}
		const mine = mob(o, T, p);
		let s = kills * 1000 + press + Math.min(mine, 18) * 4 - (mine === 0 ? 900 : mine <= 2 ? 150 : 0);
		for (const q of pals)
		{
			const pm = mob(o, T, q);
			s += pm === 0 ? -800 : Math.min(pm, 12) * 2;
		}
		for (const c of PL(T.L[p]!)) for (const e of nbs(c, G)) if (!T.tiles[e]) s -= 2;
		return s;
	};
	const o = occ(S),
		Ls: number[] = [];
	mob(o, S, p, Ls);
	if (!Ls.length) return null;
	const KO = (j: number): number =>
	{
		let s = 0;
		for (const q of others)
		{
			const pc = PL(S.L[q]!);
			if (pc.every((c) => PL(j).includes(c))) s += !fair || q === target ? 1000 : 100;
		}
		return s;
	};
	const cand = Ls.map((j) =>
	{
		const L2 = [...S.L];
		L2[p] = j;
		return {
			j,
			s:
				ev(
					{
						...S,
						L: L2,
					},
				) +
				60 * PL(j).filter((c) => HAMS().includes(c)).length +
				KO(j),
		};
	})
		.toSorted((a, b) => b.s - a.s)
		.slice(0, hard ? 10 : 5);
	let best: AIMove =
	{
		s: -Infinity,
		j: -1,
		bi: -1,
		to: -1,
		src: -1,
		dst: -1,
	};
	let found = false;
	for (const c of cand)
	{
		const L2 = [...S.L];
		L2[p] = c.j;
		const T1 =
			{
				...S,
				L: L2,
			},
			base = occ(T1);
		const tryB = (B2: number[], bi: number, to: number): void =>
		{
			const sc =
				ev(
					{
						...T1,
						B: B2,
					},
				) +
				KO(c.j) +
				Math.random() * (hard ? 40 : 1400);
			if (!found || sc > best.s)
			{
				found = true;
				best =
				{
					s: sc,
					j: c.j,
					bi,
					to,
					src: -1,
					dst: -1,
				};
			}
		};
		tryB(S.B, -1, -1);
		for (let i = 0; i < S.B.length; i++)
			for (let e = 0; e < NC; e++)
				if (!base[e])
				{
					const B2 = [...S.B];
					B2[i] = e;
					tryB(B2, i, e);
				}
		for (let q = 0; q < NP; q++)
			if (loneStatue(S, q))
				for (let e = 0; e < NC; e++)
					if (!base[e])
					{
						const sc2 = [...S.sc];
						sc2[q] = [e];
						const sc =
							ev(
								{
									...T1,
									sc: sc2,
								},
							) +
							Math.random() * (hard ? 40 : 1400);
						if (sc > best.s)
							best =
							{
								s: sc,
								j: c.j,
								bi: 100 + q,
								to: e,
								src: -1,
								dst: -1,
							};
					}
	}
	const L2 = [...S.L];
	L2[p] = best.j;
	const B2 = [...S.B],
		SC2 = [...S.sc];
	if (best.bi >= 100) SC2[best.bi - 100] = [best.to];
	else if (best.bi >= 0) B2[best.bi] = best.to;
	const T0: MState =
	{
		...S,
		L: L2,
		B: B2,
		sc: SC2,
		tiles: [...S.tiles],
		stone: [...S.stone],
	};
	let tb =
	{
		s: ev(T0) + Math.random() * (hard ? 20 : 900),
		src: -1,
		dst: -1,
	};
	let opts: [number, number][] = [];
	for (const s0 of movable(T0)) for (const d of targets(T0, s0, G)) opts.push([s0, d]);
	if (opts.length > 350)
	{
		opts.sort(() => Math.random() - 0.5);
		opts = opts.slice(0, 350);
	}
	for (const [s0, d] of opts)
	{
		const T3 =
		{
			...T0,
			tiles: [...T0.tiles],
			stone: [...T0.stone],
		};
		moveTile(T3, s0, d);
		const sc = ev(T3) + Math.random() * (hard ? 20 : 900);
		if (sc > tb.s)
			tb =
			{
				s: sc,
				src: s0,
				dst: d,
			};
	}
	best.src = tb.src;
	best.dst = tb.dst;
	return best;
}
function maybeAI(): void
{
	if (!started || S.over || human(S.turn)) return;
	busy = true;
	render();
	const id = gid,
		p = S.turn;
	window.setTimeout(() =>
	{
		if (id !== gid) return;
		const mv = aiMove(p);
		if (!mv)
		{
			busy = false;
			let m = p;
			do m = (m + 1) % NP;
			while (!S.alive[m] && m !== p);
			eliminate(p, null);
			if (done()) S.over = true;
			else S.turn = m;
			snap = JSON.stringify(S);
			render();
			maybeAI();
			return;
		}
		lastL =
		{
			p,
			j: S.L[p]!,
		};
		lastT = null;
		placeL(p, mv.j);
		S.phase = "B";
		render();
		window.setTimeout(
			() =>
			{
				if (id !== gid) return;
				if (mv.bi >= 0) applyB(mv.bi, mv.to);
				S.phase = "T";
				render();
				window.setTimeout(
					() =>
					{
						if (id !== gid) return;
						if (mv.src >= 0)
						{
							moveTile(S, mv.src, mv.dst);
							lastT =
							{
								from: mv.src,
								to: mv.dst,
							};
						}
						busy = false;
						endTurn();
					},
					mv.src >= 0 ? 550 : 150,
				);
			},
			mv.bi >= 0 ? 500 : 150,
		);
	}, 600);
}
function newMatch(): void
{
	oddsKey = "";
	gid++;
	busy = false;
	S = start();
	started = true;
	snap = JSON.stringify(S);
	sel = [];
	selB = -1;
	pick = -1;
	lastL = null;
	lastT = null;
	fresh = [];
	seatsUI();
	render();
	maybeAI();
}

// ---- input
const svg = (): SVGSVGElement => $as("#mtboard", SVGSVGElement);
function cellAt(e: PointerEvent): number
{
	if (view.turning) return -1;
	const s = svg();
	let d: number;
	if (view.is3d) d = isoCellAt(s, e, G);
	else
	{
		const pt = s.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		const m = s.getScreenCTM();
		if (!m) return -1;
		const q = pt.matrixTransform(m.inverse());
		const x = Math.floor(q.x / CW),
			y = Math.floor(q.y / CW);
		d = x < 0 || y < 0 || x >= G || y >= G ? -1 : y * G + x;
	}
	return d < 0 ? -1 : DMAP(d, G, (4 - view.rot) % 4);
}
function msg(t: string): void
{
	const e = $("#mtinstr");
	e.textContent = t;
	e.classList.add("err");
	clearTimeout(msgT);
	msgT = window.setTimeout(() =>
	{
		e.classList.remove("err");
		render();
	}, 1800);
}
function freeFor(c: number, p: number): boolean
{
	const o = occ(S),
		v = o[c]!,
		hm = (S.hh[p] ?? 0) > 0;
	const any = hm || HAMS().length > 0;
	return c !== S.crack && (v === 0 || v === p + 1 || (any && (v === 9 || (v > 0 && v <= NP))));
}
const statueSq = (c: number): boolean => [...Array(NP).keys()].some((q) => !S.alive[q] && cellsOf(q).includes(c));
// set an L down: break what it covers with its hammers, and pick up a hammer it lands on
function placeL(p: number, j: number): void
{
	const K = NP,
		own = PL(S.L[p]!),
		HS = HAMS(),
		got = PL(j).filter((c) => HS.includes(c)),
		live = PL(j).filter(
			(c) =>
				!own.includes(c) && [...Array(K).keys()].some((q) => q !== p && S.alive[q] && PL(S.L[q]!).includes(c)),
		),
		sm = PL(j).filter(statueSq),
		bl = PL(j).filter((c) => S.B.includes(c)),
		add = (t: string): void =>
		{
			S.hnews = (S.hnews ? `${S.hnews} ` : "") + t;
		};
	const before = (S.hh[p] ?? 0) + got.length;
	S.L[p] = j;
	const hh = S.hh,
		hc = (S.hc ??= Array<number>(K).fill(0));
	if (got.length)
	{
		S.hams = HS.filter((c) => !got.includes(c));
		hh[p]! += got.length;
		hc[p] = (hc[p] ?? 0) + got.length;
		add(
			`${nm(p)} picked up ${got.length === 1 ? "a hammer" : `${got.length} hammers`}${sm.length || bl.length || live.length ? " and used it straight away" : ""}.`,
		);
	}
	const out = (q: number, how: string): void =>
	{
		S.alive[q] = 0;
		S.sc[q] = [];
		S.dead.push(q);
		S.dt[q] = S.moves + 1;
		fresh.push(q);
		S.pts[p] = (S.pts[p] ?? 0) + 1;
		S.ko = q;
		add(how);
	};
	// each square of another L costs one hammer; break every square and the player is out
	const plan:
	{
		q: number;
		cs: number[];
		rest: number[];
		cost: number;
	}[] = [];
	for (const c of live)
	{
		const q = [...Array(K).keys()].find((x) => x !== p && S.alive[x] && PL(S.L[x]!).includes(c))!;
		let t = plan.find((x) => x.q === q);
		if (!t)
		{
			t =
			{
				q,
				cs: [],
				rest: [],
				cost: 0,
			};
			plan.push(t);
		}
		t.cs.push(c);
	}
	for (const t of plan)
	{
		const cs = t.cs;
		t.rest = PL(S.L[t.q]!).filter((x) => !cs.includes(x));
		t.cost = t.cs.length;
	}
	for (const t of plan)
	{
		const vq = t.q;
		if (hh[p]! < t.cost) continue;
		hh[p]! -= t.cost;
		const k = t.cs.length,
			rest = t.rest,
			hw = k === 1 ? "the hammer (the hammer broke)" : `${k} hammers (they broke)`;
		if (!rest.length)
		{
			out(
				vq,
				`${nm(p)} smashed the last ${k === 1 ? "square" : `${k} squares`} of ${nm(vq)}'s piece with ${hw}: ${nm(vq)} is out of the game.`,
			);
			continue;
		}
		const nj = placements.PIDX.get(keyOf(rest));
		if (nj !== undefined)
		{
			S.L[vq] = nj;
			add(
				`${nm(p)} broke ${k === 1 ? (rest.length === 1 ? "a square" : "an end") : `${k} squares`} off ${nm(vq)}'s piece with ${hw}: it is now ${rest.length} square${rest.length === 1 ? "" : "s"}${rest.length === 1 ? ". One more hit knocks them out" : " and fits in more places"}.`,
			);
		}
	}
	for (const b of bl)
	{
		if (hh[p]! < 1) break;
		hh[p]!--;
		const i = S.B.indexOf(b),
			o = occ(S),
			free: number[] = [];
		for (let c = 0; c < NC; c++) if (!o[c] && c !== S.crack && !HAMS().includes(c)) free.push(c);
		if (free.length)
		{
			S.B[i] = free[Math.floor(Math.random() * free.length)]!;
		}
		add(
			`${nm(p)} smashed a blocker with the hammer (the hammer broke), and the blocker dropped back down somewhere else.`,
		);
	}
	for (const sq of sm)
	{
		if (hh[p]! < 1) break;
		hh[p]!--;
		for (let q = 0; q < K; q++)
			if (!S.alive[q] && cellsOf(q).includes(sq))
			{
				const left2 = cellsOf(q).filter((x) => x !== sq);
				S.sc[q] = left2;
				add(
					`${nm(p)} smashed a piece of ${nm(q)}'s statue with the hammer${left2.length ? " (the hammer broke)" : ", and the statue is gone (the hammer broke)"}.`,
				);
			}
	}
	if (hh[p]! < before)
	{
		const bc = live[0] ?? bl[0] ?? sm[0];
		if (bc !== undefined)
			S.hbk =
			{
				c: bc,
				t: Date.now(),
			};
	}
}
function spawnHammer(): void
{
	const o = occ(S),
		HS = HAMS(),
		free: number[] = [];
	for (let c = 0; c < NC; c++) if (!o[c] && c !== S.crack && !HS.includes(c)) free.push(c);
	if (!free.length) return;
	{
		const c = free[Math.floor(Math.random() * free.length)]!;
		S.hams = [...HS, c];
		(S.hamt ??= {})[c] = S.round ?? 0;
	}
	addNews("A hammer appeared on the board. Move your L onto it to pick it up.");
}
function commitL(): void
{
	const p = S.turn,
		j = placements.PIDX.get(keyOf(sel));
	sel = [];
	if (j === undefined) msg("Those four tiles don't make an L. Swipe again.");
	else if (j === S.L[p]) msg("Your L has to end up somewhere new.");
	else if (S.crack >= 0 && PL(j).includes(S.crack)) msg("That tile is cracking: your L can't stand on it.");
	else if (legal(p).includes(j))
	{
		lastL =
		{
			p,
			j: S.L[p]!,
		};
		lastT = null;
		placeL(p, j);
		S.phase = S.B.length || S.sc.some((_a, q) => loneStatue(S, q)) ? "B" : "T";
	}
	else
		msg(
			placements.SH[j] === placements.SH[S.L[p]!]
				? PL(j).some((c) => !freeFor(c, p))
					? "Your L can only go on empty tiles."
					: "Your L can only cover as many blockers, statue squares or L squares as you have hammers, and an L you hit has to stay in one piece."
				: "Your piece has to keep its shape.",
		);
	render();
}
// a mover is a blocker (0..) or a one-piece statue (100+player)
function moverAt(c: number): number
{
	const i = S.B.indexOf(c);
	if (i >= 0) return i;
	for (let q = 0; q < NP; q++) if (loneStatue(S, q) && S.sc[q]![0] === c) return 100 + q;
	return -1;
}
const moverCell = (i: number): number => (i >= 100 ? S.sc[i - 100]![0]! : S.B[i]!);
function applyB(i: number, c: number): void
{
	if (i >= 100) S.sc[i - 100] = [c];
	else S.B[i] = c;
}
function moveB(i: number, c: number): void
{
	applyB(i, c);
	selB = -1;
	S.phase = "T";
	render();
}

// After Undo or Redo: nothing picked and nothing marked as just moved.
function afterUndo(): void
{
	sel = [];
	selB = -1;
	pick = -1;
	lastL = null;
	lastT = null;
	render();
}

function wireInput(): void
{
	const s = svg();
	s.addEventListener("pointerdown", (e) =>
	{
		if (!myTurn()) return;
		const c = cellAt(e);
		if (c < 0) return;
		e.preventDefault();
		try
		{
			s.setPointerCapture(e.pointerId);
		}
		catch
		{
			// The pointer is already gone.
		}
		const p = S.turn,
			o = occ(S);
		if (S.phase === "L")
		{
			if (!freeFor(c, p)) return;
			drag = true;
			sel = [c];
		}
		else if (S.phase === "B")
		{
			const i = moverAt(c);
			if (i >= 0)
			{
				wasSel = selB === i;
				selB = i;
				drag = true;
			}
			else if (selB >= 0 && o[c] === 0)
			{
				moveB(selB, c);
				return;
			}
		}
		else if (pick >= 0 && c === pick) pick = -1;
		else if (pick >= 0 && targets(S, pick, G).includes(c))
		{
			moveTile(S, pick, c);
			lastT =
			{
				from: pick,
				to: c,
			};
			pick = -1;
			endTurn();
			return;
		}
		else if (movable(S).includes(c)) pick = c;
		else if (pick < 0)
			msg(
				S.tiles[c]
					? c === S.crack
						? "A cracking tile can't be moved."
						: "A tile under an L or a statue of two or more pieces can't be moved."
					: "Pick up a tile first.",
			);
		render();
	});
	s.addEventListener("pointermove", (e) =>
	{
		if (!drag || S.phase !== "L") return;
		const c = cellAt(e);
		if (c >= 0 && freeFor(c, S.turn) && !sel.includes(c) && sel.length < PL(S.L[S.turn]!).length)
		{
			sel.push(c);
			render();
		}
	});
	s.addEventListener("pointerup", (e) =>
	{
		if (!drag) return;
		drag = false;
		const c = cellAt(e);
		if (S.phase === "L")
		{
			if (sel.length === PL(S.L[S.turn]!).length)
			{
				commitL();
				return;
			}
			sel = [];
			render();
		}
		else if (S.phase === "B" && selB >= 0)
		{
			const o = occ(S),
				mc = moverCell(selB);
			if (c >= 0 && c !== mc && o[c] === 0)
			{
				moveB(selB, c);
				return;
			}
			if (c === mc && wasSel) selB = -1;
			render();
		}
	});
	s.addEventListener("pointercancel", () =>
	{
		drag = false;
		if (started && S.phase === "L")
		{
			sel = [];
			render();
		}
	});
	$("#mtskip").addEventListener("click", () =>
	{
		if (!myTurn()) return;
		if (S.phase === "B")
		{
			selB = -1;
			S.phase = "T";
			render();
		}
		else if (S.phase === "T") endTurn();
	});
	$("#mtundo").addEventListener("click", () =>
	{
		if (!myTurn()) return;
		const before = JSON.stringify(S);
		S = parseJSON<MState>(snap);
		redo.undone(before, JSON.stringify(S));
		afterUndo();
	});
	$("#mtredo").addEventListener("click", () =>
	{
		if (!myTurn()) return;
		const redone = redo.redo(JSON.stringify(S));
		if (redone === undefined) return;
		S = parseJSON<MState>(redone);
		afterUndo();
	});
	$("#mtend").addEventListener("click", () =>
	{
		if (started && !S.over)
		{
			gid++;
			busy = false;
			S.over = true;
			S.ended = true;
			render();
		}
	});
	$("#mtnew").addEventListener("click", newMatch);
	window.addEventListener(NAMES_RESET, () =>
	{
		mo.names = [];
		msave();
		seatsUI();
		render();
	});
	const nb = $as("#mtnob", HTMLInputElement);
	nb.checked = !!mo.noblock;
	nb.addEventListener("change", () =>
	{
		mo.noblock = nb.checked;
		msave();
		newMatch();
	});
	const hb = $as("#mtham", HTMLInputElement);
	hb.checked = !!mo.hammers;
	hb.addEventListener("change", () =>
	{
		mo.hammers = hb.checked;
		msave();
		if (!hb.checked && started)
		{
			S.hams = [];
			render();
		}
	});
	$$as("input[name=mtlevel]", HTMLInputElement).forEach((r) =>
	{
		r.checked = r.value === mo.level;
		r.addEventListener("change", () =>
		{
			mo.level = r.value;
			msave();
		});
	});
}

const h2r = (x: string): number[] =>
		x
			.slice(1)
			.match(/../g)!
			.map((v) => parseInt(v, 16)),
	r2h = (a: number[]): string => `#${a.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
function seatsUI(): void
{
	$("#mtseats").innerHTML =
		[...Array(NP).keys()]
			.map(
				(p) =>
					`<div class="qseat"><i class="qch" style="background:${COLS[p]};border-color:${COLS[p]}"></i><input class="pname" data-p="${p}" value="${(mo.names ?? [])[p] ? nm(p) : ""}" placeholder="${DEFN[p]}" aria-label="Player ${p + 1} name"><select data-p="${p}" aria-label="${nm(p)} is"><option value="h"${mo.seats[p] === "h" ? " selected" : ""}>Human</option><option value="c"${mo.seats[p] === "c" ? " selected" : ""}>Computer</option></select></div><div class="crow qsl" data-p="${p}">${["R", "G", "B"].map((L, k) => `<label>${L} <input type="range" min="0" max="255" data-c="${k}" value="${h2r(COLS[p]!)[k]}" aria-label="${nm(p)} ${L === "R" ? "red" : L === "G" ? "green" : "blue"}"><output>${h2r(COLS[p]!)[k]}</output></label>`).join("")}</div>`,
			)
			.join("") + '<button id="mtcolReset" style="margin:2px 0 10px">Reset colors</button>';
	$$as("#mtseats .qsl input", HTMLInputElement).forEach((sl) =>
	{
		sl.addEventListener("input", () =>
		{
			const row = sl.closest<HTMLElement>(".qsl")!,
				p = Number(row.dataset["p"]),
				rgb = h2r(COLS[p]!);
			rgb[Number(sl.dataset["c"])] = Number(sl.value);
			if (sl.nextElementSibling instanceof HTMLOutputElement) sl.nextElementSibling.value = sl.value;
			COLS[p] = r2h(rgb);
			if (TEAM)
			{
				COLS[(p + 2) % 4] = COLS[p]!;
				mo.tcols = [COLS[0]!, COLS[1]!];
			}
			else
			{
				mo.cols = mo.cols ?? {};
				mo.cols[NP] = [...COLS];
			}
			msave();
			const ch = row.previousElementSibling!.querySelector<HTMLElement>(".qch")!;
			ch.style.background = COLS[p]!;
			ch.style.borderColor = COLS[p]!;
			render();
		});
	});
	$$as("#mtseats .pname", HTMLInputElement).forEach((i) =>
	{
		i.addEventListener("input", () =>
		{
			mo.names = mo.names ?? [];
			mo.names[Number(i.dataset["p"])] = i.value;
			msave();
			render();
		});
	});
	$("#mtcolReset").addEventListener("click", () =>
	{
		COLS = [...DEF[NP]!];
		if (mo.cols)
		{
			const {[NP]: _dropped, ...rest} = mo.cols;
			mo.cols = rest;
		}
		msave();
		seatsUI();
		render();
	});
	$$as("#mtseats select", HTMLSelectElement).forEach((s) =>
	{
		s.addEventListener("change", () =>
		{
			mo.seats[Number(s.dataset["p"])] = s.value;
			msave();
			newMatch();
		});
	});
}

// odds: random playouts a couple of rounds ahead (L moves only), then each L's room to move decides
let oddsKey = "";
function oddsM(): void
{
	const al = alive();
	const items = (ws: number[]): OddsItem[] =>
	{
		if (TEAM)
			return [0, 1]
				.map((k) => (
				{
					color: COLS[k]!,
					label: k ? "T team" : "L team",
					p: ws[k]! + ws[k + 2]!,
				}))
				.filter((x) => x.p > 0);
		return [...Array(NP).keys()]
			.filter((q) => ws[q]! > 0)
			.map((q) => (
			{
				color: COLS[q]!,
				label: nm(q),
				p: ws[q]!,
			}));
	};
	if (S.over)
	{
		const ws = Array<number>(NP).fill(0);
		if (!S.ended) for (const q of al) ws[q] = 1;
		ODDS("oddsM", al.length && !S.ended ? items(ws) : null);
		return;
	}
	const k = `${snap}|${S.turn}|${S.phase}`;
	if (k === oddsKey) return;
	oddsKey = k;
	const ws = Array<number>(NP).fill(0),
		R = 24,
		o0 = occ(S),
		now = Array<number>(NP).fill(0);
	for (const q of al) now[q] = Math.pow(mob(o0, S, q) + 1, 1.3);
	for (let r = 0; r < R; r++)
	{
		const T: MState =
		{
			...S,
			L: [...S.L],
			alive: [...S.alive],
			sc: S.sc.slice(),
			hh: Array<number>(NP).fill(0),
			hams: [],
		};
		let turn = S.turn;
		for (let step = 0; step < 2 * NP; step++)
		{
			const left = [...Array(NP).keys()].filter((x) => T.alive[x]);
			if (TEAM ? new Set(left.map((x) => x % 2)).size <= 1 : left.length <= 1) break;
			const L: number[] = [];
			mob(occ(T), T, turn, L);
			if (L.length) T.L[turn] = L[Math.floor(Math.random() * L.length)]!;
			else
			{
				T.alive[turn] = 0;
				T.sc[turn] = [...PL(T.L[turn]!)];
			}
			let n = turn;
			do n = (n + 1) % NP;
			while (!T.alive[n] && n !== turn);
			turn = n;
		}
		const o = occ(T),
			sc = al.map((q) => (T.alive[q] ? Math.pow(mob(o, T, q) + 1, 1.3) : 0)),
			tot = sc.reduce((a, b) => a + b, 0) || 1;
		al.forEach((q, i) =>
		{
			ws[q]! += sc[i]! / tot / R;
		});
	}
	const nt = al.reduce((a, q) => a + now[q]!, 0) || 1;
	for (const q of al) ws[q] = 0.6 * ws[q]! + (0.4 * now[q]!) / nt;
	ODDS("oddsM", items(ws));
}

// ---- drawing
function crown(cs: number[]): string
{
	const top = Math.min(...cs.map((c) => Math.floor(c / G))),
		row = cs.filter((c) => Math.floor(c / G) === top),
		x = ((Math.min(...row.map((c) => c % G)) + Math.max(...row.map((c) => c % G)) + 1) / 2) * CW,
		y = top * CW + 20;
	return `<path d="M${x - 30} ${y}L${x - 32} ${y - 30}L${x - 15} ${y - 15}L${x} ${y - 38}L${x + 15} ${y - 15}L${x + 32} ${y - 30}L${x + 30} ${y}Z" fill="#f4c430" stroke="#7a4b00" stroke-width="4" stroke-linejoin="round"/>`;
}
const oldHammer = (hc: number): boolean => (S.round ?? 0) - (S.hamt?.[hc] ?? S.round ?? 0) >= 4;

function render(): void
{
	if (!started) return;
	const p = S.turn,
		hum = myTurn(),
		k = view.rot,
		D = (c: number): number => DMAP(c, G, k),
		xy = (c: number): [number, number] =>
		{
			const d = D(c);
			return [(d % G) * CW, Math.floor(d / G) * CW];
		};
	const present: number[] = [];
	for (let c = 0; c < NC; c++) if (S.tiles[c]) present.push(c);
	const tg = S.phase === "T" && pick >= 0 && hum ? targets(S, pick, G) : [],
		mv = S.phase === "T" && hum && pick < 0 ? movable(S) : [];
	const crowned =
		NP === 4
			? ((): number[] =>
				{
					const al = alive();
					if (!al.length) return [];
					const m = Math.max(...al.map((q) => S.pts[q]!));
					return m > 0 ? al.filter((q) => S.pts[q] === m) : [];
				})()
			: [];
	const board = svg();
	if (view.is3d)
	{
		const o: IsoBoard =
		{
			N: G,
			present,
			stone: S.stone,
			crack: S.crack,
			pieces: [],
			discs: [],
			tiles: [],
			dots: [],
			rings: [],
			over: [],
			vbx: tg,
			crowns: crowned.map((q) => PL(S.L[q]!)),
			rot: k,
			center: G / 2,
		};
		S.L.forEach((_j, q) =>
		{
			const cs = cellsOf(q);
			if (cs.length)
				o.pieces.push(
					{
						cells: cs,
						color: COLS[q]!,
						stone: !S.alive[q] && NP === 4,
						x: !S.alive[q] && NP === 2,
						ghost: q === p && S.phase === "L" && hum && sel.length > 0,
						hl: q === p && S.phase === "L" && !busy && !S.over && !sel.length,
					},
				);
		});
		S.B.forEach((c, i) =>
		{
			o.discs.push(
				{
					c,
					ring: hum && S.phase === "B" && selB === i ? "#2b1d14" : null,
				},
			);
		});
		if (hum && S.phase === "B")
			for (let q = 0; q < NP; q++)
				if (loneStatue(S, q))
					o.over.push(
						{
							c: S.sc[q]![0]!,
							fill: "none",
							stroke: selB === 100 + q ? "#2b1d14" : "#6f6a64",
							sw: selB === 100 + q ? 6 : 3,
						},
					);
		for (const c of sel)
			o.tiles.push(
				{
					c,
					fill: COLS[p]!,
					stroke: COLS[p]!,
					dash: 1,
					op: 0.55,
				},
			);
		for (const c of tg)
			o.tiles.push(
				{
					c,
					fill: "rgba(244,196,48,.25)",
					stroke: "#f4c430",
					dash: 1,
					sw: 4,
				},
			);
		if (pick >= 0)
			o.over.push(
				{
					c: pick,
					fill: "rgba(244,196,48,.35)",
					stroke: "#f4c430",
					sw: 5,
				},
			);
		for (const c of mv)
			o.dots.push(
				{
					c,
					color: "#c99512",
				},
			);
		if (hum && S.phase === "B" && selB >= 0)
		{
			const oc = occ(S);
			for (let c = 0; c < NC; c++)
				if (!oc[c])
					o.dots.push(
						{
							c,
							color: "#2b1d14",
							halo: 1,
						},
					);
		}
		o.hammers = HAMS();
		o.hamOld = HAMS().filter(oldHammer);
		o.hbk =
			S.hbk && Date.now() - S.hbk.t < 900
				?
					{
						c: S.hbk.c,
						age: Date.now() - S.hbk.t,
					}
				: null;
		isoRender(board, o);
	}
	else
	{
		const pts = [...present, ...tg].map(D);
		let x0 = 1e9,
			y0 = 1e9,
			x1 = -1e9,
			y1 = -1e9;
		for (const d of pts)
		{
			const x = d % G,
				y = Math.floor(d / G);
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		const vb = [x0 * CW - 30, y0 * CW - 30, (x1 - x0 + 1) * CW + 60, (y1 - y0 + 1) * CW + 60];
		board.setAttribute("viewBox", vb.join(" "));
		board.dataset["org"] = `50% ${(vb[3]! / 2 / vb[3]!) * 100}%`;
		board.style.aspectRatio = `${vb[2]}/${vb[3]}`;
		let s = `<defs>${COLS.map((c, i) =>
		{
			const v = h2r(c),
				lt = v.map((x) => Math.round(x + (255 - x) * 0.22)),
				dk = v.map((x) => Math.round(x * 0.86));
			return `<linearGradient id="mg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${lt.join(",")})"/><stop offset="1" stop-color="rgb(${dk.join(",")})"/></linearGradient>`;
		}).join("")}</defs>`;
		if (lastT)
		{
			const [x, y] = xy(lastT.from);
			s += `<rect x="${x + 8}" y="${y + 8}" width="84" height="84" rx="12" fill="none" stroke="#c9b48f" stroke-width="3" stroke-dasharray="8 6"/>`;
		}
		for (const c of present)
		{
			const [x, y] = xy(c);
			if (c === S.crack)
				s += `<g class="quake"><rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#ecdfc6" stroke="rgba(209,59,48,.75)" stroke-width="4"/><path d="M${x + 28} ${y + 30}l14 14l-6 12l16 8l10 16M${x + 42} ${y + 44}l18-10" stroke="#4a3626" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
			else if (S.stone.includes(c))
				s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#a39d95" stroke="#6f6a64" stroke-width="2"/><path d="M${x + 25} ${y + 45}l16 6l10-8l14 10" stroke="#5e5953" stroke-width="2" fill="none"/>`;
			else s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/>`;
			if (lastT?.to === c)
				s += `<rect x="${x + 8}" y="${y + 8}" width="84" height="84" rx="12" fill="none" stroke="#c99512" stroke-width="3"/>`;
		}
		for (const c of tg)
		{
			const [x, y] = xy(c);
			s += `<rect x="${x + 8}" y="${y + 8}" width="84" height="84" rx="12" fill="rgba(244,196,48,.18)" stroke="#f4c430" stroke-width="4" stroke-dasharray="10 6"/><path d="M${x + 50} ${y + 36}v28M${x + 36} ${y + 50}h28" stroke="#f4c430" stroke-width="5" stroke-linecap="round"/>`;
		}
		if (lastL)
		{
			const cs = PL(lastL.j).map(D);
			s += `<path d="${LPATH(cs, G, 100, 16, 14, 6)}" fill="none" stroke="${COLS[lastL.p]}" stroke-width="3" stroke-dasharray="6 6" opacity=".7"/>`;
		}
		for (const hc of HAMS())
		{
			const [x, y] = xy(hc);
			s += HAMMER(x + 50, y + 48, 1.15, oldHammer(hc));
		}
		if (S.hbk && Date.now() - S.hbk.t < 900)
		{
			const [x, y] = xy(S.hbk.c);
			s += HBREAK(x + 50, y + 40, Date.now() - S.hbk.t);
		}
		S.L.forEach((_j, q) =>
		{
			const cs = cellsOf(q);
			if (!cs.length) return;
			const d = LPATH(cs.map(D), G),
				lifted = q === p && S.phase === "L" && hum && sel.length > 0,
				gone = !S.alive[q];
			if (gone && NP === 2)
				s += `<g><path transform="translate(0,6)" d="${d}" fill="rgba(0,0,0,.3)"/><path d="${d}" fill="url(#mg${q})"/>${cs
					.map((c) =>
					{
						const [x, y] = xy(c);
						return `<g class="pulse" stroke="#fff" stroke-width="7" stroke-linecap="round"><line x1="${x + 27}" y1="${y + 27}" x2="${x + 73}" y2="${y + 73}"/><line x1="${x + 73}" y1="${y + 27}" x2="${x + 27}" y2="${y + 73}"/></g>`;
					})
					.join("")}</g>`;
			else if (gone)
				s += `<g><path transform="translate(0,6)" d="${d}" fill="rgba(0,0,0,.3)"/><path d="${d}" fill="#97928b" stroke="#4e4a45" stroke-width="5"/>${cs
					.map((c) =>
					{
						const [x, y] = xy(c);
						return `<path d="M${x + 30} ${y + 28}l12 14l-6 12l14 10M${x + 64} ${y + 60}l-10 8" stroke="#3a3632" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
					})
					.join("")}</g>`;
			else
				s += `<g${lifted ? ' opacity=".28"' : ""}><path transform="translate(0,6)" d="${d}" fill="rgba(0,0,0,.3)"/><path d="${d}" fill="url(#mg${q})"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" transform="translate(0,1.5)"/></g>`;
		});
		S.B.forEach((c, i) =>
		{
			const [x, y] = xy(c);
			s += `<g transform="translate(0,6)"><circle cx="${x + 50}" cy="${y + 50}" r="24" fill="rgba(0,0,0,.3)"/></g><circle cx="${x + 50}" cy="${y + 50}" r="24" fill="#1a1a1a"/><circle cx="${x + 43}" cy="${y + 42}" r="7" fill="rgba(255,255,255,.15)"/>`;
			if (hum && S.phase === "B" && selB === i)
				s += `<circle cx="${x + 50}" cy="${y + 50}" r="32" fill="none" stroke="#fff" stroke-width="10"/><circle cx="${x + 50}" cy="${y + 50}" r="32" fill="none" stroke="#2b1d14" stroke-width="5"/>`;
		});
		if (hum && S.phase === "B")
			for (let q = 0; q < NP; q++)
				if (loneStatue(S, q))
				{
					const [x, y] = xy(S.sc[q]![0]!),
						on = selB === 100 + q;
					s += `<rect x="${x + 3}" y="${y + 3}" width="94" height="94" rx="16" fill="none" stroke="${on ? "#2b1d14" : "#6f6a64"}" stroke-width="${on ? 6 : 3}"${on ? "" : ' stroke-dasharray="8 6"'}/>`;
				}
		if (hum && S.phase === "B" && selB >= 0)
		{
			const oc = occ(S);
			for (let c = 0; c < NC; c++)
				if (!oc[c])
				{
					const [x, y] = xy(c);
					s += `<circle cx="${x + 50}" cy="${y + 50}" r="9" fill="#2b1d14" stroke="#fff" stroke-width="3" opacity=".85"/>`;
				}
		}
		for (const c of mv)
		{
			const [x, y] = xy(c);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="7" fill="#c99512" opacity=".55"/>`;
		}
		if (pick >= 0)
		{
			const [x, y] = xy(pick);
			s += `<rect x="${x + 3}" y="${y + 3}" width="94" height="94" rx="14" fill="rgba(244,196,48,.3)" stroke="#f4c430" stroke-width="6"/>`;
		}
		for (const c of sel)
		{
			const [x, y] = xy(c);
			s += `<rect x="${x + 14}" y="${y + 14}" width="72" height="72" rx="14" fill="${COLS[p]}" fill-opacity=".35" stroke="${COLS[p]}" stroke-width="4" stroke-dasharray="10 6"/>`;
		}
		if (!S.over && S.phase === "L" && !busy && !sel.length)
			s += `<path d="${LPATH(PL(S.L[p]!).map(D), G, 100, 4, 21, 10)}" fill="none" stroke="${COLS[p]}" stroke-width="4" opacity=".9"/>`;
		for (const q of crowned) s += crown(PL(S.L[q]!).map(D));
		board.innerHTML = s;
	}
	oddsM();
	renderPanel(p, hum);
}

function renderPanel(p: number, hum: boolean): void
{
	const al = alive(),
		W = S.over && !S.ended ? al : [];
	$("#mtchip").style.background = S.over ? (W.length ? COLS[W[0]!]! : "#8f8a83") : COLS[p]!;
	$("#mtstatus").textContent = S.over
		? TEAM && W.length
			? `${W[0]! % 2 ? "T" : "L"} team wins`
			: W.length === 1
				? `${nm(W[0]!)} wins${NP === 4 ? ": last L standing" : ""}`
				: W.length
					? "Shared win"
					: "Match ended"
		: busy
			? `${nm(p)} (computer) is moving`
			: S.phase === "L"
				? `${nm(p)}: move your ${pn(p)}`
				: S.phase === "B"
					? `${nm(p)}: move a blocker (optional)`
					: `${nm(p)}: move a tile (optional)`;
	const hh = S.hh[p] ?? 0;
	if (!$("#mtinstr").classList.contains("err"))
		$("#mtinstr").textContent = S.over
			? ""
			: busy
				? "Thinking…"
				: S.phase === "L"
					? (hh > 0
							? `You have ${hh} hammer${hh === 1 ? "" : "s"}: your L may cover up to ${hh} blocker${hh === 1 ? "" : "s"}, statue square${hh === 1 ? "" : "s"} or square${hh === 1 ? "" : "s"} of other L's, breaking each one. `
							: "") +
						`${PL(S.L[p]!).length === 1 ? "Tap an empty tile" : `Swipe across ${["", "", "two", "three", "four"][PL(S.L[p]!).length]} empty tiles`} in one stroke to set your ${pn(p)} down somewhere new.`
					: S.phase === "B"
						? S.sc.some((_a, q) => loneStatue(S, q))
							? "Tap a black blocker or a one-piece statue (dashed outline), then an empty tile. Or press Skip blocker."
							: "Tap a black blocker, then an empty tile. Or press Skip blocker."
						: pick < 0
							? "Tap a tile with a gold dot to lift it (a blocker or one-piece statue on it rides along). Then tap a gold spot that shares a side with another tile. Or press End turn."
							: "Tap a gold spot to set the tile down, or tap the tile again to put it back. Spots that would split the floor apart aren't shown.";
	{
		const nw = $("#mtnews");
		nw.hidden = !S.news;
		nw.textContent = S.news;
	}
	$("#mtfloor").textContent =
		NP === 4 && !S.over
			? S.moves < COLLAPSE_AT
				? `Turn ${S.moves + 1}. Tiles start cracking in ${COLLAPSE_AT - S.moves} turn${COLLAPSE_AT - S.moves === 1 ? "" : "s"}.`
				: "The floor is collapsing: a red-outlined tile falls after everyone moves once."
			: "";
	const sk = $as("#mtskip", HTMLButtonElement);
	sk.textContent = S.phase === "B" ? "Skip blocker" : "End turn";
	sk.disabled = !(hum && (S.phase === "B" || S.phase === "T"));
	$as("#mtundo", HTMLButtonElement).disabled = !hum || (S.phase === "L" && !sel.length);
	$as("#mtredo", HTMLButtonElement).disabled = !hum || !redo.can(JSON.stringify(S));
	$as("#mtend", HTMLButtonElement).disabled = S.over;
	const o = occ(S);
	$("#mtscore").innerHTML = [...Array(NP).keys()]
		.map((q) =>
		{
			const m = S.alive[q] ? mob(o, S, q) : 0;
			return `<div class="qrow${q === p && !S.over ? " now" : ""}${S.alive[q] ? "" : " dead"}"><i class="qch" style="background:${S.alive[q] ? COLS[q] : "#8f8a83"};border-color:${COLS[q]}"></i><span class="qn">${nm(q)}${TEAM ? ` <small>${q % 2 ? "T" : "L"} team</small>` : ""}${mo.seats[q] === "c" ? " <small>computer</small>" : ""}${mo.hammers || S.hc?.[q] ? HB(S.hc?.[q] ?? 0, S.hh[q] ?? 0) : ""}</span><span class="qs">${S.alive[q] ? `<b class="mv mv${m <= 2 ? "r" : m <= 5 ? "o" : "g"}">${m} place${m === 1 ? "" : "s"}</b>` : NP === 2 ? "boxed in" : "statue"}</span><b>${NP === 4 ? S.pts[q] : ""}</b></div>`;
		})
		.join("");
	const res = $("#mtres");
	res.classList.toggle("on", S.over);
	if (S.over)
	{
		const w0 = W[0]!;
		res.innerHTML =
			(TEAM && W.length
				? `<b>The ${w0 % 2 ? "T" : "L"} team wins.</b> The other team is out.`
				: W.length === 1
					? `<b>${nm(w0)} wins.</b> ${NP === 2 ? (S.ko === 1 - w0 ? `${nm(w0)} smashed the last piece of ${nm(1 - w0)}'s L with a hammer.` : `${nm(1 - w0)}'s L had nowhere to go.`) : "Last L standing."}`
					: S.ended
						? "<b>Match ended early.</b>"
						: "<b>Shared win.</b>") +
			'<div class="row" style="justify-content:center;margin-top:8px"><button class="main" id="mtagain">Play again</button></div>';
		$("#mtagain").addEventListener("click", newMatch);
	}
}

// The number of players Moving Tiles is set to, which the header shows.
export const tilesPlayers = (): number => (mo.n === 4 ? 4 : 2);
export const tilesStarted = (): boolean => started;
export function setTilesPlayers(n: number): void
{
	mo.n = n;
	msave();
}
export {newMatch as newTilesMatch};

export function initTiles(): void
{
	try
	{
		Object.assign(mo, parseJSON<Partial<TilesOptions>>(getItem("lgame-mt") ?? "{}"));
	}
	catch
	{
		// Unreadable settings leave the defaults.
	}
	wireInput();
	window.addEventListener(MODE_CHANGED, (e) =>
	{
		if (e instanceof CustomEvent && e.detail === "t" && !started) newMatch();
	});
	window.addEventListener(VIEW_CHANGED, render);
	setup();
	seatsUI();
	let v0 = "c";
	try
	{
		v0 = localStorage.getItem("lgame-view") ?? "c";
	}
	catch
	{
		// Storage is unavailable, so the page opens on the classic game.
	}
	if (v0 === "t") newMatch();
}
