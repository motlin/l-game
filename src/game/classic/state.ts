import {cleanName, parseJSON} from "../dom.ts";
import {PIECE} from "../piece.ts";
import {getItem, removeItem, setItem} from "../storage.ts";
import {createBoard, type Move, type Parsed, type Position, type Side} from "./rules.ts";
import {bestMove, type Solution} from "./solver.ts";

// The 2-player game's state, shared by its game, move tree, ways-to-lose, tutorial, codes and colors modules.

export const board = createBoard(PIECE);
export const {LS, LIDX, SHP, NL, BSL, LT, ONE, key, sid, STD, lCells, posCode, rotP} = board;
export const parseCode = (s: string | undefined): Parsed => board.parseCode(s);

export interface Options
{
	mode: string;
	level: string;
	human: Side;
	colR: number[];
	colB: number[];
	nameR?: string | undefined;
	nameB?: string | undefined;
	randFirst?: boolean | undefined;
	start?: string;
	tview?: string;
	tutDone?: boolean;
}

// A recorded game: its positions as posKey strings, the winner (null when unfinished), the starting code, the human's
// side against the computer (null for two players), and when it was saved.
interface Game
{
	p: string[];
	w: Side | null;
	s?: string;
	h?: Side | null | undefined;
	d: number;
}

export const DEFCOL: Record<Side, number[]> =
{
	R: [224, 70, 58],
	B: [47, 107, 224],
};
export const DEFNAME: Record<Side, string> =
{
	R: "P1",
	B: "P2",
};
export const opt: Options =
{
	mode: "cpu",
	level: "medium",
	human: "R",
	colR: [...DEFCOL.R],
	colB: [...DEFCOL.B],
};
export const score =
{
	you: 0,
	cpu: 0,
	R: 0,
	B: 0,
};
export const NAME: Record<Side, string> =
{
	R: "P1",
	B: "P2",
};
export const COL: Record<Side, string> =
{
	R: "var(--red)",
	B: "var(--blue)",
};
export const FC: Record<Side, string> =
{
	R: "#e0463a",
	B: "#2f6be0",
};

export const st =
{
	G: structuredClone(board.START),
	// Every position of the game so far, as JSON.
	hist: [] as string[],
	// The squares swiped so far for the piece's new spot.
	sel: [] as number[],
	// The move a hint or a tapped way to win shows.
	hintMv: null as Move | null,
	busy: false,
	gameStart: STD,
	games: [] as Game[],
	sol: null as Solution | null,
};

// Late-bound calls up into the game module, which imports everything else.
export const hooks =
{
	render: (): void => undefined,
	newGame: (_code?: string, _tut?: boolean): void => undefined,
	syncRadios: (): void => undefined,
};

export const save = (): void =>
{
	try
	{
		setItem("lgame-score", JSON.stringify(score));
		setItem("lgame-opt", JSON.stringify(opt));
	}
	catch
	{
		// Storage is unavailable, so the settings last only until the page reloads.
	}
};
export const saveGames = (): void =>
{
	try
	{
		setItem("lgame-games", JSON.stringify(st.games));
	}
	catch
	{
		// Storage is unavailable, so the history lasts only until the page reloads.
	}
};

// Reads the saved settings, stats and games, and files a game left unfinished last time as unfinished.
export function load(): void
{
	try
	{
		Object.assign(score, parseJSON<Partial<typeof score>>(getItem("lgame-score") ?? "{}"));
		Object.assign(opt, parseJSON<Partial<Options>>(getItem("lgame-opt") ?? "{}"));
	}
	catch
	{
		// Unreadable settings leave the defaults.
	}
	try
	{
		st.games = parseJSON<Game[]>(getItem("lgame-games") ?? "[]");
	}
	catch
	{
		// An unreadable history starts empty.
	}
	try
	{
		const c = parseJSON<
		{
			s?: string;
			p?: string[];
			h?: Side | null;
		} | null>(getItem("lgame-cur") ?? "null");
		if (c?.p && c.p.length > 1)
		{
			st.games.push(
				{
					p: c.p,
					w: null,
					s: c.s ?? STD,
					h: c.h,
					d: Date.now(),
				},
			);
			saveGames();
		}
		removeItem("lgame-cur");
	}
	catch
	{
		// Storage is unavailable, so there is no unfinished game to recover.
	}
	if (!Array.isArray(opt.colR) || opt.colR.length !== 3) opt.colR = [...DEFCOL.R];
	if (!Array.isArray(opt.colB) || opt.colB.length !== 3) opt.colB = [...DEFCOL.B];
}

export const colOf = (p: Side): number[] => (p === "R" ? opt.colR : opt.colB);
export const nameOf = (p: Side): string | undefined => (p === "R" ? opt.nameR : opt.nameB);
export function setName(p: Side, name: string): void
{
	if (p === "R") opt.nameR = name;
	else opt.nameB = name;
}
export const shownName = (p: Side): string => cleanName(nameOf(p)) || DEFNAME[p];

export const snap = (): string => JSON.stringify(st.G);
export const ready = (): boolean => st.sol !== null;
export const sol = (): Solution => st.sol!;
export const posKey = (P: Pick<Position, "L" | "N">): string =>
	`${P.L.R}-${P.L.B}-${Math.min(...P.N)}-${Math.max(...P.N)}`;
export const dec = (k: string): Pick<Position, "L" | "N"> =>
{
	const [R, B, a, b] = k.split("-").map(Number);
	return {
		L:
		{
			R: R!,
			B: B!,
		},
		N: [a!, b!],
	};
};
export const curKeys = (): string[] => st.hist.map((s) => posKey(parseJSON<Position>(s)));
export const blockedFor = (t: Side, P: Pick<Position, "L" | "N"> = st.G): number => board.blockedFor(t, P);
export const legalL = (t: Side, P: Pick<Position, "L" | "N"> = st.G): number[] => board.legalL(t, P);
export const optionsFor = (t: Side, j: number, P: Pick<Position, "L" | "N"> = st.G): Move[] =>
	board.optionsFor(t, j, P);
export const stateOf = (P: Pick<Position, "L" | "N">, t: Side): number => board.stateOf(P, t);
// What perfect play makes of a position, in a sentence.
export function evalTxt(P: Pick<Position, "L" | "N">, t: Side): string
{
	if (!st.sol) return "";
	const s = stateOf(P, t),
		v = st.sol.val[s],
		d = st.sol.dep[s]!;
	return v === 1
		? `${NAME[t]} can force a win in ${(d + 1) / 2}.`
		: v === -1
			? d
				? `${NAME[t]} is lost with perfect play.`
				: `${NAME[t]} is boxed in.`
			: "Perfect play from here is a draw.";
}
export const pick = (list: Move[], noisy = false): Move => bestMove(st.sol, list, noisy);
export const isEmpty = (c: number): boolean =>
	!((LS[st.G.L.R]! | LS[st.G.L.B]! | (1 << st.G.N[0]!) | (1 << st.G.N[1]!)) & (1 << c));
export const humanTurn = (): boolean => !st.G.over && !st.busy && (opt.mode === "pvp" || st.G.turn === opt.human);
// The position after a move.
export function after(P: Pick<Position, "L" | "N">, t: Side, mv: Move): Pick<Position, "L" | "N">
{
	const Q =
	{
		L:
		{
			...P.L,
		},
		N: [...P.N],
	};
	Q.L[t] = mv.j;
	if (mv.ni >= 0) Q.N[mv.ni] = mv.to!;
	return Q;
}
