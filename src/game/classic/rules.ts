import {DMAP} from "../geometry.ts";
import {L_SHAPE, type Piece, T_SHAPE} from "../piece.ts";

// The 2-player game on the 4 by 4 board: piece placements as 16-bit masks, positions and position codes. Everything
// here depends only on which piece is played, so the tests build all three games side by side.

export type Side = "R" | "B";

export interface Position
{
	// Each player's placement, an index into the board's placements.
	L: Record<Side, number>;
	// The two disc squares. The T game has one disc, and the second slot holds the phantom square 16.
	N: number[];
	turn: Side;
	// Moving the piece, then (optionally) a disc.
	phase: "L" | "N";
	// The winner, once the game is over.
	over: Side | null;
	// The first-match lesson.
	tut?: boolean;
}

// A move: the new placement j, then the disc ni (-1 for none) moved to square to, landing in solver state s.
export interface Move
{
	j: number;
	ni: number;
	to?: number;
	s: number;
}

export type Parsed =
	|
	  {
			code: string;
			P: Position;
			err?: undefined;
	  }
	|
	  {
			err: string;
			P?: undefined;
			code?: undefined;
	  };

export const other = (t: Side): Side => (t === "R" ? "B" : "R");
export const bit = (i: number): number => 1 << i;
export const cells = (a: number[]): number => a.reduce((m, c) => m | bit(c), 0);
export const SQ = "ABCDEFGHIJKLMNOP";
export const ARM = ["up", "right", "down", "left"];
const DR = [
	[-1, 0],
	[0, 1],
	[1, 0],
	[0, -1],
];
// The phantom square that holds the T game's missing second disc.
export const PH = 16;
export const fmtCode = (c: string): string => `${c.slice(0, 2)} ${c.slice(2, 4)} ${c.slice(4)}`;
// The square that a quarter turn of the board k times clockwise moves c to (the phantom stays put).
const rotMask = (m: number, k: number): number =>
{
	let o = 0;
	for (let c = 0; c < 16; c++) if (m & bit(c)) o |= bit(DMAP(c, 4, k));
	return o;
};

// The index of an unordered pair of disc squares (0 to 16).
const pair = (x: number, y: number): number => (x < y ? x * 17 + y : y * 17 + x);

export type Board = ReturnType<typeof createBoard>;

export function createBoard(piece: Piece)
{
	// L vs T: the L's placements come first, then the T's; SHP says which piece a placement belongs to (0 L, 1 T)
	const LS: number[] = [],
		LIDX = new Map<number, number>(),
		SHP: number[] = [],
		LT = piece === "LT",
		ONE = piece === "T";
	const shapes: [number, [number, number][]][] = LT
		? [
				[0, L_SHAPE],
				[1, T_SHAPE],
			]
		: [[ONE ? 1 : 0, ONE ? T_SHAPE : L_SHAPE]];
	const tf = [
		(p: number[]): number[] => [p[0]!, p[1]!],
		(p: number[]): number[] => [p[1]!, -p[0]!],
		(p: number[]): number[] => [-p[0]!, -p[1]!],
		(p: number[]): number[] => [-p[1]!, p[0]!],
	];
	for (const [sh, base] of shapes)
		for (const mir of [0, 1])
			for (const t of tf)
			{
				let pts = base.map((p) => t(mir ? [p[0], -p[1]] : p));
				const mr = Math.min(...pts.map((p) => p[0]!)),
					mc = Math.min(...pts.map((p) => p[1]!));
				pts = pts.map((p) => [p[0]! - mr, p[1]! - mc]);
				const h = Math.max(...pts.map((p) => p[0]!)),
					w = Math.max(...pts.map((p) => p[1]!));
				for (let dr = 0; dr + h < 4; dr++)
					for (let dc = 0; dc + w < 4; dc++)
					{
						let m = 0;
						for (const p of pts) m |= bit((p[0]! + dr) * 4 + p[1]! + dc);
						if (!LIDX.has(m))
						{
							LIDX.set(m, LS.length);
							LS.push(m);
							SHP.push(sh);
						}
					}
			}
	// the T game uses one disc: the second disc slot holds a phantom (square 16) that is never drawn and never moves
	const BSL = [...Array(16).keys()].map((a) => (ONE ? [PH] : [...Array(15 - a).keys()].map((i) => a + 1 + i)));
	const NL = LS.length,
		key = (m: number, o: number, a: number, b: number): number => (m * NL + o) * 289 + pair(a, b);
	// The solver's state number for each key, or -1; the solver fills it in.
	const sid = new Int32Array(NL * NL * 289).fill(-1);
	const START: Position = LT
		?
			{
				L:
				{
					R: LIDX.get(cells([11, 13, 14, 15]))!,
					B: LIDX.get(cells([4, 5, 6, 9]))!,
				},
				N: [3, 12],
				turn: "R",
				phase: "L",
				over: null,
			}
		: ONE
			?
				{
					L:
					{
						R: LIDX.get(cells([0, 1, 2, 5]))!,
						B: LIDX.get(cells([9, 10, 11, 14]))!,
					},
					N: [15, PH],
					turn: "R",
					phase: "L",
					over: null,
				}
			:
				{
					L:
					{
						R: LIDX.get(cells([1, 2, 6, 10]))!,
						B: LIDX.get(cells([5, 9, 13, 14]))!,
					},
					N: [0, 15],
					turn: "R",
					phase: "L",
					over: null,
				};
	const STD = LT ? "P7F3DM" : ONE ? "B3K3P1" : "C5N1AP";
	// The squares of a piece from its code: an L's corner c and direction dg (1 to 8), or a T's middle c and the
	// direction its stem points (1 to 4). Null when it runs off the board.
	function lCells(c: number, dg: number, sh = ONE ? 1 : 0): number[] | null
	{
		if (sh === 1)
		{
			if (dg < 1 || dg > 4) return null;
			const a = dg - 1,
				r = c >> 2,
				k = c & 3,
				out = [c];
			for (const d of [a, (a + 1) % 4, (a + 3) % 4])
			{
				const rr = r + DR[d]![0]!,
					kk = k + DR[d]![1]!;
				if (rr < 0 || rr > 3 || kk < 0 || kk > 3) return null;
				out.push(rr * 4 + kk);
			}
			return out;
		}
		const a = (dg - 1) >> 1,
			f = (dg - 1) % 2 === 0 ? (a + 1) % 4 : (a + 3) % 4,
			r = c >> 2,
			k = c & 3,
			out = [c];
		for (const [d, n] of [
			[a, 1],
			[a, 2],
			[f, 1],
		] as const)
		{
			const rr = r + DR[d]![0]! * n,
				kk = k + DR[d]![1]! * n;
			if (rr < 0 || rr > 3 || kk < 0 || kk > 3) return null;
			out.push(rr * 4 + kk);
		}
		return out;
	}
	function encL(m: number): string
	{
		const sh = SHP[LIDX.get(m)!] ?? 0;
		for (let c = 0; c < 16; c++)
			if (m & bit(c))
				for (let dg = 1; dg <= (sh ? 4 : 8); dg++)
				{
					const cs = lCells(c, dg, sh);
					if (cs && cells(cs) === m) return SQ[c]! + dg;
				}
		return "??";
	}
	function posCode(
		P: Pick<Position, "L" | "N"> &
		{
			turn?: Side;
		},
		t?: Side,
	): string
	{
		const a = Math.min(...P.N),
			b = Math.max(...P.N),
			turn = t ?? P.turn;
		if (ONE) return encL(LS[P.L.R]!) + encL(LS[P.L.B]!) + SQ[a]! + (turn === "R" ? "1" : "2");
		return encL(LS[P.L.R]!) + encL(LS[P.L.B]!) + (turn === "R" ? SQ[a]! + SQ[b]! : SQ[b]! + SQ[a]!);
	}
	function parseCode(input: string | undefined): Parsed
	{
		const s = (input ?? "").replace(/[\s-]/g, "").toUpperCase();
		if (s.length !== 6)
			return {
				err: `A code is exactly 6 characters; this has ${s.length}.`,
			};
		const SH2 = LT ? [0, 1] : ONE ? [1, 1] : [0, 0],
			D2 = SH2.map((x) => (x ? "4" : "8")),
			want = [
				"a letter A to P",
				`a digit 1 to ${D2[0]}`,
				"a letter A to P",
				`a digit 1 to ${D2[1]}`,
				"a letter A to P",
				"a letter A to P",
			],
			re = [
				/[A-P]/,
				new RegExp(`[1-${D2[0]}]`),
				/[A-P]/,
				new RegExp(`[1-${D2[1]}]`),
				/[A-P]/,
				ONE ? /[12]/ : /[A-P]/,
			];
		if (ONE) want[5] = "1 or 2 for whose turn it is";
		for (let i = 0; i < 6; i++)
			if (!re[i]!.test(s[i]!))
				return {
					err: `Character ${i + 1} ("${s[i]}") should be ${want[i]}.`,
				};
		const who = ["the first player", "the second player"],
			ls: number[] = [];
		for (let i = 0; i < 2; i++)
		{
			const c = SQ.indexOf(s[i * 2]!),
				dg = Number(s[i * 2 + 1]),
				cs = lCells(c, dg, SH2[i]);
			if (!cs)
				return {
					err:
						SH2[i] === 1
							? `The T for ${who[i]} (${s[i * 2]}${dg}) runs off the board: centered on ${s[i * 2]}, its stem points ${ARM[dg - 1]}.`
							: `The L for ${who[i]} (${s[i * 2]}${dg}) runs off the board: from ${s[i * 2]} the arm goes ${ARM[(dg - 1) >> 1]}.`,
				};
			ls.push(cells(cs));
		}
		if (ls[0]! & ls[1]!)
			return {
				err: "The two L pieces overlap.".replace("L", piece),
			};
		if (ONE)
		{
			const a = SQ.indexOf(s[4]!);
			if ((ls[0]! | ls[1]!) & bit(a))
				return {
					err: "The disc is sitting on a T.",
				};
			return {
				code: s,
				P:
				{
					L:
					{
						R: LIDX.get(ls[0]!)!,
						B: LIDX.get(ls[1]!)!,
					},
					N: [a, PH],
					turn: s[5] === "1" ? "R" : "B",
					phase: "L",
					over: null,
				},
			};
		}
		const a = SQ.indexOf(s[4]!),
			b = SQ.indexOf(s[5]!);
		if (a === b)
			return {
				err: "The two discs cannot share a square.",
			};
		if ((ls[0]! | ls[1]!) & (bit(a) | bit(b)))
			return {
				err: "A disc is sitting on an L.",
			};
		return {
			code: s,
			P:
			{
				L:
				{
					R: LIDX.get(ls[0]!)!,
					B: LIDX.get(ls[1]!)!,
				},
				N: [Math.min(a, b), Math.max(a, b)],
				turn: a < b ? "R" : "B",
				phase: "L",
				over: null,
			},
		};
	}
	// the code describes the board as it looks on screen, so it follows the view when the board is turned
	const rotP = <T extends Position>(P: T, k: number): T =>
		k
			?
				{
					...P,
					L:
					{
						R: LIDX.get(rotMask(LS[P.L.R]!, k))!,
						B: LIDX.get(rotMask(LS[P.L.B]!, k))!,
					},
					N: P.N.map((c) => (c === PH ? c : DMAP(c, 4, k))),
				}
			: P;
	// The squares other than the mover's own piece that it cannot cover.
	const blockedFor = (t: Side, P: Pick<Position, "L" | "N">): number =>
		LS[P.L[other(t)]]! | bit(P.N[0]!) | bit(P.N[1]!);
	// Every new placement for the mover's piece.
	const legalL = (t: Side, P: Pick<Position, "L" | "N">): number[] =>
	{
		const b = blockedFor(t, P),
			r: number[] = [],
			sh = SHP[P.L[t]];
		for (let j = 0; j < NL; j++) if (j !== P.L[t] && SHP[j] === sh && !(LS[j]! & b)) r.push(j);
		return r;
	};
	// Every move that puts the mover's piece on j: leave the discs, or move one to an empty square.
	function optionsFor(t: Side, j: number, P: Pick<Position, "L" | "N">): Move[]
	{
		const o = P.L[other(t)],
			a = P.N[0]!,
			b = P.N[1]!,
			free = ~(LS[o]! | LS[j]! | bit(a) | bit(b)) & 0xffff,
			base = (o * NL + j) * 289,
			r: Move[] = [
				{
					j,
					ni: -1,
					s: sid[base + pair(a, b)]!,
				},
			];
		for (let e = 0; e < 16; e++)
			if (free & bit(e))
			{
				if (a !== PH)
					r.push(
						{
							j,
							ni: 0,
							to: e,
							s: sid[base + pair(e, b)]!,
						},
					);
				if (b !== PH)
					r.push(
						{
							j,
							ni: 1,
							to: e,
							s: sid[base + pair(a, e)]!,
						},
					);
			}
		return r;
	}
	// The solver state of a position with t to move.
	const stateOf = (P: Pick<Position, "L" | "N">, t: Side): number =>
		sid[key(P.L[t], P.L[other(t)], P.N[0]!, P.N[1]!)]!;
	return {
		piece,
		LS,
		LIDX,
		SHP,
		LT,
		ONE,
		BSL,
		NL,
		pair,
		key,
		sid,
		START,
		STD,
		lCells,
		encL,
		posCode,
		parseCode,
		rotP,
		blockedFor,
		legalL,
		optionsFor,
		stateOf,
	};
}
