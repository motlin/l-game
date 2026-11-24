import {crownAt, HAMMER, HBREAK} from "./art.ts";
import {COMPS, corner, DMAP, outlinePoints} from "./geometry.ts";
import {view} from "./view.ts";

// The 3D corner view of any board: an isometric drawing of the tray, its squares and the pieces raised into solids.

export interface IsoPiece
{
	cells: number[];
	color: string;
	ghost?: boolean;
	flash?: boolean;
	age?: number;
	x?: boolean;
	stone?: boolean;
	hl?: boolean;
	op?: number;
	q?: number;
}

export interface IsoDisc
{
	c: number;
	ring?: string | null;
	flash?: boolean;
	drop?: boolean;
	age?: number;
}

export interface IsoTile
{
	c: number;
	fill?: string;
	stroke?: string;
	dash?: number;
	sw?: number;
	op?: number;
}

export interface IsoMark
{
	c: number;
	color?: string;
	halo?: number;
}

export interface IsoBoard
{
	N: number;
	pieces: IsoPiece[];
	discs: IsoDisc[];
	tiles: IsoTile[];
	dots: IsoMark[];
	rings: IsoMark[];
	over: IsoTile[];
	hammers?: number[];
	hamOld?: number[];
	hbk?:
	{
		c: number;
		age: number;
	} | null;
	holes?: number[];
	present?: number[];
	vbx?: number[];
	stone?: number[];
	crack?: number;
	falling?: number;
	fallAge?: number;
	crowns?: number[][];
	rot?: number;
	center?: number;
}

const u = 100,
	C = 0.866,
	Sn = 0.5,
	H = 0.42,
	TH = 0.38,
	DH = 0.26;
let cT = 1,
	sT = 0,
	CEN = 0;
const RC = (x: number, y: number): [number, number] =>
{
	if (!sT) return [x, y];
	const dx = x - CEN,
		dy = y - CEN;
	return [CEN + dx * cT - dy * sT, CEN + dx * sT + dy * cT];
};
const RN = (nx: number, ny: number): [number, number] => (sT ? [nx * cT - ny * sT, nx * sT + ny * cT] : [nx, ny]);
const P = (x0: number, y0: number, z = 0): number[] =>
{
	const [x, y] = RC(x0, y0);
	return [(x - y) * C * u, (x + y) * Sn * u - z * u];
};
const f = (v: number): string => v.toFixed(1);
const poly = (pts: number[][], fill: string, ex = ""): string =>
	`<polygon points="${pts.map((p) => `${f(p[0]!)},${f(p[1]!)}`).join(" ")}" fill="${fill}"${ex}/>`;
function rgbOf(c: string): number[]
{
	if (c.startsWith("#"))
	{
		return c.length === 4
			? c
					.slice(1)
					.split("")
					.map((x) => parseInt(x + x, 16))
			: [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
	}
	const m = c.match(/[\d.]+/g);
	return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
const sh = (c: string, k: number): string =>
{
	const a = rgbOf(c).map((v) => Math.round(Math.max(0, Math.min(255, k > 0 ? v + (255 - v) * k : v * (1 + k)))));
	return `rgb(${a.join(",")})`;
};
// A small seeded random number generator, so a stone looks the same on every redraw.
function lcg(seed: number): () => number
{
	let sd = seed;
	return () =>
	{
		sd = (sd * 1103515245 + 12345) >>> 0;
		return sd / 4294967296;
	};
}

// A piece's outline in board units, its corners rounded with five points each.
function outline(cells: number[], N: number, ins = 0.12, ro = 0.17, ri = 0.08): number[][]
{
	const pts = outlinePoints(cells, N);
	const n = pts.length,
		V = pts.map((p, i) =>
		{
			const {d1, d2, cv} = corner(pts[(i - 1 + n) % n]!, p, pts[(i + 1) % n]!);
			return {
				x: p[0]! + ins * (-d1[1]! - d2[1]!),
				y: p[1]! + ins * (d1[0]! + d2[0]!),
				cv,
			};
		});
	const out: number[][] = [];
	V.forEach((v, i) =>
	{
		const a = V[(i - 1 + n) % n]!,
			b = V[(i + 1) % n]!,
			r = v.cv ? ro : ri,
			la = Math.hypot(a.x - v.x, a.y - v.y),
			lb = Math.hypot(b.x - v.x, b.y - v.y);
		const A = [v.x + ((a.x - v.x) / la) * r, v.y + ((a.y - v.y) / la) * r],
			B = [v.x + ((b.x - v.x) / lb) * r, v.y + ((b.y - v.y) / lb) * r];
		for (let k = 0; k <= 5; k++)
		{
			const t = k / 5,
				mt = 1 - t;
			out.push([
				mt * mt * A[0]! + 2 * mt * t * v.x + t * t * B[0]!,
				mt * mt * A[1]! + 2 * mt * t * v.y + t * t * B[1]!,
			]);
		}
	});
	return out;
}

// The cracks and chisel marks on the top of a statue square.
function stoneTop(N: number, c: number): string
{
	const x = c % N,
		y = Math.floor(c / N),
		Rn = lcg((c * 2654435761) >>> 0);
	let s = "";
	for (let k = 0; k < 2; k++)
	{
		let u0 = 0.2 + Rn() * 0.6,
			v0 = k ? 0.85 : 0.15;
		const pts = [P(x + u0, y + v0, H)];
		for (let s2 = 0; s2 < 3; s2++)
		{
			u0 = Math.max(0.15, Math.min(0.85, u0 + (Rn() - 0.5) * 0.4));
			v0 += (k ? -1 : 1) * (0.14 + Rn() * 0.1);
			pts.push(P(x + u0, y + v0, H));
		}
		const d = `M${pts.map((p) => `${f(p[0]!)} ${f(p[1]!)}`).join("L")}`;
		s += `<path d="${d}" stroke="rgba(255,255,255,.35)" stroke-width="1.6" fill="none" transform="translate(1.5,1.5)"/><path d="${d}" stroke="#3a3632" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	}
	for (let k = 0; k < 2; k++)
	{
		const a = P(x + 0.25 + Rn() * 0.45, y + 0.25 + Rn() * 0.45, H);
		s += `<path d="M${f(a[0]!)} ${f(a[1]!)}l10 -3M${f(a[0]! + 2)} ${f(a[1]! + 4)}l10 -3" stroke="#6e6963" stroke-width="2"/>`;
	}
	return s;
}

function crown(N: number, cells: number[]): string
{
	let best = cells[0]!;
	for (const c of cells) if ((c % N) + Math.floor(c / N) < (best % N) + Math.floor(best / N)) best = c;
	const p = P((best % N) + 0.5, Math.floor(best / N) + 0.5, H);
	return crownAt(p[0]!, p[1]! - 34);
}

// Each board's raised squares, where a tap lands on top of a piece or disc rather than the floor behind it.
const raised = new WeakMap<SVGSVGElement, Set<number>>();

const rrect = (x0: number, y0: number, x1: number, y1: number, r: number): number[][] =>
{
	const pts: number[][] = [],
		arc = (cx: number, cy: number, a0: number): void =>
		{
			for (let k = 0; k <= 5; k++)
			{
				const a = a0 + ((k / 5) * Math.PI) / 2;
				pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
			}
		};
	arc(x1 - r, y0 + r, -Math.PI / 2);
	arc(x1 - r, y1 - r, 0);
	arc(x0 + r, y1 - r, Math.PI / 2);
	arc(x0 + r, y0 + r, Math.PI);
	return pts;
};
const extrude = (ol: number[][], z: number, cA: string, cB: string): string =>
{
	let t = "";
	for (let k = 0; k < ol.length; k++)
	{
		const a = ol[k]!,
			b = ol[(k + 1) % ol.length]!,
			dx = b[0]! - a[0]!,
			dy = b[1]! - a[1]!,
			L2 = Math.hypot(dx, dy) || 1,
			[rx, ry] = RN(dy / L2, -dx / L2);
		if (rx + ry <= 0.001) continue;
		const c = ry / (Math.max(0, rx) + Math.max(0, ry) || 1) > 0.5 ? cA : cB;
		t += poly(
			[P(a[0]!, a[1]!), P(b[0]!, b[1]!), P(b[0]!, b[1]!, z), P(a[0]!, a[1]!, z)],
			c,
			` stroke="${c}" stroke-width=".6"`,
		);
	}
	return t;
};
const rr = (x: number, y: number, i: number, r: number): number[][] => rrect(x + i, y + i, x + 1 - i, y + 1 - i, r);
export function render(svg: SVGSVGElement, board: IsoBoard): void
{
	let o = board;
	if (o.rot)
	{
		const k = o.rot,
			N0 = o.N,
			m = (c: number): number => DMAP(c, N0, k),
			mc = (a: number[]): number[] => a.map(m),
			mo = <
				T extends
				{
					c: number;
				},
			>(
				x: T,
			): T => (
			{
				...x,
				c: m(x.c),
			});
		o =
		{
			...o,
			pieces: o.pieces.map((p) => (
			{
				...p,
				cells: mc(p.cells),
			})),
			discs: o.discs.map(mo),
			tiles: o.tiles.map(mo),
			dots: o.dots.map(mo),
			rings: o.rings.map(mo),
			over: o.over.map(mo),
			hammers: (o.hammers ?? []).map(m),
			hamOld: (o.hamOld ?? []).map(m),
			crowns: (o.crowns ?? []).map(mc),
		};
		if (o.hbk)
			o.hbk =
			{
				...o.hbk,
				c: m(o.hbk.c),
			};
		if (o.holes) o.holes = mc(o.holes);
		if (o.present) o.present = mc(o.present);
		if (o.stone) o.stone = mc(o.stone);
		if (o.crack !== undefined && o.crack >= 0) o.crack = m(o.crack);
		if (o.falling !== undefined && o.falling >= 0) o.falling = m(o.falling);
	}
	const N = o.N,
		W = N * C * u,
		top = 1.3 * u;
	let vb = [-W - 24, -top, 2 * W + 48, N * u + TH * u + top + 24];
	const th = view.theta;
	cT = Math.cos(th);
	sT = Math.abs(th) < 1e-6 ? 0 : Math.sin(th);
	CEN = o.center ?? N / 2;
	if (o.present)
	{
		let x0 = 1e9,
			y0 = 1e9,
			x1 = -1e9,
			y1 = -1e9;
		for (const c of o.present)
		{
			const x = c % N,
				y = Math.floor(c / N);
			for (const [a, b] of [
				[x, y],
				[x + 1, y],
				[x, y + 1],
				[x + 1, y + 1],
			] as const)
				for (const z of [-TH, H + 1.25])
				{
					const q = P(a, b, z);
					x0 = Math.min(x0, q[0]!);
					x1 = Math.max(x1, q[0]!);
					y0 = Math.min(y0, q[1]!);
					y1 = Math.max(y1, q[1]!);
				}
		}
		if (o.vbx)
			for (const c of o.vbx)
			{
				const x = c % N,
					y = Math.floor(c / N);
				for (const [a, b] of [
					[x, y],
					[x + 1, y + 1],
					[x + 1, y],
					[x, y + 1],
				] as const)
				{
					const q = P(a, b, 0);
					x0 = Math.min(x0, q[0]!);
					x1 = Math.max(x1, q[0]!);
					y0 = Math.min(y0, q[1]!);
					y1 = Math.max(y1, q[1]!);
				}
			}
		vb = [x0 - 30, y0 - 20, x1 - x0 + 60, y1 - y0 + 50];
	}
	svg.setAttribute("viewBox", vb.map(f).join(" "));
	svg.style.aspectRatio = `${f(vb[2]!)}/${f(vb[3]!)}`;
	// a rounded rectangle in board coordinates, traced clockwise
	let s = "";
	if (!o.present)
	{
		const ol = rrect(0, 0, N, N, 0.28);
		s +=
			extrude(ol, -TH, "#3d2616", "#2a190e") +
			poly(
				ol.map((q) => P(q[0]!, q[1]!)),
				"#3a2416",
			);
	}
	// squares are rounded, with walnut gaps between them, like the top view
	const tile = (c: number, i: number, fill: string, ex = ""): string =>
	{
		const x = c % N,
			y = Math.floor(c / N);
		return poly(
			rr(x, y, i, Math.min(0.17, (1 - 2 * i) / 3)).map((q) => P(q[0]!, q[1]!)),
			fill,
			ex,
		);
	};
	const TG = `${svg.id || "iso"}-tg`;
	s += `<defs><linearGradient id="${TG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3e4"/><stop offset="1" stop-color="#eadcc2"/></linearGradient></defs>`;
	const HS = new Set(o.holes ?? []),
		SS = new Set(o.stone ?? []);
	const LIST = o.present
			? [...o.present].toSorted((a, b) =>
				{
					const pa = RC((a % N) + 0.5, Math.floor(a / N) + 0.5),
						pb = RC((b % N) + 0.5, Math.floor(b / N) + 0.5);
					return pa[0] + pa[1] - pb[0] - pb[1];
				})
			: [...Array(N * N).keys()],
		PRS = o.present ? new Set(o.present) : null;
	for (const c of LIST)
	{
		const x = c % N,
			y = Math.floor(c / N);
		if (PRS) s += extrude(rr(x, y, 0.05, 0.17), -TH * 0.7, "#c9b48f", "#a8936e");
		if (HS.has(c))
		{
			s +=
				poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], "#120a05") +
				poly([P(x, y), P(x + 1, y), P(x + 1, y, -TH), P(x, y, -TH)], "#2a190e", ' opacity=".8"') +
				poly([P(x, y), P(x, y + 1), P(x, y + 1, -TH), P(x, y, -TH)], "#3d2616", ' opacity=".8"');
			if (o.falling === c)
				s += `<g class="fall" style="animation-delay:-${o.fallAge ?? 0}ms">${tile(c, 0.05, "#f6ecda")}</g>`;
			continue;
		}
		if (c === o.crack)
		{
			const Rn = lcg((c * 2246822519 + 3) >>> 0);
			const cu = x + 0.35 + Rn() * 0.3,
				cv = y + 0.35 + Rn() * 0.3;
			let cr = "";
			for (let k = 0; k < 6; k++)
			{
				const ang = ((k + Rn() * 0.6) / 6) * Math.PI * 2;
				let uu = cu,
					v = cv;
				const pts = [P(uu, v)];
				for (let s2 = 0; s2 < 4; s2++)
				{
					const a2 = ang + (Rn() - 0.5) * 0.9,
						l = 0.08 + Rn() * 0.12;
					uu = Math.max(x + 0.07, Math.min(x + 0.93, uu + Math.cos(a2) * l));
					v = Math.max(y + 0.07, Math.min(y + 0.93, v + Math.sin(a2) * l));
					pts.push(P(uu, v));
				}
				cr += `<path d="M${pts.map((p) => `${f(p[0]!)} ${f(p[1]!)}`).join("L")}"/>`;
			}
			s += `<g class="quake">${tile(c, 0.05, "#ecdfc6", ' stroke="rgba(209,59,48,.55)" stroke-width="3"')}<g stroke="rgba(255,255,255,.7)" stroke-width="1" fill="none" transform="translate(1,1)">${cr}</g><g stroke="#4a3626" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">${cr}</g></g>`;
			continue;
		}
		if (SS.has(c))
		{
			const a = P(x + 0.25, y + 0.4),
				b = P(x + 0.5, y + 0.5),
				d = P(x + 0.7, y + 0.38);
			s += `${tile(c, 0.05, "#a59f97", ' stroke="#6f6a64" stroke-width="2"')}<path d="M${f(a[0]!)} ${f(a[1]!)}L${f(b[0]!)} ${f(b[1]!)}L${f(d[0]!)} ${f(d[1]!)}" stroke="#5e5953" stroke-width="2" fill="none"/>`;
			continue;
		}
		s +=
			(PRS ? "" : `<g transform="translate(0,3)">${tile(c, 0.05, "rgba(0,0,0,.35)")}</g>`) +
			tile(c, 0.05, `url(#${TG})`);
	}
	const tileMark = (t: IsoTile, ex = ""): string =>
		tile(
			t.c,
			0.14,
			t.fill ?? "none",
			` stroke="${t.stroke ?? "none"}" stroke-width="${t.sw ?? 4}"${t.dash ? ' stroke-dasharray="10 7"' : ""} opacity="${t.op ?? 1}"${ex}`,
		);
	for (const t of o.tiles) s += tileMark(t);
	for (const hc of o.hammers ?? [])
	{
		const hp = P((hc % N) + 0.5, Math.floor(hc / N) + 0.5);
		s += HAMMER(hp[0]!, hp[1]! - 10, 1.5, (o.hamOld ?? []).includes(hc));
	}
	for (const d of o.dots)
	{
		const p = P((d.c % N) + 0.5, Math.floor(d.c / N) + 0.5);
		s += `<ellipse cx="${f(p[0]!)}" cy="${f(p[1]!)}" rx="13" ry="7.5" fill="${d.color}"${d.halo ? ' stroke="#fff" stroke-width="3"' : ""} opacity="${d.halo ? 0.85 : 0.6}"/>`;
	}
	for (const r of o.rings)
	{
		const p = P((r.c % N) + 0.5, Math.floor(r.c / N) + 0.5);
		s += `<ellipse cx="${f(p[0]!)}" cy="${f(p[1]!)}" rx="34" ry="20" fill="none" stroke="${r.color ?? "#8a7357"}" stroke-width="3" stroke-dasharray="6 6"/>`;
	}
	// pieces: the same rounded outline as the top view, raised into a solid. Walls (and discs) are painted back to front;
	// tops all sit at the same height and can never be hidden by a wall, so they go on last.
	const items: (
			|
			  {
					d: number;
					t: 0;
					html: string;
			  }
			|
			  {
					d: number;
					t: 1;
					dc: IsoDisc;
			  }
		)[] = [],
		tops: string[] = [];
	const parts: IsoPiece[] = [];
	for (const pc of o.pieces)
		for (const cc of COMPS(pc.cells, N))
			parts.push(
				{
					...pc,
					cells: cc,
				},
			);
	parts.forEach((pc) =>
	{
		const col = pc.stone ? "#8f8a84" : pc.color,
			ol = outline(pc.cells, N),
			at =
				(pc.ghost ? ' opacity=".28"' : pc.op ? ` opacity="${pc.op}"` : "") +
				(pc.flash ? ` class="flash" style="animation-delay:-${pc.age ?? 0}ms"` : "");
		for (let i2 = 0; i2 < ol.length; i2++)
		{
			const a = ol[i2]!,
				b = ol[(i2 + 1) % ol.length]!,
				dx = b[0]! - a[0]!,
				dy = b[1]! - a[1]!,
				L2 = Math.hypot(dx, dy) || 1,
				[nx, ny] = RN(dy / L2, -dx / L2),
				ra = RC(a[0]!, a[1]!),
				rb = RC(b[0]!, b[1]!);
			if (nx + ny <= 0.001) continue;
			const w = Math.max(0, Math.min(1, ny / (Math.max(0, nx) + Math.max(0, ny) || 1))),
				shade = -0.28 - 0.18 * w;
			items.push(
				{
					d: (ra[0] + rb[0] + ra[1] + rb[1]) / 2,
					t: 0,
					html: `<polygon points="${[P(a[0]!, a[1]!), P(b[0]!, b[1]!), P(b[0]!, b[1]!, H), P(a[0]!, a[1]!, H)].map((q) => `${f(q[0]!)},${f(q[1]!)}`).join(" ")}" fill="${sh(col, shade)}" stroke="${sh(col, shade)}" stroke-width=".8"${at}/>`,
				},
			);
		}
		const topPoints = ol
			.map((q) =>
			{
				const r2 = P(q[0]!, q[1]!, H);
				return `${f(r2[0]!)},${f(r2[1]!)}`;
			})
			.join(" ");
		let tp = `<polygon points="${topPoints}" fill="${sh(col, 0.12)}"/>`;
		// rim light on the back edges, a faint line on the front edges
		let back = "",
			front = "";
		for (let i2 = 0; i2 < ol.length; i2++)
		{
			const a = ol[i2]!,
				b = ol[(i2 + 1) % ol.length]!,
				[nx, ny] = RN(b[1]! - a[1]!, -(b[0]! - a[0]!)),
				A = P(a[0]!, a[1]!, H),
				B = P(b[0]!, b[1]!, H),
				seg = `M${f(A[0]!)} ${f(A[1]!)}L${f(B[0]!)} ${f(B[1]!)}`;
			if (nx + ny < 0) back += seg;
			else front += seg;
		}
		tp += `<path d="${back}" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="${front}" stroke="rgba(0,0,0,.15)" stroke-width="1.5" fill="none"/>`;
		if (pc.stone) for (const c of pc.cells) tp += stoneTop(N, c);
		if (pc.hl)
			tp += `<polygon points="${topPoints}" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" opacity=".9"/>`;
		if (pc.x)
			for (const c of pc.cells)
			{
				const x = c % N,
					y = Math.floor(c / N),
					a = P(x + 0.25, y + 0.25, H),
					b = P(x + 0.75, y + 0.75, H),
					c2 = P(x + 0.75, y + 0.25, H),
					d = P(x + 0.25, y + 0.75, H);
				tp += `<path d="M${f(a[0]!)} ${f(a[1]!)}L${f(b[0]!)} ${f(b[1]!)}M${f(c2[0]!)} ${f(c2[1]!)}L${f(d[0]!)} ${f(d[1]!)}" stroke="#fff" stroke-width="5" stroke-linecap="round" class="pulse"/>`;
			}
		tops.push(`<g${at}>${tp}</g>`);
	});
	o.discs.forEach((dc) =>
	{
		const q = RC((dc.c % N) + 0.5, Math.floor(dc.c / N) + 0.5);
		items.push(
			{
				d: q[0] + q[1],
				t: 1,
				dc,
			},
		);
	});
	items.sort((a, b) => a.d - b.d || a.t - b.t);
	for (const it of items)
	{
		if (it.t === 0)
		{
			s += it.html;
			continue;
		}
		const dc = it.dc,
			b = P((dc.c % N) + 0.5, Math.floor(dc.c / N) + 0.5),
			T = [b[0]!, b[1]! - DH * u] as const,
			rx = 0.3 * 1.2247 * u,
			ry = 0.3 * (7071 / 10000) * u;
		const cls = dc.drop
			? ` class="drop" style="animation-delay:-${dc.age ?? 0}ms"`
			: dc.flash
				? ` class="flash" style="animation-delay:-${dc.age ?? 0}ms"`
				: "";
		s +=
			`<g${cls}><ellipse cx="${f(b[0]!)}" cy="${f(b[1]! + 4)}" rx="${f(rx + 4)}" ry="${f(ry + 3)}" fill="rgba(0,0,0,.25)"/><path d="M${f(T[0] - rx)} ${f(T[1])}L${f(T[0] - rx)} ${f(b[1]!)}A${f(rx)} ${f(ry)} 0 0 0 ${f(T[0] + rx)} ${f(b[1]!)}L${f(T[0] + rx)} ${f(T[1])}Z" fill="#111"/><ellipse cx="${f(T[0])}" cy="${f(T[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="#3a3a3a"/><ellipse cx="${f(T[0] - 10)}" cy="${f(T[1] - 4)}" rx="${f(rx * 0.35)}" ry="${f(ry * 0.35)}" fill="rgba(255,255,255,.18)"/>` +
			(dc.ring
				? `<ellipse cx="${f(T[0])}" cy="${f(T[1])}" rx="${f(rx + 12)}" ry="${f(ry + 8)}" fill="none" stroke="#fff" stroke-width="10"/><ellipse cx="${f(T[0])}" cy="${f(T[1])}" rx="${f(rx + 12)}" ry="${f(ry + 8)}" fill="none" stroke="${dc.ring}" stroke-width="5"/>`
				: "") +
			"</g>";
	}
	s += tops.join("");
	for (const t of o.over) s += tileMark(t, ` transform="translate(0,${-H * u})"`);
	for (const cr of o.crowns ?? []) s += crown(N, cr);
	if (o.hbk)
	{
		const hp = P((o.hbk.c % N) + 0.5, Math.floor(o.hbk.c / N) + 0.5, H);
		s += HBREAK(hp[0]!, hp[1]! - 30, o.hbk.age);
	}
	svg.innerHTML = s;
	raised.set(svg, new Set([...o.pieces.filter((p) => !p.ghost).flatMap((p) => p.cells), ...o.discs.map((d) => d.c)]));
}

// The square under a pointer on a 3D board: the top of a piece or disc first, then the floor.
export function cellAt(svg: SVGSVGElement, e: PointerEvent, N: number): number
{
	const p = svg.createSVGPoint();
	p.x = e.clientX;
	p.y = e.clientY;
	const m = svg.getScreenCTM();
	if (!m) return -1;
	const q = p.matrixTransform(m.inverse());
	const at = (z: number): number =>
	{
		const a = q.x / (C * u),
			b = (q.y + z * u) / (Sn * u),
			x = (a + b) / 2,
			y = (b - a) / 2;
		return x < 0 || y < 0 || x >= N || y >= N ? -1 : Math.floor(y) * N + Math.floor(x);
	};
	const hi = at(H);
	if (hi >= 0 && raised.get(svg)?.has(hi)) return hi;
	const lo = at(0);
	if (lo >= 0) return lo;
	return hi;
}
