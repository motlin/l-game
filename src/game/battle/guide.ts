import {$} from "../dom.ts";
import {LPATH} from "../geometry.ts";
import {PIECE} from "../piece.ts";
import {crackTile, shapes, statue, stoneFloor, xy} from "./art.ts";
import {ARMW, encL6, N, NC, PL, qFmt, sqN, START_L} from "./rules.ts";

// The battle's guide: the pictures of real checkmates and weak positions, the risk bars, and the code figure.

interface Trap
{
	name: "corner" | "statue" | "center" | "edge";
	L: number[];
	B: number[];
	dead: number[];
	victim: number;
	killer: number;
}
const TRAPS: Trap[] = [
	{
		name: "corner",
		L: [112, 122, 120, 58],
		B: [13, 16, 32, 11],
		dead: [],
		victim: 2,
		killer: 0,
	},
	{
		name: "statue",
		L: [91, 13, 62, 45],
		B: [32, 35, 17, 24],
		dead: [1],
		victim: 0,
		killer: 2,
	},
	{
		name: "center",
		L: [90, 102, 30, 74],
		B: [12, 11, 17, 35],
		dead: [],
		victim: 2,
		killer: 0,
	},
	{
		name: "edge",
		L: [70, 78, 144, 113],
		B: [11, 3, 24, 29],
		dead: [],
		victim: 1,
		killer: 2,
	},
];

const WEAK = [
	{
		L: [47, 51, 39, 116],
		B: [22, 16, 10, 0],
		alive: [1, 1, 1, 0],
		holes: [3, 7, 5],
		stone: [] as number[],
		crack: 0,
		mob0: 1,
	},
	{
		L: [120, 126, 48, 73],
		B: [31, 14, 29, 2],
		alive: [1, 1, 1, 1],
		holes: [] as number[],
		stone: [] as number[],
		crack: -1,
		mob0: 3,
	},
	{
		L: [135, 110, 83, 157],
		B: [34, 6, 1, 28],
		alive: [1, 1, 1, 1],
		holes: [] as number[],
		stone: [] as number[],
		crack: 8,
		mob0: 4,
	},
	{
		L: [72, 62, 31, 28],
		B: [27, 7, 35, 33],
		alive: [1, 1, 1, 1],
		holes: [34, 6, 1],
		stone: [] as number[],
		crack: 20,
		mob0: 6,
	},
];

const RISK: [string, number][] = [
	["1 to 2", 66],
	["3 to 5", 15.6],
	["6 to 9", 10.6],
	["10 to 14", 4.2],
	["15 or more", 1.5],
];

const floor = (): string =>
{
	let s = "";
	for (let c = 0; c < NC; c++)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/>`;
	}
	return s;
};

export function drawTraps(COLS: string[], nm: (q: number) => string): void
{
	if (PIECE === "T") return;
	const CN = (q: number): string => `<b style="color:${COLS[q]}">●</b> ${nm(q)}'s`,
		CAP: Record<Trap["name"], (v: Trap) => string> =
		{
			corner: (v) =>
				`<b>Corner trap</b>${CN(v.victim)} L sat against a corner, so two of its sides were already walls. A blocker and ${CN(v.killer)} L closed the rest.`,
			statue: (v) =>
				`<b>Statue wall</b>${CN(v.victim)} L parked beside a statue that will never move. ${CN(v.killer)} L only had to close the other side.`,
			center: (v) =>
				`<b>Crowded middle</b>${CN(v.victim)} L was in the middle and touched no edge, but other L's and blockers were packed all around it.`,
			edge: (v) =>
				`<b>Edge squeeze</b>Along an edge, ${CN(v.victim)} L had half its exits gone. Blockers sealed the others for ${CN(v.killer)} L.`,
		};
	$("#qtraps").innerHTML = TRAPS.map((v) =>
	{
		let s = `<defs><linearGradient id="qstone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4bfb7"/><stop offset=".5" stop-color="#97928b"/><stop offset="1" stop-color="#74706a"/></linearGradient></defs><rect width="600" height="600" rx="30" fill="#3a2416"/>${floor()}`;
		v.L.forEach((j, q) =>
		{
			const dead = v.dead.includes(q);
			s += dead ? statue(PL[j]!, j * 4 + q) : `<g fill="${COLS[q]}">${shapes(PL[j]!)}</g>`;
			if (q === v.victim)
				for (const c of PL[j]!)
				{
					const [x, y] = xy(c);
					s += `<path d="M${x + 32} ${y + 32}l36 36M${x + 68} ${y + 32}l-36 36" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`;
				}
		});
		for (const c of v.B)
		{
			const [x, y] = xy(c);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="24" fill="#151515"/>`;
		}
		return `<div class="qtrap"><svg viewBox="0 0 600 600" aria-hidden="true">${s}</svg>${CAP[v.name](v)}</div>`;
	}).join("");
}

const edge = (c: number): boolean =>
{
	const r = Math.floor(c / N),
		k = c % N;
	return r === 0 || r === N - 1 || k === 0 || k === N - 1;
};
export function drawWeak(COLS: string[]): void
{
	if (PIECE === "T") return;
	$("#qweak").innerHTML = WEAK.map((v) =>
	{
		const cs = PL[v.L[0]!]!,
			nb = new Set<number>();
		for (const x of cs)
		{
			const r = Math.floor(x / N),
				k = x % N;
			for (const [dr, dk] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			] as const)
			{
				const rr = r + dr,
					kk = k + dk;
				if (rr >= 0 && rr < N && kk >= 0 && kk < N && !cs.includes(rr * N + kk)) nb.add(rr * N + kk);
			}
		}
		let s =
			'<defs><linearGradient id="qstone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4bfb7"/><stop offset="1" stop-color="#74706a"/></linearGradient><linearGradient id="qsf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3ada5"/><stop offset="1" stop-color="#8e8982"/></linearGradient></defs><rect width="600" height="600" rx="30" fill="#3a2416"/>';
		for (let c = 0; c < NC; c++)
		{
			const [x, y] = xy(c);
			if (v.holes.includes(c))
				s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#140c07"/>`;
			else if (c === v.crack) s += crackTile(x, y, c, v.stone.includes(c));
			else if (v.stone.includes(c)) s += stoneFloor(x, y, c, "");
			else s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/>`;
		}
		const statueCells: number[] = [];
		v.L.forEach((j, q) =>
		{
			if (v.alive[q]) s += `<g fill="${COLS[q]}">${shapes(PL[j]!)}</g>`;
			else
			{
				const rc = PL[j]!.filter((c) => !v.holes.includes(c) && !v.stone.includes(c));
				statueCells.push(...rc);
				if (rc.length) s += statue(rc, j * 4 + q);
			}
		});
		for (const c of v.B)
		{
			const [x, y] = xy(c);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="24" fill="#151515"/>`;
		}
		s += `<path d="${LPATH(cs, N, 100, 3, 22, 10)}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="14 8"/>`;
		const why: string[] = [];
		if (statueCells.some((c) => nb.has(c))) why.push("a statue");
		if (v.holes.some((c) => nb.has(c)) || nb.has(v.crack)) why.push("a hole or the cracking tile");
		const bk = v.B.filter((c) => nb.has(c)).length;
		if (bk) why.push(`${bk} blocker${bk > 1 ? "s" : ""}`);
		if (cs.some(edge)) why.push("the edge");
		return `<div class="qtrap"><svg viewBox="0 0 600 600" aria-hidden="true">${s}</svg><b>${v.mob0} place${v.mob0 === 1 ? "" : "s"} to go</b>${why.length ? `Touching ${why.join(", ").replace(/, ([^,]*)$/, " and $1")}. ` : ""}It was boxed in within the next round.</div>`;
	}).join("");
}

// The lettered board, the opening's code explained, and the risk bars.
export function drawGuide(openingCode: string): void
{
	let s = '<rect width="600" height="600" rx="30" fill="#3a2416"/>';
	for (let c = 0; c < NC; c++)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="#f6ecda"/><text x="${x + 50}" y="${y + 52}" font-size="34" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#3a2416" font-family="Lexend,system-ui,sans-serif">${sqN(c)}</text>`;
	}
	$("#qgridFig").innerHTML =
		`<svg viewBox="0 0 600 600" role="img" aria-label="6 by 6 board with squares A1 to F6">${s}</svg>`;
	const e1 = encL6(START_L[0]!),
		dg = Number(e1[2]);
	$("#qexCode").textContent = qFmt(openingCode);
	$("#qexTxt").innerHTML =
		`That is the opening: <b class="cd">1</b> means player 1 moves. <b class="cd">${e1}</b> is player 1's L: its corner is ${e1.slice(0, 2)}, the long arm runs ${ARMW[(dg - 1) >> 1]}, and digit ${e1[2]} says the foot is on your ${dg % 2 ? "right" : "left"}. The last four pairs are the blockers in the corners, A1, A6, F1 and F6.`;
	$("#qrisk").innerHTML = RISK.map(
		([k, v]) =>
			`<div class="rbar"><span>${k}</span><div class="bar"><i style="width:${(v / 70) * 100}%"></i></div><b>${v < 10 ? v.toFixed(1) : Math.round(v)}%</b></div>`,
	).join("");
}
