import {crownAt} from "../art.ts";
import {DMAP, LPATH} from "../geometry.ts";
import {N} from "./rules.ts";

// Drawing on the battle's 6 by 6 board in the top view: statues, stone floor, cracking tiles and the crown. The board
// turns with the view while the match is drawn; the guide's pictures are drawn unturned.

export const CW = 100;
let QROT = 0;
export function setTurn(k: number): void
{
	QROT = k;
}
export const D = (c: number): number => DMAP(c, N, QROT);
const xyR = (c: number): [number, number] => [(c % N) * CW, Math.floor(c / N) * CW];
export const xy = (c: number): [number, number] => xyR(D(c));
export const shapes = (cs: number[]): string => `<path d="${LPATH(cs.map(D), N)}"/>`;
const shapesR = (cs: number[]): string => `<path d="${LPATH(cs, N)}"/>`;

function rng(seed: number): () => number
{
	let a = seed >>> 0 || 1;
	return () =>
	{
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function statue(cs0: number[], seed: number, cls = ""): string
{
	const cs = cs0.map(D),
		sh = shapesR(cs),
		set = new Set(cs),
		R = rng(seed * 7919 + 13);
	let crack = "",
		hi = "",
		chip = "",
		chis = "";
	for (const c of cs)
	{
		const [x, y] = xyR(c),
			X = x + 12,
			Y = y + 12,
			W = 76;
		// a branching crack across the block
		let px = X + 8 + R() * 60,
			py = Y + (R() < 0.5 ? 2 : W - 2);
		const pts = [[px, py]];
		for (let k = 0; k < 4; k++)
		{
			px = Math.max(X + 4, Math.min(X + W - 4, px + (R() - 0.5) * 40));
			py += (py < Y + W / 2 ? 1 : -1) * (10 + R() * 16);
			pts.push([px, py]);
		}
		const d = `M${pts.map((p) => `${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join("L")}`,
			b = pts[1 + Math.floor(R() * 3)]!,
			bx = b[0]! + (R() < 0.5 ? -1 : 1) * (14 + R() * 14),
			by = b[1]! + (R() - 0.5) * 18;
		crack += `<path d="${d}M${b[0]!.toFixed(1)} ${b[1]!.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
		hi += `<path d="${d}" transform="translate(1.5,1.5)"/>`;
		// chipped corners where the block has an open edge
		const open: Record<string, boolean> =
		{
			t: !set.has(c - N),
			b: !set.has(c + N),
			l: c % N === 0 || !set.has(c - 1),
			r: c % N === N - 1 || !set.has(c + 1),
		};
		for (const [cx, cy, o1, o2, sx, sy] of [
			[X, Y, "t", "l", 1, 1],
			[X + W, Y, "t", "r", -1, 1],
			[X, Y + W, "b", "l", 1, -1],
			[X + W, Y + W, "b", "r", -1, -1],
		] as const)
			if (open[o1] && open[o2] && R() < 0.75)
			{
				const a = 8 + R() * 12,
					b2 = 8 + R() * 12;
				chip += `<path d="M${cx - sx * 2} ${cy - sy * 2}L${cx + sx * a} ${cy - sy * 2}L${cx + sx * a * 0.4} ${cy + sy * b2 * 0.5}L${cx - sx * 2} ${cy + sy * b2}Z"/>`;
			}
		if (open["t"] && R() < 0.6)
		{
			const a = X + 14 + R() * 40;
			chip += `<path d="M${a} ${Y - 3}l7 9l9-6l3-3z"/>`;
		}
		if (open["r"] && R() < 0.6)
		{
			const a = Y + 14 + R() * 40;
			chip += `<path d="M${X + W + 3} ${a}l-9 7l5 9l4 2z"/>`;
		}
		// chisel strokes
		for (let k = 0; k < 3; k++)
		{
			const cx = X + 10 + R() * 52,
				cy = Y + 10 + R() * 52;
			chis += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}l9 -4M${(cx + 2).toFixed(1)} ${(cy + 5).toFixed(1)}l9 -4"/>`;
		}
	}
	return (
		`<g class="${cls}"><g transform="translate(0,6)" fill="rgba(0,0,0,.35)">${sh}</g><g fill="#4e4a45" stroke="#4e4a45" stroke-width="7" stroke-linejoin="round">${sh}</g><g fill="url(#qstone)">${sh}</g>` +
		`<g stroke="rgba(255,255,255,.35)" stroke-width="1.6" fill="none" stroke-linecap="round">${hi}</g><g stroke="#3a3632" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${crack}</g>` +
		`<g stroke="#6e6963" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8">${chis}</g><g fill="#f6ecda" stroke="#4e4a45" stroke-width="2" stroke-linejoin="round">${chip}</g></g>`
	);
}

export function stoneFloor(x: number, y: number, c: number, attr: string): string
{
	const R = rng(c * 977 + 3);
	let sp = "";
	for (let k = 0; k < 6; k++)
		sp += `<circle cx="${(x + 15 + R() * 70).toFixed(1)}" cy="${(y + 15 + R() * 70).toFixed(1)}" r="${(1.5 + R() * 2).toFixed(1)}" fill="#6f6a64" opacity=".6"/>`;
	const a = x + 20 + R() * 25,
		b = y + 25 + R() * 40;
	return `<g${attr}><rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="url(#qsf)"/><rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="none" stroke="#6f6a64" stroke-width="2"/>${sp}<path d="M${a.toFixed(1)} ${b.toFixed(1)}l16 6l10 -8l14 10" stroke="#5e5953" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M${(a + 1).toFixed(1)} ${(b + 2).toFixed(1)}l16 6l10 -8l14 10" stroke="rgba(255,255,255,.35)" stroke-width="1" fill="none"/></g>`;
}

export function crackTile(x: number, y: number, c: number, stoneBase: boolean): string
{
	const R = rng(c * 131 + 7),
		cx = x + 35 + R() * 30,
		cy = y + 35 + R() * 30;
	let dark = "",
		lite = "";
	const n = 5 + Math.floor(R() * 2);
	for (let k = 0; k < n; k++)
	{
		const ang = ((k + R() * 0.6) / n) * Math.PI * 2;
		let px = cx,
			py = cy;
		const pts = [[px, py]];
		for (let s2 = 0; s2 < 4; s2++)
		{
			const a = ang + (R() - 0.5) * 0.9,
				len = 8 + R() * 12;
			px += Math.cos(a) * len;
			py += Math.sin(a) * len;
			px = Math.max(x + 7, Math.min(x + 93, px));
			py = Math.max(y + 7, Math.min(y + 93, py));
			pts.push([px, py]);
		}
		const d = `M${pts.map((p) => `${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join("L")}`;
		dark += `<path d="${d}" stroke-width="${(2.2 - k * 0.15).toFixed(2)}"/>`;
		lite += `<path d="${d}"/>`;
		if (R() < 0.5)
		{
			const b = pts[2]!,
				a2 = ang + (R() < 0.5 ? 1 : -1) * (0.8 + R() * 0.5);
			dark += `<path d="M${b[0]!.toFixed(1)} ${b[1]!.toFixed(1)}l${(Math.cos(a2) * 12).toFixed(1)} ${(Math.sin(a2) * 12).toFixed(1)}" stroke-width="1.2"/>`;
		}
	}
	const ex = R() < 0.5,
		chunk = ex
			? `M${x + 5} ${y + 60 + R() * 15}l${10 + R() * 8} ${-4 - R() * 6}l${-4} ${12 + R() * 6}Z`
			: `M${x + 55 + R() * 20} ${y + 95}l${-6 - R() * 6} ${-10 - R() * 6}l${10 + R() * 8} 2Z`;
	return (
		`<g class="quake"><rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="${stoneBase ? "#a39d95" : "#ecdfc6"}"/><rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="none" stroke="rgba(209,59,48,.55)" stroke-width="3"/>` +
		`<g stroke="rgba(255,255,255,.7)" stroke-width="1" fill="none" transform="translate(1,1)">${lite}</g><g stroke="#4a3626" fill="none" stroke-linecap="round" stroke-linejoin="round">${dark}</g><path d="${chunk}" fill="#3a2416"/>` +
		`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.5" fill="#4a3626"/></g>`
	);
}

export function crown(cs0: number[]): string
{
	const cs = cs0.map(D),
		top = Math.min(...cs.map((c) => Math.floor(c / N))),
		row = cs.filter((c) => Math.floor(c / N) === top),
		x = ((Math.min(...row.map((c) => c % N)) + Math.max(...row.map((c) => c % N)) + 1) / 2) * CW,
		y = top * CW + 20;
	return crownAt(x, y, true);
}

export const crownMini =
	'<svg viewBox="0 0 70 50" width="22" height="16" aria-hidden="true"><path d="M5 45L3 12L20 28L35 4L50 28L67 12L65 45Z" fill="#f4c430" stroke="#7a4b00" stroke-width="5" stroke-linejoin="round"/></svg>';
