import {bit, type Board, type Move, PH} from "./rules.ts";

// The retrograde solver: every position's value for the side to move (1 win, -1 loss, 2 draw) and the plies to the end.
export interface Solution
{
	val: Int8Array;
	dep: Int16Array;
	// Each state's replies are ed[off[s]] to ed[off[s + 1]].
	off: Int32Array;
	ed: Int32Array;
}

export function solve(board: Board): Solution
{
	const {LS, SHP, NL, BSL, LT, key, pair, sid} = board;
	const keys: number[] = [];
	for (let m = 0; m < NL; m++)
		for (let o = 0; o < NL; o++)
		{
			if (LS[m]! & LS[o]! || (LT && SHP[m] === SHP[o])) continue;
			const u = LS[m]! | LS[o]!;
			for (let a = 0; a < 16; a++)
				for (const b of BSL[a]!)
					if (!(u & (bit(a) | bit(b))))
					{
						sid[key(m, o, a, b)] = keys.length;
						keys.push(key(m, o, a, b));
					}
		}
	const N = keys.length,
		off = new Int32Array(N + 1),
		ed: number[] = [];
	for (let s = 0; s < N; s++)
	{
		const k = keys[s]!,
			pr = k % 289,
			b = pr % 17,
			a = (pr - b) / 17,
			mo = (k - pr) / 289,
			o = mo % NL,
			m = (mo - o) / NL,
			occ = LS[o]! | bit(a) | bit(b);
		for (let j = 0; j < NL; j++)
		{
			if (j === m || LS[j]! & occ || SHP[j] !== SHP[m]) continue;
			const base = (o * NL + j) * 289;
			ed.push(sid[base + pair(a, b)]!);
			const free = ~(occ | LS[j]!) & 0xffff;
			for (let e = 0; e < 16; e++)
				if (free & bit(e))
				{
					ed.push(sid[base + pair(e, b)]!);
					if (b !== PH) ed.push(sid[base + pair(a, e)]!);
				}
		}
		off[s + 1] = ed.length;
	}
	const val = new Int8Array(N),
		dep = new Int16Array(N);
	for (let s = 0; s < N; s++) if (off[s] === off[s + 1]) val[s] = -1;
	for (let changed = true; changed;)
	{
		changed = false;
		const upd: number[] = [];
		for (let s = 0; s < N; s++)
		{
			if (val[s]) continue;
			let minL = 1e9,
				maxW = -1,
				all = true;
			for (let i = off[s]!; i < off[s + 1]!; i++)
			{
				const v = val[ed[i]!];
				if (v === -1) minL = Math.min(minL, dep[ed[i]!]!);
				else if (v === 1) maxW = Math.max(maxW, dep[ed[i]!]!);
				else all = false;
			}
			if (minL < 1e9) upd.push(s, 1, minL + 1);
			else if (all) upd.push(s, -1, maxW + 1);
		}
		for (let i = 0; i < upd.length; i += 3)
		{
			val[upd[i]!] = upd[i + 1]!;
			dep[upd[i]!] = upd[i + 2]!;
			changed = true;
		}
	}
	for (let s = 0; s < N; s++) if (val[s] === 0) val[s] = 2;
	return {
		val,
		dep,
		off,
		ed: Int32Array.from(ed),
	};
}

// A state's replies, as a range of ed (none before the solver has run).
export const replies = (sol: Solution | null, s: number): [number, number] =>
	sol ? [sol.off[s]!, sol.off[s + 1]!] : [0, 0];

// The share of a state's replies that pass the test.
export function trapShare(sol: Solution | null, s: number, good: (reply: number) => boolean): number
{
	const [a, b] = replies(sol, s);
	if (b <= a) return 0;
	let n = 0;
	for (let i = a; i < b; i++) if (good(sol!.ed[i]!)) n++;
	return n / (b - a);
}

// How a move is judged: first by the perfect-play result, then (for equally good moves) by how many ways it gives the
// opponent to go wrong. Before the solver has run, every move rates the same.
function rate(sol: Solution | null, m: Move): number
{
	if (!sol) return 0;
	const {val, dep} = sol,
		v = val[m.s],
		d = dep[m.s]!;
	if (v === -1)
	{
		const [a, b] = replies(sol, m.s);
		return 3000 - d + 0.9 * (1 - (b - a) / 200); // fastest win, then fewest replies for them
	}
	if (v === 2) return 1000 + 0.99 * trapShare(sol, m.s, (x) => val[x] === 1); // draw: most replies that hand you a forced win
	return d + 0.99 * trapShare(sol, m.s, (x) => val[x] !== -1); // lost: hold out longest, then most ways for them to slip
}

// The best move in a list, with a little noise to break ties at random.
export function bestMove(sol: Solution | null, list: Move[], noisy = false): Move
{
	let best = -1e9,
		bs: Move | null = null;
	for (const m of list)
	{
		const r = rate(sol, m) + (noisy ? Math.random() * 0.02 : 0);
		if (r > best)
		{
			best = r;
			bs = m;
		}
	}
	return bs!;
}
