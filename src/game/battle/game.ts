import {HAMMER, HB, HBREAK, ODDS, type OddsItem} from "../art.ts";
import {$, $$as, $as, cleanName, copyCode, parseJSON} from "../dom.ts";
import {CONN, DMAP, keyOf, LPATH} from "../geometry.ts";
import {type IsoBoard, cellAt as isoCellAt, render as isoRender} from "../iso.ts";
import {PIECE} from "../piece.ts";
import {Redo} from "../redo.ts";
import {getItem, setItem} from "../storage.ts";
import {NAMES_RESET, view, VIEW_CHANGED} from "../view.ts";
import {crackTile, crown, crownMini, CW, D, setTurn, shapes, statue, stoneFloor, xy} from "./art.ts";
import {drawGuide, drawTraps, drawWeak} from "./guide.ts";
import
{
	BY,
	COLLAPSE_AT,
	CORN,
	mate,
	N,
	NC,
	PIDX,
	PL,
	qCode,
	qFmt,
	qParse,
	type QPart,
	type QState,
	SH,
	sqN,
	START_L,
	TEAM,
} from "./rules.ts";

// The 4-player battle: the match in play, its computer players, input on the board, and drawing it.

const DEFCOLS = ["#e0463a", "#f2c12e", "#2ea44f", "#2f6be0"],
	COLS = [...DEFCOLS],
	DEFN = ["P1", "P2", "P3", "P4"];

interface BattleOptions
{
	names: (string | null)[];
	seats: string[];
	level: string;
	cols?: string[];
	tcols?: string[];
	hammers?: boolean;
}
const qo: BattleOptions =
{
	names: [...DEFN],
	seats: ["h", "c", "c", "c"],
	level: "hard",
};
const qsave = (): void =>
{
	try
	{
		setItem("lgame-q", JSON.stringify(qo));
	}
	catch
	{
		// Storage is unavailable, so the settings last only until the page reloads.
	}
};
const nm = (p: number): string => cleanName(qo.names[p]) || DEFN[p]!;
const hex2rgb = (c: string): number[] =>
		c
			.slice(1)
			.match(/../g)!
			.map((x) => parseInt(x, 16)),
	rgb2hex = (a: number[]): string =>
		`#${a
			.map((v) =>
				Math.max(0, Math.min(255, v | 0))
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")}`;

// The match in play. Until the first one starts, a blank stands in.
let started = false;
// Takes back an undo within the turn.
const redo = new Redo();
let S: QState =
{
	L: [...START_L],
	alive: [1, 1, 1, 1],
	pts: [0, 0, 0, 0],
	B: [...CORN],
	turn: 0,
	phase: "L",
	over: false,
	dead: [],
	moves: 0,
	holes: [],
	stone: [],
	crack: -1,
	news: "",
};
let startSeat = 0,
	snapT = "",
	sel: number[] = [],
	selB = -1,
	wasSel = false,
	drag = false,
	busy = false,
	gid = 0,
	lastL:
	{
		p: number;
		j: number;
	} | null = null,
	lastB:
	{
		from: number;
		to: number;
	} | null = null,
	fresh: number[] = [],
	msgT = 0;

const HAMS = (T: Partial<QState> = S): number[] =>
	T.hams ?? (T.hammer !== undefined && T.hammer >= 0 ? [T.hammer] : []);
// A piece's squares: a live piece's placement, or what is left of a statue.
function cellsOf(q: number, T: QPart = S): number[]
{
	const j = T.L[q]!,
		al = (T.alive ?? S.alive)[q];
	if (al) return PL[j]!;
	const SC = T.sc ?? S.sc;
	if (SC?.[q]) return SC[q];
	const H = T.holes ?? S.holes,
		ST = T.stone ?? S.stone;
	return PL[j]!.filter((c) => !H.includes(c) && !ST.includes(c));
}
// a statue keeps its own list of squares, so stone floor under it (or under its sunk pieces) never changes its shape
const petrify = (q: number): void =>
{
	S.sc = S.sc ?? [null, null, null, null];
	S.sc[q] = [...PL[S.L[q]!]!];
};
// What covers each square: 1 to 4 a player's piece, 9 a blocker, 8 a hole.
function occ(
	T: QPart &
	{
		B: number[];
	},
): Uint8Array
{
	const o = new Uint8Array(NC);
	T.L.forEach((_j, p) =>
	{
		for (const c of cellsOf(p, T)) o[c] = p + 1;
	});
	for (const b of T.B) o[b] = 9;
	const H = T.holes ?? S.holes;
	for (const c of H) if (o[c] === 0) o[c] = 8;
	return o;
}
// How many places player p's piece can move to (and which, into list). With hammers, a piece may cover blockers,
// statue squares or squares of other pieces, one hammer each, as long as each piece it hits stays in one piece.
// landing on the hammer and a statue square at once also works: the hammer is picked up and used straight away
function mob(o: Uint8Array, T: QPart, p: number, list?: number[]): number
{
	let n = 0;
	const ck = T.crack ?? S.crack,
		hh = (T.hh ?? S.hh ?? [])[p] ?? 0,
		AL = T.alive ?? S.alive,
		HS = T.hams ?? S.hams ?? [];
	for (const j of BY[SH[T.L[p]!]!]!)
	{
		if (j === T.L[p]) continue;
		const cs = PL[j]!;
		if (ck >= 0 && cs.includes(ck)) continue;
		const have = hh + (HS.length ? cs.filter((c) => HS.includes(c)).length : 0);
		let ok = true,
			other = 0;
		const hit: Record<number, number[]> = {};
		for (const c of cs)
		{
			const v = o[c]!;
			if (!v || v === p + 1) continue;
			if (v <= 4 && AL[v - 1])
			{
				if (mate(p, v - 1))
				{
					ok = false;
					break;
				}
				(hit[v] ??= []).push(c);
				continue;
			}
			if (v === 9 || v <= 4)
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
				const pc = PL[T.L[k - 1]!]!,
					rest = pc.filter((x) => !hit[k]!.includes(x));
				if (!CONN(rest, N))
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
const legal = (p: number): number[] =>
{
	const r: number[] = [];
	mob(occ(S), S, p, r);
	return r;
};
const aliveList = (): number[] => [0, 1, 2, 3].filter((q) => S.alive[q]);
const done = (): boolean =>
{
	const al = aliveList();
	return TEAM ? new Set(al.map((x) => x % 2)).size <= 1 : al.length <= 1;
};
const human = (p: number): boolean => qo.seats[p] === "h";
const code = (T: QState): string => qCode(T, (q) => cellsOf(q, T));

// a loaded position may leave the player to move stuck: they turn to stone and play passes on
function settle(): void
{
	for (let g = 0; g < 4 && !S.over; g++)
	{
		if (done())
		{
			S.over = true;
			break;
		}
		if (legal(S.turn).length) break;
		const q = S.turn;
		let n = q;
		do n = (n + 1) % 4;
		while (!S.alive[n]);
		eliminate(q, null);
		S.turn = n;
	}
	if (done()) S.over = true;
}
const rotQ = (T: QState, k: number): QState =>
	k
		?
			{
				...T,
				L: T.L.map((j) => PIDX.get(keyOf(PL[j]!.map((c) => DMAP(c, N, k))))!),
				B: T.B.map((c) => DMAP(c, N, k)),
				holes: T.holes.map((c) => DMAP(c, N, k)),
				stone: T.stone.map((c) => DMAP(c, N, k)),
				...(T.sc
					?
						{
							sc: T.sc.map((a) => (a === null ? null : a.map((c) => DMAP(c, N, k)))),
						}
					: {}),
				crack: T.crack >= 0 ? DMAP(T.crack, N, k) : -1,
			}
		: T;
function loadCode(str: string): boolean
{
	const r = qParse(str),
		m = $("#qcodeMsg");
	if (!r.S)
	{
		m.textContent = r.err;
		m.classList.add("bad");
		return false;
	}
	gid++;
	busy = false;
	S = rotQ(r.S, (4 - view.rot) % 4);
	started = true;
	sel = [];
	selB = -1;
	lastL = null;
	lastB = null;
	fresh = [];
	settle();
	if (S.moves >= COLLAPSE_AT && !S.over) chooseCrack();
	snapT = JSON.stringify(S);
	m.textContent = `Loaded ${qFmt(code(S))}.`;
	m.classList.remove("bad");
	render();
	maybeAI();
	return true;
}
function newMatch(): void
{
	oddsKey = "";
	gid++;
	busy = false;
	S =
	{
		L: [...START_L],
		alive: [1, 1, 1, 1],
		pts: [0, 0, 0, 0],
		B: [...CORN],
		turn: startSeat++ % 4,
		phase: "L",
		over: false,
		dead: [],
		moves: 0,
		holes: [],
		stone: [],
		crack: -1,
		pending: [],
		news: "",
		hams: [],
		hh: [0, 0, 0, 0],
		hnews: "",
	};
	started = true;
	snapT = JSON.stringify(S);
	sel = [];
	selB = -1;
	lastL = null;
	lastB = null;
	fresh = [];
	render();
	maybeAI();
}
// Starts the first match when the battle is first shown.
export function ensureMatch(): void
{
	if (!started) newMatch();
}
const dtOf = (q: number): number =>
{
	const t = S.dt?.[q];
	if (t) return t;
	return (S.dead.indexOf(q) + 1) * 0.001;
};

// odds: random playouts a couple of rounds ahead, then each L's room to move decides
let oddsKey = "";
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
	return [0, 1, 2, 3]
		.filter((q) => ws[q]! > 0)
		.map((q) => (
		{
			color: COLS[q]!,
			label: nm(q),
			p: ws[q]!,
		}));
};
function oddsQ(): void
{
	const W = winners();
	if (S.over)
	{
		const ws = [0, 0, 0, 0];
		for (const q of W) ws[q] = 1;
		ODDS("oddsQ", W.length ? items(ws) : null);
		return;
	}
	const k = `${snapT}|${S.turn}`;
	if (k === oddsKey) return;
	oddsKey = k;
	const al = aliveList(),
		ws = [0, 0, 0, 0],
		R = 24,
		o0 = occ(S),
		now = [0, 0, 0, 0];
	for (const q of al) now[q] = Math.pow(mob(o0, S, q) + 1, 1.3);
	for (let r = 0; r < R; r++)
	{
		const T: QState =
		{
			...S,
			L: [...S.L],
			alive: [...S.alive],
			sc: (S.sc ?? [null, null, null, null]).slice(),
			hh: [0, 0, 0, 0],
			hams: [],
		};
		let turn = S.turn;
		for (let step = 0; step < 8; step++)
		{
			const left = [0, 1, 2, 3].filter((x) => T.alive[x]);
			if (TEAM ? new Set(left.map((x) => x % 2)).size <= 1 : left.length <= 1) break;
			const L: number[] = [];
			mob(occ(T), T, turn, L);
			if (L.length) T.L[turn] = L[Math.floor(Math.random() * L.length)]!;
			else
			{
				T.alive[turn] = 0;
				T.sc![turn] = [...PL[T.L[turn]!]!];
			}
			let n = turn;
			do n = (n + 1) % 4;
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
	ODDS("oddsQ", items(ws));
}
const standings = (): number[] =>
	[0, 1, 2, 3].toSorted((a, b) => S.alive[b]! - S.alive[a]! || dtOf(b) - dtOf(a) || S.pts[b]! - S.pts[a]!);
function winners(): number[]
{
	if (!S.over || S.ended) return [];
	const al = aliveList();
	if (TEAM)
	{
		const t = al.length ? al[0]! % 2 : [0, 1, 2, 3].toSorted((a, b) => dtOf(b) - dtOf(a))[0]! % 2;
		return [t, t + 2];
	}
	if (al.length === 1) return al;
	if (al.length) return [];
	const last = Math.max(...[0, 1, 2, 3].map(dtOf));
	return [0, 1, 2, 3].filter((q) => dtOf(q) === last);
}
function crowned(): number[]
{
	const al = aliveList();
	if (!al.length) return [];
	const m = Math.max(...al.map((q) => S.pts[q]!));
	return m > 0 ? al.filter((q) => S.pts[q] === m) : [];
}
const addNews = (t: string): void =>
{
	S.news = (S.news ? `${S.news} ` : "") + t;
};
function chooseCrack(mover = -1): void
{
	const skip = mover >= 0 && S.alive[mover] ? PL[S.L[mover]!]! : [];
	const cand = [...Array(NC).keys()].filter((c) => !S.holes.includes(c) && !skip.includes(c));
	if (!cand.length)
	{
		S.crack = -1;
		return;
	}
	const safe = cand.filter((c) =>
			aliveList().every(
				(q) =>
					mob(
						occ(
							{
								L: S.L,
								B: S.B,
								holes: S.holes,
								crack: c,
							},
						),
						{
							L: S.L,
							crack: c,
						},
						q,
					) > 0,
			),
		),
		pool = safe.length ? safe : cand;
	S.crack = pool[Math.floor(Math.random() * pool.length)]!;
	S.pending = aliveList();
	const what = ((): string =>
	{
		const o = occ(
				{
					L: S.L,
					B: S.B,
					holes: S.holes,
					crack: -1,
				},
			),
			v = o[S.crack]!;
		return v === 9
			? " under a blocker"
			: v >= 1 && v <= 4
				? S.alive[v - 1]
					? ` under ${nm(v - 1)}'s L`
					: ` under ${nm(v - 1)}'s statue`
				: "";
	})();
	addNews(`The tile at ${sqN(S.crack)}${what} is cracking: it falls after everyone has moved once.`);
}
function eliminate(q: number, killer: number | null): void
{
	petrify(q);
	S.alive[q] = 0;
	S.dead.push(q);
	(S.dt ??= [0, 0, 0, 0])[q] = S.moves + 1;
	fresh.push(q);
	if (killer === null)
	{
		const left = aliveList();
		for (const x of left) S.pts[x]!++;
		addNews(
			`${nm(q)} had no move at the start of their turn because the floor closed in: turned to stone (natural causes), ${left.length ? "+1 for everyone still standing." : "nobody is left standing."}`,
		);
	}
	else if (mate(killer, q))
		addNews(
			`${nm(q)} had no move at the start of their turn: boxed in by their own teammate's move, so nobody scores.`,
		);
	else
	{
		S.pts[killer]!++;
		addNews(`${nm(q)} had no move at the start of their turn: checkmated by ${nm(killer)}.`);
	}
}
let justFell:
	{
		c: number;
		t: number;
		stone: boolean;
	} | null = null,
	justDrop:
	{
		c: number;
		t: number;
	} | null = null,
	justStone:
	{
		c: number;
		t: number;
	} | null = null;
function fall(): void
{
	const c = S.crack;
	S.crack = -1;
	S.pending = [];
	let msg2 = "",
		text: string;
	const sq = [0, 1, 2, 3].find((q) => !S.alive[q] && cellsOf(q).includes(c));
	if (sq === undefined)
	{
		S.holes.push(c);
		if (HAMS().includes(c))
		{
			S.hams = HAMS().filter((x) => x !== c);
			msg2 = " The hammer on it fell too.";
		}
		const wasStone = S.stone.includes(c);
		S.stone = S.stone.filter((x) => x !== c);
		justFell =
		{
			c,
			t: Date.now(),
			stone: wasStone,
		};
		text = `The ${wasStone ? "stone floor" : "tile"} at ${sqN(c)} fell away.`;
		const bi = S.B.indexOf(c);
		if (bi >= 0)
		{
			const o = occ(S),
				free = [...Array(NC).keys()].filter((x) => !o[x]);
			if (free.length)
			{
				const to = free[Math.floor(Math.random() * free.length)]!;
				S.B[bi] = to;
				lastB =
				{
					from: c,
					to,
				};
				justDrop =
				{
					c: to,
					t: Date.now(),
				};
				text += ` Its blocker dropped back down on ${sqN(to)}.`;
			}
		}
	}
	else
	{
		S.sc = S.sc ?? [null, null, null, null];
		S.sc[sq] = cellsOf(sq).filter((x) => x !== c);
		if (!S.stone.includes(c)) S.stone.push(c);
		justStone =
		{
			c,
			t: Date.now(),
		};
		text = `The tile at ${sqN(c)} gave way, and the piece of ${nm(sq)}'s statue on it sank into the gap and became stone floor.`;
	}
	addNews(text + msg2);
}
let lastBSeen:
	{
		from: number;
		to: number;
	} | null = null,
	lastBT = 0,
	freshSeen = "",
	freshT = 0;
function collapse(p: number): void
{
	if (S.crack >= 0)
	{
		S.pending = (S.pending ?? []).filter((q) => q !== p && S.alive[q]);
		if (S.pending.length) return;
		fall();
	}
	if (S.crack < 0 && aliveList().length > 1) chooseCrack(p);
}
function endTurn(): void
{
	const p = S.turn;
	fresh = [];
	S.news = S.hnews ?? "";
	S.hnews = "";
	// who has no move right after this move (before the floor changes): if they're still stuck when their turn comes,
	// this player gets the checkmate
	const o = occ(S),
		stuckAfterMove = new Set(aliveList().filter((q) => q !== p && mob(o, S, q) === 0));
	S.moves++;
	if (S.moves >= COLLAPSE_AT) collapse(p);
	// an L can only be checkmated when its own turn starts
	let n = p;
	for (let g = 0; g < 4; g++)
	{
		if (done())
		{
			S.over = true;
			break;
		}
		do n = (n + 1) % 4;
		while (!S.alive[n]);
		if (legal(n).length)
		{
			S.turn = n;
			break;
		}
		eliminate(n, stuckAfterMove.has(n) ? p : null);
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
			addNews(
				old.length === 1
					? "A hammer nobody picked up crumbled away."
					: `${old.length} hammers nobody picked up crumbled away.`,
			);
		}
	}
	if (qo.hammers && S.newRound && S.round! % 3 === 0 && HAMS().length < 3) spawnHammer();
	if (done()) S.over = true;
	{
		const o2 = occ(S);
		S.low = S.low ?? [null, null, null, null];
		for (const q of aliveList())
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
	snapT = JSON.stringify(S);
	render();
	maybeAI();
}

const cen = (c: number): number =>
{
	const dr = Math.abs(Math.floor(c / N) - 2.5),
		dc = Math.abs((c % N) - 2.5);
	return dr < 1 && dc < 1 ? 3 : dr < 2 && dc < 2 ? 1 : 0;
};
// ---- computer players
function aiMove(p: number):
{
	s: number;
	j: number;
	bi: number;
	to: number;
} | null
{
	const o = occ(S),
		Ls: number[] = [];
	mob(o, S, p, Ls);
	const others = aliveList().filter((q) => q !== p && !mate(p, q)),
		pals = aliveList().filter((q) => q !== p && mate(p, q)),
		LV = qo.level,
		hard = LV !== "easy",
		fair = LV === "fair";
	// Fair: only its own target is worth a checkmate, and a player who just dropped to 1 or 2 places gets one round of
	// grace
	const prot = new Set(
		fair
			? others.filter(
					(q) =>
						S.low && S.low[q] !== null && S.low[q] !== undefined && S.moves - S.low[q] < aliveList().length,
				)
			: [],
	);
	// each computer squeezes its own target instead of everyone piling onto the weakest player (usually the human):
	// the crown holder if one player leads in checkmates, otherwise the next player still in the game after it
	const lead = ((): number =>
	{
		const m = Math.max(...others.map((q) => S.pts[q]!));
		const top = others.filter((q) => S.pts[q] === m);
		return m > 0 && top.length === 1 ? top[0]! : -1;
	})();
	const target =
		lead >= 0
			? lead
			: ((): number =>
				{
					let n = p;
					for (let g = 0; g < 4; g++)
					{
						n = (n + 1) % 4;
						if (S.alive[n] && n !== p && !mate(p, n)) return n;
					}
					return -1;
				})();
	const ev = (o2: Uint8Array, L2: number[]): number =>
	{
		const T =
		{
			L: L2,
		};
		let kills = 0,
			press = 0;
		for (const q of others)
		{
			const m = mob(o2, T, q);
			if (!m) kills += prot.has(q) ? -0.3 : !fair || q === target ? 1 : 0.15;
			else if (!prot.has(q)) press += Math.max(0, 10 - m) * (q === target ? 5 : fair ? 0.6 : 1.2);
		}
		const mine = mob(o2, T, p);
		let s = kills * 1000 + press + Math.min(mine, 15) * 4 - (mine === 0 ? 900 : mine <= 2 ? 150 : 0);
		for (const q of pals)
		{
			const pm = mob(o2, T, q);
			s += pm === 0 ? -800 : Math.min(pm, 12) * 2;
		}
		for (const c of PL[L2[p]!]!)
		{
			s += cen(c) * 3;
			if (CORN.includes(c)) s -= 8;
		}
		return s;
	};
	const KO = (j: number): number =>
	{
		let s = 0;
		for (const q of others)
		{
			const pc = PL[S.L[q]!]!;
			if (pc.every((c) => PL[j]!.includes(c))) s += !fair || q === target ? 1000 : 100;
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
					occ(
						{
							L: L2,
							B: S.B,
						},
					),
					L2,
				) +
				60 * PL[j]!.filter((c) => HAMS().includes(c)).length +
				KO(j),
		};
	})
		.toSorted((a, b) => b.s - a.s)
		.slice(0, hard ? 14 : 6);
	let best:
	{
		s: number;
		j: number;
		bi: number;
		to: number;
	} | null = null;
	for (const c of cand)
	{
		const L2 = [...S.L];
		L2[p] = c.j;
		const base = occ(
			{
				L: L2,
				B: S.B,
			},
		);
		const tryB = (B2: number[], bi: number, to: number): void =>
		{
			const s =
				ev(
					occ(
						{
							L: L2,
							B: B2,
						},
					),
					L2,
				) +
				KO(c.j) +
				Math.random() * (hard ? 40 : 1400);
			if (!best || s > best.s)
				best =
				{
					s,
					j: c.j,
					bi,
					to,
				};
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
	}
	return best;
}
function maybeAI(): void
{
	if (S.over || human(S.turn)) return;
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
			do m = (m + 1) % 4;
			while (!S.alive[m] && m !== p);
			eliminate(p, null);
			if (done()) S.over = true;
			else S.turn = m;
			snapT = JSON.stringify(S);
			render();
			maybeAI();
			return;
		}
		lastL =
		{
			p,
			j: S.L[p]!,
		};
		lastB = null;
		placeL(p, mv.j);
		S.phase = "B";
		render();
		window.setTimeout(
			() =>
			{
				if (id !== gid) return;
				if (mv.bi >= 0)
				{
					lastB =
					{
						from: S.B[mv.bi]!,
						to: mv.to,
					};
					S.B[mv.bi] = mv.to;
				}
				busy = false;
				endTurn();
			},
			mv.bi >= 0 ? 600 : 300,
		);
	}, 650);
}
function msg(t: string): void
{
	const e = $("#qinstr");
	e.textContent = t;
	e.classList.add("err");
	clearTimeout(msgT);
	msgT = window.setTimeout(() =>
	{
		e.classList.remove("err");
		render();
	}, 1800);
}

// ---- input
const svg = (): SVGSVGElement => $as("#qboard", SVGSVGElement);
const myTurn = (): boolean => started && !S.over && !busy && human(S.turn);
const back = (d: number): number => (d < 0 ? -1 : DMAP(d, N, (4 - view.rot) % 4));
function cellAt(e: PointerEvent): number
{
	if (view.turning) return -1;
	const s = svg();
	if (view.is3d) return back(isoCellAt(s, e, N));
	const r = s.getBoundingClientRect(),
		x = ((e.clientX - r.left) / r.width) * 600,
		y = ((e.clientY - r.top) / r.height) * 600;
	const cx = Math.floor(x / CW),
		cy = Math.floor(y / CW);
	return cx < 0 || cy < 0 || cx >= N || cy >= N ? -1 : back(cy * N + cx);
}
function freeFor(c: number, p: number): boolean
{
	const o = occ(S),
		v = o[c]!,
		hm = (S.hh?.[p] ?? 0) > 0;
	const any = hm || HAMS().length > 0;
	return c !== S.crack && (v === 0 || v === p + 1 || (any && (v === 9 || (v > 0 && v <= 4))));
}
const statueSq = (c: number): boolean => [0, 1, 2, 3].some((q) => !S.alive[q] && cellsOf(q).includes(c));
// set an L down: break what it covers with its hammers, and pick up a hammer it lands on
function placeL(p: number, j: number): void
{
	const K = 4,
		own = PL[S.L[p]!]!,
		HS = HAMS(),
		got = PL[j]!.filter((c) => HS.includes(c)),
		live = PL[j]!.filter(
			(c) =>
				!own.includes(c) && [...Array(K).keys()].some((q) => q !== p && S.alive[q] && PL[S.L[q]!]!.includes(c)),
		),
		sm = PL[j]!.filter(statueSq),
		bl = PL[j]!.filter((c) => S.B.includes(c)),
		add = (t: string): void =>
		{
			S.hnews = (S.hnews ? `${S.hnews} ` : "") + t;
		};
	const before = (S.hh?.[p] ?? 0) + got.length;
	S.L[p] = j;
	const hh = (S.hh ??= Array<number>(K).fill(0)),
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
		S.sc = S.sc ?? [null, null, null, null];
		S.sc[q] = [];
		S.dead.push(q);
		S.dt = S.dt ?? [];
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
		const q = [...Array(K).keys()].find((x) => x !== p && S.alive[x] && PL[S.L[x]!]!.includes(c))!;
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
		t.rest = PL[S.L[t.q]!]!.filter((x) => !cs.includes(x));
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
		const nj = PIDX.get(keyOf(rest));
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
			const to = free[Math.floor(Math.random() * free.length)]!;
			S.B[i] = to;
			lastB =
			{
				from: b,
				to,
			};
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
				S.sc = S.sc ?? [null, null, null, null];
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
	const c = free[Math.floor(Math.random() * free.length)]!;
	S.hams = [...HS, c];
	(S.hamt ??= {})[c] = S.round ?? 0;
	addNews(`A hammer appeared on ${sqN(c)}. Move your L onto it to pick it up.`);
}
const isEmpty = (c: number): boolean => occ(S)[c] === 0;
function moveB(i: number, c: number): void
{
	lastB =
	{
		from: S.B[i]!,
		to: c,
	};
	S.B[i] = c;
	endTurn();
}
function commitL(): void
{
	const j = PIDX.get(keyOf(sel));
	sel = [];
	if (j === undefined) msg("Those four squares don't make an L. Swipe again.");
	else if (j === S.L[S.turn]) msg("Your L has to end up somewhere new.");
	else if (S.crack >= 0 && PL[j]!.includes(S.crack)) msg("That tile is cracking: your L has to move off it.");
	else if (legal(S.turn).includes(j))
	{
		lastL =
		{
			p: S.turn,
			j: S.L[S.turn]!,
		};
		lastB = null;
		placeL(S.turn, j);
		S.phase = "B";
	}
	else
		msg(
			PL[j]!.some((c) => !freeFor(c, S.turn))
				? "Your L can only go on empty squares."
				: "Your L can only cover as many blockers, statue squares or L squares as you have hammers, and an L you hit has to stay in one piece.",
		);
}

// After Undo or Redo: nothing picked and nothing marked as just moved.
function afterUndo(): void
{
	sel = [];
	selB = -1;
	lastL = null;
	lastB = null;
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
		const p = S.turn;
		if (S.phase === "L")
		{
			if (!freeFor(c, p)) return;
			drag = true;
			sel = [c];
		}
		else
		{
			const i = S.B.indexOf(c);
			if (i >= 0)
			{
				wasSel = selB === i;
				selB = i;
				drag = true;
			}
			else if (selB >= 0 && isEmpty(c))
			{
				moveB(selB, c);
				return;
			}
		}
		render();
	});
	s.addEventListener("pointermove", (e) =>
	{
		if (!drag || S.phase !== "L") return;
		const c = cellAt(e);
		if (c >= 0 && freeFor(c, S.turn) && !sel.includes(c) && sel.length < PL[S.L[S.turn]!]!.length)
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
			if (sel.length === PL[S.L[S.turn]!]!.length) commitL();
			else sel = [];
			render();
		}
		else if (selB >= 0)
		{
			if (c >= 0 && c !== S.B[selB] && isEmpty(c))
			{
				moveB(selB, c);
				return;
			}
			if (c === S.B[selB] && wasSel) selB = -1;
			render();
		}
	});
	s.addEventListener("pointercancel", () =>
	{
		drag = false;
		if (S.phase === "L")
		{
			sel = [];
			render();
		}
	});
	$("#qskip").addEventListener("click", () =>
	{
		if (myTurn() && S.phase === "B") endTurn();
	});
	$("#qundo").addEventListener("click", () =>
	{
		if (!myTurn()) return;
		const before = JSON.stringify(S);
		S = parseJSON<QState>(snapT);
		redo.undone(before, JSON.stringify(S));
		afterUndo();
	});
	$("#qredo").addEventListener("click", () =>
	{
		if (!myTurn()) return;
		const redone = redo.redo(JSON.stringify(S));
		if (redone === undefined) return;
		S = parseJSON<QState>(redone);
		afterUndo();
	});
	$("#qend").addEventListener("click", () =>
	{
		if (!S.over)
		{
			gid++;
			busy = false;
			S.over = true;
			S.ended = true;
			render();
		}
	});
	$("#qnew").addEventListener("click", newMatch);
	$("#qagain").addEventListener("click", newMatch);
	window.addEventListener(NAMES_RESET, () =>
	{
		qo.names = [];
		qsave();
		seats();
		render();
	});
	const hb = $as("#qham", HTMLInputElement);
	hb.checked = !!qo.hammers;
	hb.addEventListener("change", () =>
	{
		qo.hammers = hb.checked;
		qsave();
		if (!hb.checked && started)
		{
			S.hams = [];
			render();
		}
	});
}

// ---- drawing
const gradients = (prefix: string): string =>
	COLS.map((c, i) =>
	{
		const v = hex2rgb(c),
			lt = v.map((x) => Math.round(x + (255 - x) * 0.22)),
			dk = v.map((x) => Math.round(x * 0.86));
		return `<linearGradient id="${prefix}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${lt.join(",")})"/><stop offset="1" stop-color="rgb(${dk.join(",")})"/></linearGradient>`;
	}).join("");
const oldHammer = (hc: number): boolean => (S.round ?? 0) - (S.hamt?.[hc] ?? S.round ?? 0) >= 4;

function render(): void
{
	if (!started) return;
	setTurn(view.rot);
	const p = S.turn,
		hum = myTurn(),
		now = Date.now();
	if (lastB !== lastBSeen)
	{
		lastBSeen = lastB;
		lastBT = now;
	}
	{
		const fk = `${fresh.join()}@${S.moves}`;
		if (fk !== freshSeen)
		{
			freshSeen = fk;
			freshT = now;
		}
	}
	const AN = (cls: string, t: number, dur: number): string =>
		t && now - t < dur ? ` class="${cls}" style="animation-delay:-${now - t}ms"` : "";
	let s =
		`<defs>${gradients("qg")}` +
		'<linearGradient id="qsf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3ada5"/><stop offset="1" stop-color="#8e8982"/></linearGradient><linearGradient id="qstone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9b4ac"/><stop offset=".5" stop-color="#8f8a83"/><stop offset="1" stop-color="#6f6a64"/></linearGradient><radialGradient id="qN" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#555"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient></defs>';
	s += '<rect x="0" y="0" width="600" height="600" fill="none"/>';
	for (let c = 0; c < NC; c++)
	{
		const [x, y] = xy(c);
		if (S.holes.includes(c))
		{
			s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#140c07"/><rect x="${x + 11}" y="${y + 11}" width="78" height="40" rx="8" fill="#000" opacity=".35"/>`;
			if (justFell?.c === c && now - justFell.t < 900)
				s += `<rect${AN("fall", justFell.t, 900)} x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/>`;
		}
		else if (c === S.crack) s += crackTile(x, y, c, S.stone.includes(c));
		else if (S.stone.includes(c)) s += stoneFloor(x, y, c, justStone?.c === c ? AN("flash", justStone.t, 500) : "");
		else s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/>`;
	}
	if (lastB)
	{
		const [x, y] = xy(lastB.from);
		s += `<circle cx="${x + 50}" cy="${y + 50}" r="22" fill="none" stroke="#8a7357" stroke-width="3" stroke-dasharray="6 6"/>`;
	}
	if (lastL)
		for (const c of PL[lastL.j]!)
		{
			const [x, y] = xy(c);
			s += `<rect x="${x + 16}" y="${y + 16}" width="68" height="68" rx="14" fill="none" stroke="${COLS[lastL.p]}" stroke-width="3" stroke-dasharray="6 6" opacity=".75"/>`;
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
	S.L.forEach((j, q) =>
	{
		const cs = cellsOf(q);
		if (!cs.length) return;
		const sh = shapes(cs),
			lifted = q === p && S.phase === "L" && hum && sel.length > 0;
		if (S.alive[q])
			s += `<g${lifted ? ' opacity=".28"' : ""}><g transform="translate(0,6)" fill="rgba(0,0,0,.3)">${sh}</g><g fill="url(#qg${q})">${sh}</g><g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" transform="translate(0,1.5)">${sh}</g><g fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2">${sh}</g></g>`;
		else s += `<g${fresh.includes(q) ? AN("flash", freshT, 500) : ""}>${statue(cs, j * 4 + q, "")}</g>`;
	});
	S.B.forEach((c, i) =>
	{
		const [x, y] = xy(c),
			drop = justDrop?.c === c && now - justDrop.t < 1000;
		s += `<g${drop ? AN("drop", justDrop!.t, 1000) : lastB?.to === c ? AN("flash", lastBT, 500) : ""}><g transform="translate(0,6)"><circle cx="${x + 50}" cy="${y + 50}" r="24" fill="rgba(0,0,0,.3)"/></g><circle cx="${x + 50}" cy="${y + 50}" r="24" fill="url(#qN)"/><g transform="translate(-7,-8)" data-sx="-7" data-sy="-8"><circle cx="${x + 50}" cy="${y + 50}" r="7" fill="rgba(255,255,255,.14)"/></g></g>`;
		if (hum && S.phase === "B" && selB === i)
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="32" fill="none" stroke="#fff" stroke-width="10"/><circle cx="${x + 50}" cy="${y + 50}" r="32" fill="none" stroke="#2b1d14" stroke-width="5"/>`;
	});
	if (hum && S.phase === "B" && selB >= 0)
	{
		const o = occ(S);
		for (let c = 0; c < NC; c++)
			if (!o[c])
			{
				const [x, y] = xy(c);
				s += `<circle cx="${x + 50}" cy="${y + 50}" r="9" fill="#2b1d14" stroke="#fff" stroke-width="3" opacity=".85"/>`;
			}
	}
	for (const c of sel)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 14}" y="${y + 14}" width="72" height="72" rx="14" fill="${COLS[p]}" fill-opacity=".35" stroke="${COLS[p]}" stroke-width="4" stroke-dasharray="10 6"/>`;
	}
	if (!S.over && S.phase === "L" && !busy)
		s += `<path d="${LPATH(PL[S.L[p]!]!.map(D), N, 100, 4, 21, 10)}" fill="none" stroke="${COLS[p]}" stroke-width="4" opacity=".9"/>`;
	const crackUnder =
		S.crack >= 0 &&
		occ(
			{
				L: S.L,
				B: S.B,
				holes: S.holes,
				crack: -1,
			},
		)[S.crack];
	if (crackUnder)
	{
		const [x, y] = xy(S.crack);
		s += `<g class="quake" pointer-events="none"><rect x="${x + 8}" y="${y + 8}" width="84" height="84" rx="14" fill="rgba(209,59,48,.18)" stroke="#d13b30" stroke-width="4" stroke-dasharray="10 6"/><path d="M${x + 30} ${y + 28}l14 16l-6 12l16 8l8 14M${x + 44} ${y + 44}l16-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/><path d="M${x + 30} ${y + 28}l14 16l-6 12l16 8l8 14M${x + 44} ${y + 44}l16-10" stroke="#5a1d17" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`;
	}
	for (const q of crowned()) s += crown(PL[S.L[q]!]!);
	const board = svg();
	if (view.is3d)
	{
		const o: IsoBoard =
		{
			N,
			pieces: [],
			discs: [],
			tiles: [],
			dots: [],
			rings: [],
			over: [],
			crowns: crowned().map((q) => PL[S.L[q]!]!),
			holes: S.holes,
			stone: S.stone,
			crack: S.crack,
			falling: justFell && now - justFell.t < 900 ? justFell.c : -1,
			fallAge: justFell ? now - justFell.t : 0,
		};
		S.L.forEach((_j, q) =>
		{
			const cs = cellsOf(q);
			if (cs.length)
				o.pieces.push(
					{
						cells: cs,
						color: COLS[q]!,
						stone: !S.alive[q],
						ghost: q === p && S.phase === "L" && hum && sel.length > 0,
						flash: fresh.includes(q) && now - freshT < 500,
						age: now - freshT,
						q,
					},
				);
		});
		S.B.forEach((c, i) =>
		{
			const dropping = justDrop?.c === c && now - justDrop.t < 1000;
			o.discs.push(
				{
					c,
					ring: hum && S.phase === "B" && selB === i ? "#2b1d14" : null,
					flash: lastB?.to === c && now - lastBT < 500,
					drop: dropping,
					age: dropping ? now - justDrop!.t : now - lastBT,
				},
			);
		});
		if (lastL)
			for (const c of PL[lastL.j]!)
				o.tiles.push(
					{
						c,
						stroke: COLS[lastL.p]!,
						dash: 1,
						sw: 3,
						op: 0.75,
					},
				);
		if (lastB)
			o.rings.push(
				{
					c: lastB.from,
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
		if (crackUnder)
			o.over.push(
				{
					c: S.crack,
					fill: "rgba(209,59,48,.25)",
					stroke: "#d13b30",
					dash: 1,
					sw: 4,
				},
			);
		{
			const mp = o.pieces.find((x) => x.q === p);
			if (!S.over && S.phase === "L" && !busy && !sel.length && mp) mp.hl = true;
		}
		o.rot = view.rot;
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
		board.style.aspectRatio = "";
		board.setAttribute("viewBox", "0 0 600 600");
		board.innerHTML = s;
	}
	setTurn(0);
	oddsQ();
	renderPanel(p, hum);
}

function renderPanel(p: number, hum: boolean): void
{
	const W = winners();
	$("#qchip").style.background = S.over ? (W.length ? COLS[W[0]!]! : "#8f8a83") : COLS[p]!;
	$("#qstatus").textContent = S.over
		? TEAM && W.length
			? `${W[0]! % 2 ? "T" : "L"} team wins`
			: W.length === 1
				? `${nm(W[0]!)} wins: last L standing`
				: W.length
					? `${W.map(nm).join(" and ")} share the win`
					: "Match ended early"
		: busy
			? `${nm(p)} (computer) is moving`
			: S.phase === "L"
				? `${nm(p)}: move your ${PL[S.L[p]!]!.length < 4 ? "piece" : SH[S.L[p]!] === 5 || PIECE === "T" ? "T" : "L"}`
				: `${nm(p)}: move a blocker (optional)`;
	const hh = S.hh?.[p] ?? 0;
	if (!$("#qinstr").classList.contains("err"))
		$("#qinstr").textContent = S.over
			? "Match over."
			: busy
				? "Thinking…"
				: S.phase === "L"
					? (hh > 0
							? `You have ${hh} hammer${hh === 1 ? "" : "s"}: your L may cover up to ${hh} blocker${hh === 1 ? "" : "s"}, statue square${hh === 1 ? "" : "s"} or square${hh === 1 ? "" : "s"} of other L's, breaking each one. `
							: "") +
						`${PL[S.L[p]!]!.length === 1 ? "Tap an empty square" : `Swipe across ${["", "", "two", "three", "four"][PL[S.L[p]!]!.length]} squares`} in one stroke to set your L down somewhere new. Statues and other L's are in the way.`
					: "Tap a black blocker, then an empty square. Or end your turn.";
	{
		const nw = $("#qnews");
		nw.hidden = !S.news;
		nw.textContent = S.news;
		const left = COLLAPSE_AT - S.moves;
		$("#qfloor").innerHTML = S.over
			? `${S.holes.length} tile${S.holes.length === 1 ? "" : "s"} fell this match.`
			: left > 0
				? `Turn ${S.moves + 1}. The floor starts collapsing in <b>${left}</b> turn${left === 1 ? "" : "s"}.`
				: `<b>The floor is collapsing.</b> ${S.holes.length} tile${S.holes.length === 1 ? "" : "s"} gone${S.crack >= 0 ? `; ${sqN(S.crack)} (red) falls after this turn` : ""}.`;
	}
	{
		const c = code(rotQ(parseJSON<QState>(snapT), view.rot));
		$("#qcodeNow").textContent = c === "—" ? "None: a hammer has broken a piece" : qFmt(c);
		$("#qcodeNow").dataset["c"] = c;
	}
	$as("#qskip", HTMLButtonElement).disabled = !(hum && S.phase === "B");
	$as("#qundo", HTMLButtonElement).disabled = !hum || (S.phase === "L" && !sel.length);
	$as("#qredo", HTMLButtonElement).disabled = !hum || !redo.can(JSON.stringify(S));
	$as("#qend", HTMLButtonElement).disabled = S.over;
	const MOB = ((): number[] =>
	{
		const o = occ(S);
		return [0, 1, 2, 3].map((q) => (S.alive[q] ? mob(o, S, q) : 0));
	})();
	{
		const hs = [0, 1, 2, 3].filter((q) => S.alive[q] && human(q) && MOB[q]! <= 5 && !S.over);
		const wn = $("#qwarn");
		wn.hidden = !hs.length;
		if (hs.length)
			wn.innerHTML = hs
				.map(
					(q) =>
						`<b>${nm(q)}</b>: only ${MOB[q]} place${MOB[q] === 1 ? "" : "s"} left for your L. ${MOB[q]! <= 2 ? "Two-thirds of L's this boxed in are gone within a round: get to open space now." : "Find a move that opens more space."}`,
				)
				.join("<br>");
	}
	const cr = crowned();
	$("#qscore").innerHTML = standings()
		.map(
			(q) =>
				`<div class="qrow${q === p && !S.over ? " now" : ""}${S.alive[q] ? "" : " dead"}"><i class="qch" style="background:${S.alive[q] ? COLS[q] : "#8f8a83"};border-color:${COLS[q]}"></i><span class="qn">${nm(q)}${TEAM ? ` <small>${q % 2 ? "T" : "L"} team</small>` : ""}${qo.seats[q] === "c" ? " <small>computer</small>" : ""}${qo.hammers || S.hc?.[q] ? HB(S.hc?.[q] ?? 0, S.hh?.[q] ?? 0) : ""}</span><span class="qs">${S.alive[q] ? `${q === p && !S.over ? "to move · " : ""}<b class="mv mv${MOB[q]! <= 2 ? "r" : MOB[q]! <= 5 ? "o" : "g"}" title="Places this L can move to right now">${MOB[q]} place${MOB[q] === 1 ? "" : "s"}</b>` : "statue"}</span><b>${cr.includes(q) ? crownMini : ""}${S.pts[q]}</b></div>`,
		)
		.join("");
	const res = $("#qres");
	res.classList.toggle("on", S.over);
	if (S.over)
	{
		const st = standings();
		const w0 = W[0]!;
		const head =
			TEAM && W.length
				? `<b>The ${w0 % 2 ? "T" : "L"} team wins</b> (${W.map(nm).join(" and ")}): the other team is out of moves.`
				: W.length === 1
					? `<b>${nm(w0)} wins</b> as the last L standing, with ${S.pts[w0]} checkmate${S.pts[w0] === 1 ? "" : "s"}${cr.includes(w0) ? " and the crown" : ""}.`
					: W.length
						? `<b>${W.map(nm).join(" and ")} share the win</b>: their L's turned to stone at the same moment.`
						: `<b>Match ended early.</b> Nobody wins; ${aliveList().length} L's were still in play.`;
		res.innerHTML = `${head}<div class="qfinal">${st.map((q, i) => `<span>${i + 1}. ${nm(q)}: ${S.pts[q]} checkmate${S.pts[q] === 1 ? "" : "s"}${S.hc?.[q] ? `, ${S.hc[q]} hammer${S.hc[q] === 1 ? "" : "s"}` : ""}${S.alive[q] ? "" : " (statue)"}</span>`).join("")}</div><div class="row" style="justify-content:center;margin-top:8px"><button class="main" id="qagain2">Play again</button></div>`;
		$("#qagain2").addEventListener("click", newMatch);
	}
}

// ---- setup
function seats(): void
{
	$("#qseats").innerHTML = [0, 1, 2, 3]
		.map(
			(p) =>
				`<div class="qseat"><i class="qch" style="background:${COLS[p]};border-color:${COLS[p]}"></i><input class="pname" data-p="${p}" value="${nm(p) === DEFN[p] && !qo.names[p] ? "" : nm(p)}" placeholder="${DEFN[p]}" aria-label="Player ${p + 1} name"><select data-p="${p}" aria-label="Player ${p + 1} is"><option value="h"${qo.seats[p] === "h" ? " selected" : ""}>Human</option><option value="c"${qo.seats[p] === "c" ? " selected" : ""}>Computer</option></select></div><div class="crow qsl" data-p="${p}">${["R", "G", "B"].map((L, k) => `<label>${L} <input type="range" min="0" max="255" data-c="${k}" value="${hex2rgb(COLS[p]!)[k]}" aria-label="Player ${p + 1} ${L === "R" ? "red" : L === "G" ? "green" : "blue"}"><output>${hex2rgb(COLS[p]!)[k]}</output></label>`).join("")}</div>`,
		)
		.join("");
	$$as("#qseats input.pname", HTMLInputElement).forEach((i) =>
	{
		i.addEventListener("input", () =>
		{
			qo.names[Number(i.dataset["p"])] = i.value;
			qsave();
			render();
			qsum();
		});
	});
	$$as("#qseats .qsl input", HTMLInputElement).forEach((sl) =>
	{
		sl.addEventListener("input", () =>
		{
			const row = sl.closest<HTMLElement>(".qsl")!,
				p = Number(row.dataset["p"]),
				rgb = hex2rgb(COLS[p]!);
			rgb[Number(sl.dataset["c"])] = Number(sl.value);
			if (sl.nextElementSibling instanceof HTMLOutputElement) sl.nextElementSibling.value = sl.value;
			COLS[p] = rgb2hex(rgb);
			if (TEAM)
			{
				COLS[(p + 2) % 4] = COLS[p]!;
				qo.tcols = [COLS[0]!, COLS[1]!];
			}
			else qo.cols = [...COLS];
			qsave();
			drawWeak(COLS);
			const ch = row.previousElementSibling?.querySelector<HTMLElement>(".qch");
			if (ch)
			{
				ch.style.background = COLS[p]!;
				ch.style.borderColor = COLS[p]!;
			}
			render();
			qsum();
			drawTraps(COLS, nm);
		});
	});
	$$as("#qseats select", HTMLSelectElement).forEach((s) =>
	{
		s.addEventListener("change", () =>
		{
			qo.seats[Number(s.dataset["p"])] = s.value;
			qsave();
			qsum();
			newMatch();
		});
	});
	$$as("input[name=qlevel]", HTMLInputElement).forEach((r) =>
	{
		r.checked = r.value === qo.level;
	});
	qsum();
}
function qsum(): void
{
	$("#qsumTxt").textContent = [0, 1, 2, 3].map(nm).join(", ");
	$("#qsumSub").textContent =
		`${qo.seats.filter((s) => s === "h").length} human, ${qo.seats.filter((s) => s === "c").length} computer. Tap to change.`;
	$("#qchips").innerHTML = COLS.map((c) => `<i style="background:${c}"></i>`).join("");
}

function load(): void
{
	try
	{
		Object.assign(qo, parseJSON<Partial<BattleOptions>>(getItem("lgame-q") ?? "{}"));
	}
	catch
	{
		// Unreadable settings leave the defaults.
	}
	// colours still at the old defaults move to the new ones
	const OLD = ["#e0463a", "#2f6be0", "#e8a317", "#8b5cf6"];
	if (Array.isArray(qo.cols))
		qo.cols.forEach((c, i) =>
		{
			if (i < 4 && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== OLD[i]) COLS[i] = c;
		});
	if (PIECE === "LT")
	{
		const tc = qo.tcols ?? ["#e0463a", "#2f6be0"];
		COLS[0] = tc[0]!;
		COLS[2] = tc[0]!;
		COLS[1] = tc[1]!;
		COLS[3] = tc[1]!;
	}
}

export function initBattle(): void
{
	load();
	wireInput();
	// a tile that just fell, or a blocker that just dropped, finishes its animation on a redraw
	window.setInterval(() =>
	{
		const now = Date.now();
		if (
			(justFell && now - justFell.t > 900 && now - justFell.t < 1300) ||
			(justDrop && now - justDrop.t > 1000 && now - justDrop.t < 1400)
		)
			render();
	}, 200);
	window.addEventListener(VIEW_CHANGED, render);
	$$as("input[name=qlevel]", HTMLInputElement).forEach((r) =>
	{
		r.addEventListener("change", () =>
		{
			qo.level = r.value;
			qsave();
		});
	});
	drawTraps(COLS, nm);
	$("#qcolReset").addEventListener("click", () =>
	{
		DEFCOLS.forEach((c, i) =>
		{
			COLS[i] = c;
		});
		qo.cols = [...COLS];
		qsave();
		seats();
		render();
		drawTraps(COLS, nm);
	});
	$("#qload").addEventListener("submit", (e) =>
	{
		e.preventDefault();
		loadCode($as("#qcodeIn", HTMLInputElement).value);
	});
	$("#qcopy").addEventListener("click", () =>
	{
		const m = $("#qcodeMsg");
		m.classList.remove("bad");
		copyCode($("#qcodeNow").dataset["c"]!, $("#qcodeNow"), m);
	});
	drawGuide(
		qCode(
			{
				L: [...START_L],
				alive: [1, 1, 1, 1],
				pts: [0, 0, 0, 0],
				B: [...CORN],
				turn: 0,
			},
			(q) => PL[START_L[q]!]!,
		),
	);
	drawWeak(COLS);
	seats();
}
