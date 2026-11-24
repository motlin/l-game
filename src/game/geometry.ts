// Board geometry shared by every game: piece placements, outlines and connectivity on an N x N board, where square c
// sits at row floor(c / N), column c % N.

export type Shape = [number, number][];

// Turns a square index a quarter turn clockwise k times on an N x N board.
export function DMAP(c: number, N: number, k: number): number
{
	let cell = c;
	for (let i = 0; i < k; i++)
	{
		const r = Math.floor(cell / N),
			q = cell % N;
		cell = q * N + (N - 1 - r);
	}
	return cell;
}

// The squares that share a side with c (-1 where the board ends above or below is filtered by the callers).
const sides = (c: number, N: number): number[] => [c - N, c + N, c % N ? c - 1 : -1, c % N < N - 1 ? c + 1 : -1];

// The pieces of a set of squares that are joined by shared sides.
export function COMPS(cells: number[], N: number): number[][]
{
	const left = new Set(cells),
		out: number[][] = [];
	while (left.size)
	{
		const s0 = left.values().next().value!,
			comp = [s0];
		left.delete(s0);
		for (let i = 0; i < comp.length; i++)
		{
			const c = comp[i]!;
			for (const d of sides(c, N))
				if (d >= 0 && left.has(d))
				{
					left.delete(d);
					comp.push(d);
				}
		}
		out.push(comp);
	}
	return out;
}

// The corners of the outline around a set of squares, in grid units, without the points along straight runs.
export function outlinePoints(cells: number[], N: number): number[][]
{
	const S = new Set(cells),
		E = new Map<string, number[]>();
	for (const c of cells)
	{
		const r = Math.floor(c / N),
			k = c % N,
			add = (a: number[], b: number[]): void =>
			{
				E.set(a.join(","), b);
			};
		if (r === 0 || !S.has(c - N)) add([k, r], [k + 1, r]);
		if (k === N - 1 || !S.has(c + 1)) add([k + 1, r], [k + 1, r + 1]);
		if (r === N - 1 || !S.has(c + N)) add([k + 1, r + 1], [k, r + 1]);
		if (k === 0 || !S.has(c - 1)) add([k, r + 1], [k, r]);
	}
	const start = E.keys().next().value!;
	let cur: number[] | undefined = start.split(",").map(Number),
		pts: number[][] = [];
	do
	{
		pts.push(cur);
		cur = E.get(cur.join(","));
	}
	while (cur && cur.join(",") !== start && pts.length < 40);
	pts = pts.filter((p, i) =>
	{
		const a = pts[(i - 1 + pts.length) % pts.length]!,
			b = pts[(i + 1) % pts.length]!;
		return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
	});
	return pts;
}

// The direction from a to b along each axis, and whether the outline turns clockwise at p.
export function corner(
	a: number[],
	p: number[],
	b: number[],
):
{
	d1: number[];
	d2: number[];
	cv: boolean;
}
{
	const d1 = [Math.sign(p[0]! - a[0]!), Math.sign(p[1]! - a[1]!)],
		d2 = [Math.sign(b[0]! - p[0]!), Math.sign(b[1]! - p[1]!)];
	return {
		d1,
		d2,
		cv: d1[0]! * d2[1]! - d1[1]! * d2[0]! > 0,
	};
}

const f = (v: number): number => Number(v.toFixed(1));
// An SVG path around a piece with rounded corners: inset ins from the square edges, with radius ro on outer corners
// and ri on inner ones. A piece in several parts gets one closed path for each.
export function LPATH(cells: number[], N: number, cs = 100, ins = 12, ro = 17, ri = 8): string
{
	const parts = COMPS(cells, N);
	if (parts.length > 1) return parts.map((p) => LPATH(p, N, cs, ins, ro, ri)).join("");
	const pts = outlinePoints(cells, N);
	const n = pts.length,
		V = pts.map((p, i) =>
		{
			const {d1, d2, cv} = corner(pts[(i - 1 + n) % n]!, p, pts[(i + 1) % n]!);
			const n1 = [-d1[1]!, d1[0]!],
				n2 = [-d2[1]!, d2[0]!],
				x = p[0]! * cs + ins * (n1[0]! + n2[0]!),
				y = p[1]! * cs + ins * (n1[1]! + n2[1]!);
			return {
				x,
				y,
				cv,
			};
		});
	let d = "";
	V.forEach((v, i) =>
	{
		const a = V[(i - 1 + n) % n]!,
			b = V[(i + 1) % n]!,
			r = v.cv ? ro : ri,
			ua = [a.x - v.x, a.y - v.y],
			ub = [b.x - v.x, b.y - v.y],
			la = Math.hypot(...ua),
			lb = Math.hypot(...ub);
		const A = [v.x + (ua[0]! / la) * r, v.y + (ua[1]! / la) * r],
			B = [v.x + (ub[0]! / lb) * r, v.y + (ub[1]! / lb) * r];
		d += `${i ? "L" : "M"}${f(A[0]!)} ${f(A[1]!)}Q${f(v.x)} ${f(v.y)} ${f(B[0]!)} ${f(B[1]!)}`;
	});
	return `${d}Z`;
}

export interface Placements
{
	// Every placement's squares, sorted.
	PL: number[][];
	// A placement's index by its squares, sorted and joined with commas.
	PIDX: Map<string, number>;
	// The shape each placement has: 0 the player's piece, 1 to 4 the smaller pieces a hammer chips it to, then extras.
	SH: number[];
	// The placements of each shape.
	BY: number[][];
}

export const keyOf = (cs: number[]): string => [...cs].toSorted((a, b) => a - b).join(",");

// Every placement of the player's piece on an N x N board, plus the smaller pieces a hammer can chip it down to (3-square
// L, 3-square line, 2-square domino, single square). Placements of the full piece come first, so their numbers never
// change.
export function GENPL(N: number, base: Shape, extra: Shape[] = []): Placements
{
	const PL: number[][] = [],
		PIDX = new Map<string, number>(),
		SH: number[] = [],
		BY: number[][] = [],
		tf = [
			(p: number[]): number[] => [p[0]!, p[1]!],
			(p: number[]): number[] => [p[1]!, -p[0]!],
			(p: number[]): number[] => [-p[0]!, -p[1]!],
			(p: number[]): number[] => [-p[1]!, p[0]!],
		];
	const shapes: Shape[] = [
		base,
		[
			[0, 0],
			[1, 0],
			[1, 1],
		],
		[
			[0, 0],
			[1, 0],
			[2, 0],
		],
		[
			[0, 0],
			[1, 0],
		],
		[[0, 0]],
		...extra,
	];
	shapes.forEach((b, s) =>
	{
		const by: number[] = [];
		BY[s] = by;
		for (const mir of [0, 1])
			for (const t of tf)
			{
				let pts = b.map((p) => t(mir ? [p[0], -p[1]] : p));
				const mr = Math.min(...pts.map((p) => p[0]!)),
					mc = Math.min(...pts.map((p) => p[1]!));
				pts = pts.map((p) => [p[0]! - mr, p[1]! - mc]);
				const h = Math.max(...pts.map((p) => p[0]!)),
					w = Math.max(...pts.map((p) => p[1]!));
				for (let dr = 0; dr + h < N; dr++)
					for (let dc = 0; dc + w < N; dc++)
					{
						const cs = pts.map((p) => (p[0]! + dr) * N + p[1]! + dc),
							k = keyOf(cs);
						if (!PIDX.has(k))
						{
							PIDX.set(k, PL.length);
							SH.push(s);
							by.push(PL.length);
							PL.push(cs.toSorted((a, b2) => a - b2));
						}
					}
			}
	});
	return {
		PL,
		PIDX,
		SH,
		BY,
	};
}

// Whether a set of squares is one piece, joined by shared sides.
export function CONN(cs: number[], N: number): boolean
{
	if (!cs.length) return true;
	const S = new Set(cs),
		seen = new Set([cs[0]!]),
		st = [cs[0]!];
	while (st.length)
	{
		const c = st.pop()!;
		for (const x of sides(c, N))
			if (S.has(x) && !seen.has(x))
			{
				seen.add(x);
				st.push(x);
			}
	}
	return seen.size === cs.length;
}
