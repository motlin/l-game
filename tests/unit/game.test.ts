import {describe, expect, it} from "vite-plus/test";
import {qCode, qFmt, qParse, START_L, PL} from "../../src/game/battle/rules.ts";
import {createBoard, fmtCode, type Position, type Side} from "../../src/game/classic/rules.ts";
import {solve} from "../../src/game/classic/solver.ts";
import {describeVerdict, outcome} from "../../src/game/classic/verdict.ts";
import {Redo} from "../../src/game/redo.ts";

const games =
{
	L: createBoard("L"),
	T: createBoard("T"),
	LT: createBoard("LT"),
};
const solved =
{
	L: solve(games.L),
	T: solve(games.T),
	LT: solve(games.LT),
};

// The solver's value of a game's standard opening for the first player.
const value = (piece: keyof typeof games): number => solved[piece].val[games[piece].stateOf(games[piece].START, "R")]!;

describe("the 2-player games", () =>
{
	it("give the first player these moves from the standard opening", () =>
	{
		const moves = (
			board: typeof games.L,
		):
		{
			placements: number;
			moves: number;
		} =>
		{
			const placements = board.legalL("R", board.START);
			return {
				placements: placements.length,
				moves: placements.flatMap((j) => board.optionsFor("R", j, board.START)).length,
			};
		};
		expect(
			{
				L: moves(games.L),
				T: moves(games.T),
				LT: moves(games.LT),
			},
		).toStrictEqual(
			{
				L:
				{
					placements: 5,
					moves: 65,
				},
				T:
				{
					placements: 4,
					moves: 32,
				},
				LT:
				{
					placements: 1,
					moves: 13,
				},
			},
		);
	});

	it("solve every position: 18,368 in the L game, 1,088 in the T game and 16,576 in L vs T", () =>
	{
		expect(
			{
				L: solved.L.val.length,
				T: solved.T.val.length,
				LT: solved.LT.val.length,
			},
		).toStrictEqual(
			{
				L: 18_368,
				T: 1_088,
				LT: 16_576,
			},
		);
	});

	it("make every standard opening a draw under perfect play (2 is a draw)", () =>
	{
		expect(
			{
				L: value("L"),
				T: value("T"),
				LT: value("LT"),
			},
		).toStrictEqual(
			{
				L: 2,
				T: 2,
				LT: 2,
			},
		);
	});
});

describe("2-player position codes", () =>
{
	it("encode each game's standard opening as the code the page shows", () =>
	{
		expect(
			{
				L: games.L.posCode(games.L.START),
				T: games.T.posCode(games.T.START),
				LT: games.LT.posCode(games.LT.START),
			},
		).toStrictEqual(
			{
				L: "C5N1AP",
				T: "B3K3P1",
				LT: "P7F3DM",
			},
		);
	});

	it("decode the examples on the page, with spaces and either player to move", () =>
	{
		const decode = (board: typeof games.L, code: string): Pick<Position, "L" | "N" | "turn"> | string =>
		{
			const parsed = board.parseCode(code);
			return parsed.P
				?
					{
						L: parsed.P.L,
						N: parsed.P.N,
						turn: parsed.P.turn,
					}
				: parsed.err;
		};
		expect(
			{
				opening: decode(games.L, "C5 N1 AP"),
				secondToMove: decode(games.L, "c5-n1-pa"),
				tOpening: decode(games.T, "B3 K3 P1"),
				lvtOpening: decode(games.LT, "P7 F3 DM"),
				short: decode(games.L, "C5 N1"),
				offBoard: decode(games.L, "A7 N1 BP"),
				overlap: decode(games.L, "C5 C5 AP"),
				discOnL: decode(games.L, "C5 N1 BP"),
				tStem: decode(games.T, "A1 K3 P1"),
			},
		).toStrictEqual(
			{
				opening:
				{
					L: games.L.START.L,
					N: [0, 15],
					turn: "R",
				},
				secondToMove:
				{
					L: games.L.START.L,
					N: [0, 15],
					turn: "B",
				},
				tOpening:
				{
					L: games.T.START.L,
					N: [15, 16],
					turn: "R",
				},
				lvtOpening:
				{
					L: games.LT.START.L,
					N: [3, 12],
					turn: "R",
				},
				short: "A code is exactly 6 characters; this has 4.",
				offBoard: "The L for the first player (A7) runs off the board: from A the arm goes left.",
				overlap: "The two L pieces overlap.",
				discOnL: "A disc is sitting on an L.",
				tStem: "The T for the first player (A1) runs off the board: centered on A, its stem points up.",
			},
		);
	});

	it("round-trip every solved position, with either player to move", () =>
	{
		const failures: string[] = [];
		for (const [piece, board] of Object.entries(games))
			for (let m = 0; m < board.NL; m++)
				for (let o = 0; o < board.NL; o++)
					for (let a = 0; a < 16; a++)
						for (const b of board.BSL[a]!)
						{
							// In L vs T the first player always has the L.
							if (board.sid[board.key(m, o, a, b)]! < 0 || (board.LT && board.SHP[m] !== 0)) continue;
							for (const turn of ["R", "B"] as Side[])
							{
								if (board.ONE && turn === "B") continue;
								const P =
								{
									L:
									{
										R: m,
										B: o,
									},
									N: [a, b],
									turn,
								};
								const code = board.posCode(P);
								const back = board.parseCode(fmtCode(code)).P;
								if (
									back?.L.R !== m ||
									back.L.B !== o ||
									back.turn !== turn ||
									back.N.join() !== [a, b].join()
								)
									failures.push(`${piece} ${code}`);
							}
						}
		expect(failures).toStrictEqual([]);
	});
});

describe("4-player position codes", () =>
{
	// The blockers come back in the code's alphabetical order: A1, A6, F1, F6.
	it("write the battle's opening and read it back", () =>
	{
		const opening =
		{
			L: [...START_L],
			alive: [1, 1, 1, 1],
			pts: [0, 0, 0, 0],
			B: [0, 5, 30, 35],
			turn: 0,
		};
		const code = qCode(opening, (q) => PL[START_L[q]!]!);
		const back = qParse(qFmt(code)).S;
		expect(
			{
				code: qFmt(code),
				back: back &&
				{
					L: back.L,
					alive: back.alive,
					B: back.B,
					turn: back.turn,
				},
			},
		).toStrictEqual(
			{
				code: "1 B41 C23 E35 D57 A1 A6 F1 F6",
				back:
				{
					L: START_L,
					alive: [1, 1, 1, 1],
					B: [0, 30, 5, 35],
					turn: 0,
				},
			},
		);
	});
});

describe("redo", () =>
{
	it("steps back through every undo in turn, and a new move in between ends it", () =>
	{
		const redo = new Redo();
		redo.undone("C", "B");
		redo.undone("B", "B");
		redo.undone("B", "A");
		const walk = [redo.can("A"), redo.redo("A"), redo.can("B"), redo.redo("B"), redo.can("C"), redo.redo("C")];
		redo.undone("C", "B");
		const moved = [redo.can("D"), redo.can("B"), redo.redo("B")];
		expect(
			{
				walk,
				moved,
			},
		).toStrictEqual(
			{
				walk: [true, "B", true, "C", false, undefined],
				moved: [false, false, undefined],
			},
		);
	});
});

// A solution holding only these replies, as [value, plies] for the opponent to move.
const replySolution = (replies: [number, number][]): Parameters<typeof outcome>[0] => (
{
	val: Int8Array.from(replies.map(([v]) => v)),
	dep: Int16Array.from(replies.map(([, d]) => d)),
});

describe("the perfect-play verdict", () =>
{
	const names =
	{
		R: "Ann",
		B: "Bo",
	};
	it("names the winner and counts the winner's moves, from the side to move", () =>
	{
		expect([
			describeVerdict(1, 1, "R", names, "R"),
			describeVerdict(1, 5, "B", names, "R"),
			describeVerdict(-1, 4, "R", names, "R"),
			describeVerdict(-1, 2, "R", names, null),
			describeVerdict(2, 0, "B", names, null),
		]).toStrictEqual([
			{
				kind: "win",
				text: "You win in 1 move",
			},
			{
				kind: "loss",
				text: "Computer wins in 3 moves",
			},
			{
				kind: "loss",
				text: "Computer wins in 2 moves",
			},
			{
				kind: "decisive",
				text: "Bo wins in 1 move",
			},
			{
				kind: "draw",
				text: "Draw with perfect play",
			},
		]);
	});
	it("scores a half-finished turn by the best of the replies it can still leave", () =>
	{
		// A quick loss for them wins, a draw beats losing, and when every reply wins for them the mover holds out longest.
		expect([
			outcome(
				replySolution([
					[1, 3],
					[-1, 4],
					[-1, 2],
					[2, 0],
				]),
				[0, 1, 2, 3],
			),
			outcome(
				replySolution([
					[1, 3],
					[2, 0],
				]),
				[0, 1],
			),
			outcome(
				replySolution([
					[1, 3],
					[1, 7],
				]),
				[0, 1],
			),
		]).toStrictEqual([
			{
				v: 1,
				d: 3,
			},
			{
				v: 2,
				d: 0,
			},
			{
				v: -1,
				d: 8,
			},
		]);
	});
});
