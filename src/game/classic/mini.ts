import {DMAP, LPATH} from "../geometry.ts";
import {bit, PH} from "./rules.ts";
import {dec, FC, LS} from "./state.ts";

// Drawing on the 4 by 4 board in the top view: the main board turns with the view while it is drawn, and every other
// picture (the move tree, the ways to lose, the code guide) is drawn unturned.
let ROTK = 0;
export function setTurn(k: number): void
{
	ROTK = k;
}

export const xy = (c0: number): [number, number] =>
{
	const c = DMAP(c0, 4, ROTK);
	return [(c % 4) * 100, Math.floor(c / 4) * 100];
};

export function lShapes(m: number): string
{
	const cs: number[] = [];
	for (let c = 0; c < 16; c++) if (m & bit(c)) cs.push(DMAP(c, 4, ROTK));
	return `<path d="${LPATH(cs, 4)}"/>`;
}

// A small board for a position, with dashed outlines where the last move came from.
export function miniInner(k: string, prevK: string | null): string
{
	const P = dec(k);
	let s = '<rect width="400" height="400" rx="28" fill="#3a2416"/>';
	for (let c = 0; c < 16; c++)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 4}" y="${y + 4}" width="92" height="92" rx="12" fill="#f3e8d4"/>`;
	}
	if (prevK)
	{
		const Q = dec(prevK);
		for (const t of ["R", "B"] as const)
			if (Q.L[t] !== P.L[t])
				for (let c = 0; c < 16; c++)
					if (LS[Q.L[t]]! & bit(c))
					{
						const [x, y] = xy(c);
						s += `<rect x="${x + 16}" y="${y + 16}" width="68" height="68" rx="14" fill="none" stroke="${FC[t]}" stroke-width="8" stroke-dasharray="14 10"/>`;
					}
		for (const c of Q.N)
			if (c !== PH && !P.N.includes(c))
			{
				const [x, y] = xy(c);
				s += `<circle cx="${x + 50}" cy="${y + 50}" r="24" fill="none" stroke="#333" stroke-width="8" stroke-dasharray="10 8"/>`;
			}
	}
	for (const t of ["R", "B"] as const) s += `<g fill="${FC[t]}">${lShapes(LS[P.L[t]]!)}</g>`;
	for (const c of P.N)
	{
		if (c === PH) continue;
		const [x, y] = xy(c);
		s += `<circle cx="${x + 50}" cy="${y + 50}" r="25" fill="#151515"/>`;
	}
	return s;
}

export const mini = (k: string, p: string | null): string =>
	`<svg viewBox="0 0 400 400" aria-hidden="true">${miniInner(k, p)}</svg>`;
