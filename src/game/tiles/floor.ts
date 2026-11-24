// Moving Tiles' floor on a G x G grid: which spots hold a tile, and where a tile may move so the floor stays one piece.

export interface Floor
{
	tiles: number[];
	B: number[];
	stone: number[];
	sc: (number[] | null)[];
	crack: number;
	hams: number[];
	hamt?: Record<number, number>;
}

// The spots sharing a side with c.
export function nbs(c: number, G: number): number[]
{
	const r = Math.floor(c / G),
		k = c % G,
		o: number[] = [];
	if (r > 0) o.push(c - G);
	if (r < G - 1) o.push(c + G);
	if (k > 0) o.push(c - 1);
	if (k < G - 1) o.push(c + 1);
	return o;
}

// the floor must stay one piece: every tile joined to every other by shared sides (corners don't count)
export function islands(tl: number[], G: number): number[][]
{
	const NC = G * G,
		seen = new Uint8Array(NC),
		out: number[][] = [];
	for (let s = 0; s < NC; s++)
	{
		if (!tl[s] || seen[s]) continue;
		const part = [s],
			st = [s];
		seen[s] = 1;
		while (st.length)
		{
			const c = st.pop()!;
			for (const e of nbs(c, G))
				if (tl[e] && !seen[e])
				{
					seen[e] = 1;
					part.push(e);
					st.push(e);
				}
		}
		out.push(part);
	}
	return out;
}

export function connected(tl: number[], G: number): boolean
{
	const NC = G * G;
	let s = -1,
		n = 0;
	for (let c = 0; c < NC; c++)
		if (tl[c])
		{
			n++;
			if (s < 0) s = c;
		}
	if (n < 2) return true;
	const seen = new Uint8Array(NC),
		st = [s];
	seen[s] = 1;
	let k = 1;
	while (st.length)
	{
		const c = st.pop()!;
		for (const e of nbs(c, G))
			if (tl[e] && !seen[e])
			{
				seen[e] = 1;
				k++;
				st.push(e);
			}
	}
	return k === n;
}

// where a tile may go: an empty spot sharing a side with at least one other tile, keeping the floor in one piece. A
// cracking tile is about to fall, so the floor has to hold together without it too
export function targets(T: Floor, src: number, G: number): number[]
{
	const NC = G * G,
		res: number[] = [],
		tl = [...T.tiles];
	if (T.crack >= 0 && !T.sc.some((a) => a?.includes(T.crack)))
	{
		const t2 = [...tl];
		t2[T.crack] = 0;
		if (connected(t2, G)) tl[T.crack] = 0;
	}
	tl[src] = 0;
	for (let d = 0; d < NC; d++)
	{
		if (T.tiles[d] || d === src) continue;
		if (!nbs(d, G).some((e) => e !== src && T.tiles[e])) continue;
		tl[d] = 1;
		if (connected(tl, G)) res.push(d);
		tl[d] = 0;
	}
	return res;
}

// whatever rides on the tile (a blocker or a one-piece statue) moves with it
export function moveTile(T: Floor, src: number, dst: number): void
{
	T.tiles[src] = 0;
	T.tiles[dst] = 1;
	const i = T.stone.indexOf(src);
	if (i >= 0) T.stone[i] = dst;
	T.B = T.B.map((b) => (b === src ? dst : b));
	T.sc = T.sc.map((a) => (a?.length === 1 && a[0] === src ? [dst] : a));
	if (T.hams.includes(src))
	{
		T.hams = T.hams.map((x) => (x === src ? dst : x));
		if (T.hamt)
			T.hamt =
			{
				...T.hamt,
				[dst]: T.hamt[src]!,
			};
	}
}
