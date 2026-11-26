import {other, type Side} from "./rules.ts";
import type {Solution} from "./solver.ts";

// The verdict above the board: who wins with perfect play from here, and in how many of the winner's moves, or a draw.
// A value is from the side to move, as the solver keeps it: 1 a win, -1 a loss, 2 a draw, with the plies to the end.

// Green when you win against the computer, red when it does, and neutral between two people.
export type VerdictKind = "win" | "loss" | "draw" | "decisive";

export interface Verdict
{
	kind: VerdictKind;
	text: string;
}

export interface Outcome
{
	v: number;
	d: number;
}

// The mover's value part way through a turn, from the states its remaining choices can leave for the opponent: the
// solver's own rule, so it matches the value the turn started with when the mover plays on perfectly.
export function outcome(sol: Pick<Solution, "val" | "dep">, replies: number[]): Outcome
{
	let fastest = Infinity,
		longest = -1,
		draw = false;
	for (const s of replies)
	{
		const v = sol.val[s],
			d = sol.dep[s]!;
		if (v === -1) fastest = Math.min(fastest, d);
		else if (v === 1) longest = Math.max(longest, d);
		else draw = true;
	}
	if (fastest < Infinity)
		return {
			v: 1,
			d: fastest + 1,
		};
	if (draw || longest < 0)
		return {
			v: 2,
			d: 0,
		};
	return {
		v: -1,
		d: longest + 1,
	};
}

// The verdict in words. you is the human's side against the computer, or null between two people.
export function describeVerdict(
	v: number,
	d: number,
	mover: Side,
	names: Record<Side, string>,
	you: Side | null,
): Verdict
{
	if (v !== 1 && v !== -1)
		return {
			kind: "draw",
			text: "Draw with perfect play",
		};
	const winner = v === 1 ? mover : other(mover),
		moves = v === 1 ? (d + 1) / 2 : d / 2,
		count = `${moves} move${moves === 1 ? "" : "s"}`;
	if (you === null)
		return {
			kind: "decisive",
			text: `${names[winner]} wins in ${count}`,
		};
	return winner === you
		?
			{
				kind: "win",
				text: `You win in ${count}`,
			}
		:
			{
				kind: "loss",
				text: `Computer wins in ${count}`,
			};
}
