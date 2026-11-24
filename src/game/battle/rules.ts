import {GENPL, keyOf} from "../geometry.ts";
import {L_SHAPE, PIECE, T_SHAPE} from "../piece.ts";

// The 4-player battle on the 6 by 6 board: its placements, its state, and its position codes.

export const N = 6,
	NC = 36,
	COLLAPSE_AT = 10;
export const CORN = [0, 5, 30, 35];
// L vs T with 4 players: two teams. Seats 1 and 3 have L's, seats 2 and 4 have T's; teammates share a color and can't
// hurt each other
export const TEAM = PIECE === "LT";
export const mate = (a: number, b: number): boolean => TEAM && a % 2 === b % 2;
// every placement of an L on the 6x6 board
export const {PL, PIDX, SH, BY} = GENPL(N, PIECE === "T" ? T_SHAPE : L_SHAPE, PIECE === "LT" ? [T_SHAPE] : []);
const place = (cs: number[]): number => PIDX.get(keyOf(cs))!;
const rc = (r: number, c: number): number => r * N + c;
// pinwheel opening: the four L's tile the centre 4x4, each a quarter turn of the last
export const START_L = (
	PIECE === "T"
		? [
				[rc(1, 1), rc(2, 1), rc(3, 1), rc(2, 0)],
				[rc(1, 4), rc(1, 3), rc(1, 2), rc(0, 3)],
				[rc(4, 4), rc(3, 4), rc(2, 4), rc(3, 5)],
				[rc(4, 1), rc(4, 2), rc(4, 3), rc(5, 2)],
			]
		: TEAM
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

export interface QState
{
	L: number[];
	alive: number[];
	pts: number[];
	B: number[];
	turn: number;
	phase: "L" | "B";
	over: boolean;
	ended?: boolean;
	dead: number[];
	dt?: number[];
	moves: number;
	holes: number[];
	stone: number[];
	// A statue's own squares, so stone floor under it never changes its shape.
	sc?: (number[] | null)[];
	crack: number;
	pending?: number[];
	news: string;
	hams?: number[];
	hammer?: number;
	// Hammers in hand, and picked up this match.
	hh?: number[];
	hc?: number[];
	hnews?: string;
	// The round each hammer on the board appeared in.
	hamt?: Record<number, number>;
	round?: number;
	newRound?: boolean;
	// The move each player dropped to 2 or fewer places, for the Fair computer's grace round.
	low?: (number | null)[];
	ko?: number;
	// A hammer breaking, and when.
	hbk?:
	{
		c: number;
		t: number;
	};
}

// A state the rules look at, where any missing part comes from the match in play.
export type QPart = Partial<QState> &
{
	L: number[];
};

const COLL = "ABCDEF",
	DR6 = [
		[-1, 0],
		[0, 1],
		[1, 0],
		[0, -1],
	];
export const ARMW = ["up", "right", "down", "left"];
export const sqN = (c: number): string => COLL[c % N]! + (Math.floor(c / N) + 1);

function lCells6(c: number, dg: number, sh = PIECE === "T" ? 1 : 0): number[] | null
{
	if (sh === 1)
	{
		if (dg < 1 || dg > 4) return null;
		const a = dg - 1,
			r = Math.floor(c / N),
			k = c % N,
			out = [c];
		for (const d of [a, (a + 1) % 4, (a + 3) % 4])
		{
			const rr = r + DR6[d]![0]!,
				kk = k + DR6[d]![1]!;
			if (rr < 0 || rr >= N || kk < 0 || kk >= N) return null;
			out.push(rr * N + kk);
		}
		return out;
	}
	const a = (dg - 1) >> 1,
		f = (dg - 1) % 2 === 0 ? (a + 1) % 4 : (a + 3) % 4,
		r = Math.floor(c / N),
		k = c % N,
		out = [c];
	for (const [d, n] of [
		[a, 1],
		[a, 2],
		[f, 1],
	] as const)
	{
		const rr = r + DR6[d]![0]! * n,
			kk = k + DR6[d]![1]! * n;
		if (rr < 0 || rr >= N || kk < 0 || kk >= N) return null;
		out.push(rr * N + kk);
	}
	return out;
}

export function encL6(j: number): string
{
	const k = keyOf(PL[j]!),
		sh = PIECE === "T" || SH[j] === 5 ? 1 : 0;
	for (const c of PL[j]!)
		for (let dg = 1; dg <= (sh ? 4 : 8); dg++)
		{
			const x = lCells6(c, dg, sh);
			if (x && keyOf(x) === k) return sqN(c) + dg;
		}
	return "???";
}

// A position's code: whose turn, each piece (lowercase for a statue), the blockers, then any holes, stone floor, statue
// squares on stone, and scores. Chipped pieces have no code.
export function qCode(
	T: Pick<QState, "L" | "alive" | "B" | "turn" | "pts"> & Partial<QState>,
	cellsOf: (q: number) => number[],
): string
{
	if (T.L.some((j) => PL[j]!.length < 4)) return "—";
	let s = String(T.turn + 1);
	T.L.forEach((j, q) =>
	{
		const e = encL6(j);
		s += T.alive[q] ? e : e[0]!.toLowerCase() + e.slice(1);
	});
	s += T.B.map(sqN).toSorted().join("");
	if (T.holes?.length) s += `/${T.holes.map(sqN).toSorted().join("")}`;
	if (T.stone?.length) s += `~${T.stone.map(sqN).toSorted().join("")}`;
	{
		const on: number[] = [];
		T.L.forEach((_j, q) =>
		{
			if (!T.alive[q]) for (const c of cellsOf(q)) if ((T.stone ?? []).includes(c)) on.push(c);
		});
		if (on.length) s += `^${on.map(sqN).toSorted().join("")}`;
	}
	if (T.pts.some((x) => x)) s += `+${T.pts.map((x) => Math.min(9, x)).join("")}`;
	return s;
}

const pairs = (x: string): string => x.slice(1).match(/../g)!.join(" ");
export function qFmt(c: string): string
{
	const m = c.match(
		/^(\d)(...)(...)(...)(...)(.{8})(\/(?:[A-F][1-6])+)?(~(?:[A-F][1-6])+)?(\^(?:[A-F][1-6])+)?(\+\d{4})?$/,
	);
	if (!m) return c;
	return [
		m[1],
		m[2],
		m[3],
		m[4],
		m[5],
		m[6]!.match(/../g)!.join(" "),
		m[7] ? `/ ${pairs(m[7])}` : "",
		m[8] ? `~ ${pairs(m[8])}` : "",
		m[9] ? `^ ${pairs(m[9])}` : "",
		m[10] ?? "",
	]
		.filter(Boolean)
		.join(" ");
}

export function qParse(str: string):
	|
	  {
			S: QState;
			err?: undefined;
	  }
	|
	  {
			err: string;
			S?: undefined;
	  }
{
	const s = (str || "").replace(/[\s·\-_,]/g, "");
	let i = 0;
	const fail = (
		want: string,
	):
	{
		err: string;
	} => (
	{
		err:
			i >= s.length
				? `The code ended early: expected ${want} at character ${i + 1}.`
				: `Character ${i + 1} ("${s[i]}") should be ${want}.`,
	});
	const at = (): string => s[i] ?? "";
	if (!/^[1-4]$/.test(at())) return fail("whose turn it is, 1 to 4");
	const turn = Number(s[i++]) - 1;
	const L: number[] = [],
		alive: number[] = [];
	for (let q = 0; q < 4; q++)
	{
		if (!/^[A-Fa-f]$/.test(at())) return fail(`a column letter A to F for player ${q + 1}'s L`);
		const st = s[i] === s[i]!.toLowerCase(),
			col = COLL.indexOf(s[i++]!.toUpperCase());
		if (!/^[1-6]$/.test(at())) return fail(`a row number 1 to 6 for player ${q + 1}'s L`);
		const row = Number(s[i++]) - 1;
		const shq = PIECE === "T" || (TEAM && q % 2) ? 1 : 0;
		if (!(shq ? /^[1-4]$/ : /^[1-8]$/).test(at()))
			return fail(`a direction digit 1 to ${shq ? 4 : 8} for player ${q + 1}'s ${shq ? "T" : "L"}`);
		const dg = Number(s[i++]),
			c = row * N + col,
			cs = lCells6(c, dg, shq);
		if (!cs)
			return {
				err: shq
					? `Player ${q + 1}'s T (${COLL[col]}${row + 1}${dg}) runs off the board: centered on ${COLL[col]}${row + 1}, its stem points ${ARMW[dg - 1]}.`
					: `Player ${q + 1}'s L (${COLL[col]}${row + 1}${dg}) runs off the board: from ${COLL[col]}${row + 1} the arm goes ${ARMW[(dg - 1) >> 1]}.`,
			};
		L.push(PIDX.get(keyOf(cs))!);
		alive.push(st ? 0 : 1);
	}
	const B: number[] = [];
	for (let b = 0; b < 4; b++)
	{
		if (!/^[A-Fa-f]$/.test(at())) return fail(`a column letter A to F for blocker ${b + 1}`);
		const col = COLL.indexOf(s[i++]!.toUpperCase());
		if (!/^[1-6]$/.test(at())) return fail(`a row number 1 to 6 for blocker ${b + 1}`);
		B.push((Number(s[i++]) - 1) * N + col);
	}
	// One square of a list after / ~ or ^, or an error.
	const square = (
		what: string,
	):
		| number
		|
		  {
				err: string;
		  } =>
	{
		if (!/^[A-Fa-f]$/.test(at())) return fail(`a column letter A to F for ${what}`);
		const col = COLL.indexOf(s[i++]!.toUpperCase());
		if (!/^[1-6]$/.test(at())) return fail(`a row number 1 to 6 for ${what}`);
		return (Number(s[i++]) - 1) * N + col;
	};
	const holes: number[] = [],
		stone: number[] = [];
	if (s[i] === "/")
	{
		i++;
		while (i < s.length && s[i] !== "+" && s[i] !== "~" && s[i] !== "^")
		{
			const c = square("a hole");
			if (typeof c !== "number") return c;
			if (holes.includes(c))
				return {
					err: `The hole ${sqN(c)} is listed twice.`,
				};
			holes.push(c);
		}
	}
	if (s[i] === "~")
	{
		i++;
		while (i < s.length && s[i] !== "+" && s[i] !== "^")
		{
			const c = square("a stone floor square");
			if (typeof c !== "number") return c;
			if (holes.includes(c))
				return {
					err: `${sqN(c)} can't be both a hole and stone floor.`,
				};
			if (!stone.includes(c)) stone.push(c);
		}
	}
	const onSt: number[] = [];
	if (s[i] === "^")
	{
		i++;
		while (i < s.length && s[i] !== "+")
		{
			const c = square("a statue square on stone");
			if (typeof c !== "number") return c;
			if (!stone.includes(c))
				return {
					err: `${sqN(c)} is listed after ^ (a statue standing on stone floor) but isn't stone floor.`,
				};
			onSt.push(c);
		}
	}
	let pts = [0, 0, 0, 0];
	if (i < s.length)
	{
		if (s[i] !== "+" || !/^\+\d{4}$/.test(s.slice(i)))
			return {
				err: "After the blockers, only an optional / with holes, an optional ~ with stone floor, an optional ^ with statue squares standing on stone and an optional + with four score digits can follow.",
			};
		pts = s
			.slice(i + 1)
			.split("")
			.map(Number);
	}
	const o = new Uint8Array(NC),
		sc: (number[] | null)[] = [null, null, null, null];
	for (let q = 0; q < 4; q++)
	{
		if (alive[q])
			for (const c of PL[L[q]!]!)
				if (holes.includes(c))
					return {
						err: `Player ${q + 1}'s L sits on the hole ${sqN(c)}. Only statues can hang over holes.`,
					};
		const mine = PL[L[q]!]!.filter(
			(c) => !!alive[q] || (!holes.includes(c) && (!stone.includes(c) || onSt.includes(c))),
		);
		if (!alive[q]) sc[q] = mine;
		for (const c of mine)
		{
			if (o[c])
				return {
					err: `Player ${q + 1}'s ${alive[q] ? "L" : "statue"} overlaps another piece.`,
				};
			o[c] = 1;
		}
	}
	for (const b of B)
	{
		if (o[b] === 1)
			return {
				err: `The blocker on ${sqN(b)} sits on an L.`,
			};
		if (o[b] === 2)
			return {
				err: `Two blockers share ${sqN(b)}.`,
			};
		o[b] = 2;
	}
	for (const c of holes)
		if (o[c] === 2)
			return {
				err: `The hole ${sqN(c)} has a blocker on it.`,
			};
	if (!alive[turn])
		return {
			err: `It can't be player ${turn + 1}'s turn: their L is a statue (lowercase letter).`,
		};
	if (alive.filter(Boolean).length < 2)
		return {
			err: "At least two L's must still be in play (uppercase letters).",
		};
	return {
		S:
		{
			L,
			alive,
			pts,
			B,
			turn,
			phase: "L",
			over: false,
			dead: [0, 1, 2, 3].filter((q) => !alive[q]),
			moves: holes.length ? COLLAPSE_AT : 0,
			holes,
			stone,
			sc,
			crack: -1,
			news: "",
		},
	};
}
