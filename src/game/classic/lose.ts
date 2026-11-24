import {$, $$, $$as, $as, closest} from "../dom.ts";
import {showCode} from "./codes.ts";
import {COMMON, type Common, COMMON_LT, COMMON_T} from "./common.ts";
import {mini, xy} from "./mini.ts";
import {bit, cells, fmtCode, other, PH, type Position, type Side, SQ} from "./rules.ts";
import
{
	BSL,
	dec,
	FC,
	key,
	lCells,
	LS,
	LT,
	NAME,
	NL,
	ONE,
	opt,
	parseCode,
	posCode,
	posKey,
	ready,
	sid,
	sol,
	st,
	STD,
} from "./state.ts";

// Ways you can lose: every boxed-in position (and, on request, every lost one), told apart up to turning and
// mirroring the board, with how often each ends a game. The full list unlocks after a few finished games.

export const UNLOCK = 5;

export interface Way
{
	// The canonical key of the position, as the smallest of its turns and mirror images.
	s: string;
	// Plies until the loser is boxed in (0 when they already are).
	d: number;
	// How often it has happened to you.
	n: number;
	// How many positions it stands for.
	sym: number;
	// Its four turns, the keys of the finish-frequency tables.
	rots: Set<string>;
	rep:
	{
		m: number;
		o: number;
		a: number;
		b: number;
	} | null;
	rs: string;
	m: number;
	o: number;
	a: number;
	b: number;
	f: number;
	p10: number;
	p: number;
	p60: number;
	// Its number in the list.
	i: number;
}

let LOSE: Way[] | null = null;
let askWay: Way | null = null;
export const loseReady = (): boolean => LOSE !== null;
export function setAskWay(w: Way): void
{
	askWay = w;
}

const rotC = (c: number): number => (c === PH ? c : (c & 3) * 4 + (3 - (c >> 2))),
	rotM = (m: number): number =>
	{
		let o = 0;
		for (let c = 0; c < 16; c++) if (m & bit(c)) o |= bit(rotC(c));
		return o;
	};
function rotCanon(M0: number, O0: number, a0: number, b0: number): string
{
	let best: string | null = null,
		M = M0,
		O = O0,
		a = a0,
		b = b0;
	for (let i = 0; i < 4; i++)
	{
		const s = [M, O, Math.min(a, b), Math.max(a, b)].join(",");
		if (!best || s < best) best = s;
		M = rotM(M);
		O = rotM(O);
		a = rotC(a);
		b = rotC(b);
	}
	return best!;
}
const mirC = (c: number): number => (c === PH ? c : (c >> 2) * 4 + (3 - (c & 3))),
	mirM = (m: number): number =>
	{
		let o = 0;
		for (let c = 0; c < 16; c++) if (m & bit(c)) o |= bit(mirC(c));
		return o;
	};
function canonLose(M: number, O: number, a: number, b: number): string
{
	const x = rotCanon(M, O, a, b),
		y = rotCanon(mirM(M), mirM(O), mirC(a), mirC(b));
	return x < y ? x : y;
}

interface Tip
{
	term: number;
	termC: number;
	lost: number;
	lostC: number;
	cen:
	{
		n: number;
		w: number;
		l: number;
	}[];
	touch: number;
	winMin?: number;
	win3?: number;
	maxCor: number;
	more: string[];
}
let TIP: Tip | null = null;

// The number of squares in a mask.
function pc(x0: number): number
{
	let n = 0;
	for (let x = x0; x; x >>= 1) n += x & 1;
	return n;
}

// Facts about the L game, counted over every position the solver knows.
export function buildTip(): void
{
	const {val, dep} = sol();
	const COR = bit(0) | bit(3) | bit(12) | bit(15),
		CEN = bit(5) | bit(6) | bit(9) | bit(10);

	const t: Tip =
	{
		term: 0,
		termC: 0,
		lost: 0,
		lostC: 0,
		cen: [0, 1, 2, 3].map(() => (
		{
			n: 0,
			w: 0,
			l: 0,
		})),
		touch: LS.filter((m) => m & COR).length,
		maxCor: 0,
		more: [],
	};
	for (let m = 0; m < NL; m++)
		for (let o = 0; o < NL; o++)
		{
			if (LS[m]! & LS[o]!) continue;
			for (let a = 0; a < 16; a++)
				for (const b of BSL[a]!)
				{
					const s = sid[key(m, o, a, b)]!;
					if (s < 0) continue;
					const c = t.cen[pc(LS[m]! & CEN)]!;
					c.n++;
					if (val[s] === 1) c.w++;
					if (val[s] === -1)
					{
						c.l++;
						t.lost++;
						if (LS[m]! & COR) t.lostC++;
						if (!dep[s])
						{
							t.term++;
							if (LS[m]! & COR) t.termC++;
							const wc = pc(LS[o]! & CEN);
							t.winMin = Math.min(t.winMin ?? 9, wc);
							if (wc === 3) t.win3 = (t.win3 ?? 0) + 1;
						}
					}
				}
		}
	t.maxCor = Math.max(...LS.map((m) => pc(m & COR)));
	let maxW = 0,
		draws = 0;
	for (let s = 0; s < val.length; s++)
	{
		if (val[s] === 1) maxW = Math.max(maxW, dep[s]!);
		if (val[s] === 2) draws++;
	}
	const sp = parseCode(STD).P!,
		sv = val[sid[key(sp.L.R, sp.L.B, sp.N[0]!, sp.N[1]!)]!];
	t.more = [
		`There are ${val.length.toLocaleString()} different arrangements of the pieces, and either player can be the one to move, which makes ${(val.length * 2).toLocaleString()} positions. Rotating the board gives the same game, so only ${(val.length / 2).toLocaleString()} of those positions are truly different.`,
		`Each L can sit in ${LS.length} places: 6 spots for each of its 8 turns and flips.`,
		`The standard opening is ${sv === 2 ? "a draw" : "not a draw"} with perfect play: neither player can force a win from it.`,
		`In ${Math.round((draws / val.length) * 100)}% of positions, perfect play on both sides goes on forever. Only ${Math.round((t.lost / val.length) * 1000) / 10}% of positions are lost for the player to move.`,
		`The longest forced win takes ${(maxW + 1) / 2} of your moves. Nobody can be forced into a loss from further away than that.`,
	];
	TIP = t;
}

function renderTip(): void
{
	const el = $("#loseTip");
	if (!ready() || !TIP || st.games.filter((g) => g.w).length < UNLOCK)
	{
		el.innerHTML = "";
		return;
	}
	const t = TIP,
		{val} = sol();
	let s = '<rect width="400" height="400" rx="28" fill="#3a2416"/>';
	for (let c = 0; c < 16; c++)
	{
		const [x, y] = xy(c),
			cor = [0, 3, 12, 15].includes(c),
			cen = [5, 6, 9, 10].includes(c);
		s += `<rect x="${x + 4}" y="${y + 4}" width="92" height="92" rx="12" fill="${cor ? "#e7867d" : cen ? "#86c99f" : "#f3e8d4"}"/><text x="${x + 50}" y="${y + 52}" font-size="34" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#3a2416" opacity="${cor || cen ? 1 : 0.35}" font-family="Lexend,system-ui,sans-serif">${SQ[c]}</text>`;
	}
	const all = t.termC === t.term && t.lostC === t.lost;
	el.innerHTML = `<div class="facts"><h3 class="fh">Facts about the L game</h3><p class="muted">Unlocked by finishing ${UNLOCK} games. Every number here comes from the solver.</p><div class="tip"><svg viewBox="0 0 400 400" role="img" aria-label="Corner squares A, D, M, P in red; center squares F, G, J, K in green">${s}</svg>
  <div><h3>The center is your friend. The corners are your enemy.</h3>
  <p><b>The corners (A, D, M, P) are your enemy.</b> ${all ? `Every possible way to lose has your L touching a corner: all ${t.term} boxed-in positions, and all ${t.lost} positions that are lost with perfect play.` : `${t.termC} of ${t.term} boxed-in positions have the loser's L on a corner.`} ${t.maxCor === 1 ? "An L can never touch two corners at once, so a losing L always touches exactly one." : ""} Half of all L placements (${t.touch} of ${LS.length}) touch a corner, so when you have a choice, pick one that doesn't.</p>
  <p><b>The center (F, G, J, K) is your friend.</b> ${(t.winMin ?? 9) >= 2 ? `Every possible way to win has your L on at least two center squares: in all ${t.term} boxed-in positions, the winning L covers two of them, or three (in ${String(t.win3)} of the ${t.term}).` : ""} An L can cover at most 3 of the 4, and the more it covers, the better your chances. Share of positions where you can force a win, by how many center squares your L covers:</p>
  <div class="crows">${t.cen.map((c, i) => `<div class="crow2"><span>${i} center square${i === 1 ? "" : "s"}</span><div class="bar"><i style="width:${(c.w / c.n) * 100}%"></i></div><b>${Math.round((c.w / c.n) * 100)}%</b></div>`).join("")}</div>
  <p class="muted" style="font-size:13px">${t.cen[3]!.l === 0 ? "With 3 center squares covered you are never in a lost position. " : ""}Checked against all ${(val.length * 2).toLocaleString()} positions by the solver.</p></div></div>
  <ul>${t.more.map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
}

const lose = (): Way[] => LOSE!;
// rarity compared with the most common way: a way a third as common as the top one is ultra rare
const topP = (): number =>
	Math.max(
		...lose()
			.filter((x) => !x.d)
			.map((x) => x.p),
		1e-9,
	);
// when every way ends about the same share of games (the T game), there is no rarity scale
export const flatW = (): boolean =>
{
	const ps = lose()
		.filter((x) => !x.d)
		.map((x) => x.p);
	return ps.length > 0 && Math.min(...ps) / Math.max(...ps) > 0.85;
};
export function cLabel(w: Way): string
{
	const r = w.p / topP();
	return r < 0.4
		? "Ultra rare"
		: r < 0.5
			? "Very rare"
			: r < 0.6
				? "Rare"
				: r < 0.75
					? "Uncommon"
					: r < 0.9
						? "Common"
						: "Very common";
}

export function buildLose(): void
{
	const {val, dep} = sol();
	const map = new Map<string, Way>(),
		M1 = ONE ? -1 : cells(lCells(12, 1, 0)!),
		CM: Common = LT ? COMMON_LT : ONE ? COMMON_T : COMMON;
	for (let m = 0; m < NL; m++)
		for (let o = 0; o < NL; o++)
		{
			if (LS[m]! & LS[o]!) continue;
			for (let a = 0; a < 16; a++)
				for (const b of BSL[a]!)
				{
					const s = sid[key(m, o, a, b)]!;
					if (s < 0 || val[s] !== -1) continue;
					const c = canonLose(LS[m]!, LS[o]!, a, b),
						str = [LS[m], LS[o], a, b].join(",");
					if (!map.has(c))
						map.set(
							c,
							{
								s: c,
								d: dep[s]!,
								n: 0,
								sym: 0,
								rots: new Set(),
								rep: null,
								rs: "",
								m: 0,
								o: 0,
								a: 0,
								b: 0,
								f: 0,
								p10: 0,
								p: 0,
								p60: 0,
								i: 0,
							},
						);
					const w = map.get(c)!;
					w.sym++;
					w.rots.add(rotCanon(LS[m]!, LS[o]!, a, b));
					// display: the losing L at M1 when that shape allows, otherwise covering corner M
					const rank = String(LS[m] === M1 ? 0 : LS[m]! & bit(12) ? 1 : 2) + str;
					if (!w.rep || rank < w.rs)
					{
						w.rep =
						{
							m,
							o,
							a,
							b,
						};
						w.rs = rank;
					}
				}
		}
	const ways = [...map.values()];
	for (const w of ways)
	{
		w.m = w.rep!.m;
		w.o = w.rep!.o;
		w.a = w.rep!.a;
		w.b = w.rep!.b;
	}
	const T = ways.filter((w) => !w.d),
		F = ways.filter((w) => w.d);
	for (const w of T)
	{
		let f = 0,
			p10 = 0,
			p = 0,
			p60 = 0;
		for (const rk of w.rots)
		{
			const c = CM[rk] ?? [0, 0, 0, 0];
			f += c[0];
			p10 += c[1];
			p += c[2];
			p60 += c[3];
		}
		w.f = f;
		w.p10 = p10;
		w.p = p;
		w.p60 = p60;
	}
	const boxed = T.toSorted((a, b) => a.p - b.p || (a.s < b.s ? -1 : 1)),
		lost = F.toSorted((a, b) => a.d - b.d || (a.s < b.s ? -1 : 1));
	boxed.forEach((w, i) =>
	{
		w.i = i + 1;
	});
	lost.forEach((w, i) =>
	{
		w.i = i + 1;
	});
	LOSE = [...boxed, ...lost];
}

const wayIdx = (): Map<string, Way> => new Map(lose().map((w) => [w.s, w]));
export function wayOf(P: Pick<Position, "L" | "N">, loser: Side): Way | null
{
	if (!LOSE) return null;
	return wayIdx().get(canonLose(LS[P.L[loser]]!, LS[P.L[other(loser)]]!, P.N[0]!, P.N[1]!)) ?? null;
}
export const wayTag = (w: Way | null): string =>
	w && !w.d ? `Way ${w.i} (${flatW() ? "" : `${cLabel(w).toLowerCase()}, `}${w.p.toFixed(1)}% of games)` : "";

export interface Match
{
	w: Way;
	loser: Side;
	winner: Side;
	over: boolean;
	youWin: boolean | null;
	P: Pick<Position, "L" | "N">;
}

// The way the game on the board is ending, if it is lost for someone.
export function nowMatch(): Match | null
{
	if (!ready() || !LOSE) return null;
	const {G} = st,
		{val} = sol();
	const idx = new Map(LOSE.map((w) => [w.s, w]));
	let loser: Side | null = null;
	if (G.over) loser = other(G.over);
	else if (G.phase === "L")
	{
		const t = G.turn,
			s = sid[key(G.L[t], G.L[other(t)], G.N[0]!, G.N[1]!)]!;
		if (s >= 0 && val[s] === -1) loser = t;
	}
	if (!loser) return null;
	const w = idx.get(canonLose(LS[G.L[loser]]!, LS[G.L[other(loser)]]!, G.N[0]!, G.N[1]!));
	if (!w) return null;
	const youSide = opt.mode === "cpu" ? opt.human : null;
	return {
		w,
		loser,
		winner: other(loser),
		over: !!G.over,
		youWin: youSide ? other(loser) === youSide : null,
		P:
		{
			L:
			{
				...G.L,
			},
			N: [...G.N],
		},
	};
}

export function nowCaption(m: Match): string
{
	const wn = m.youWin === null ? NAME[m.winner] : m.youWin ? "You" : "The computer",
		ln = m.youWin === null ? NAME[m.loser] : m.youWin ? "the computer" : "you";
	return m.over
		? `${wn} won ${m.w.d ? "" : "this way: "}this is <b>Way ${m.w.i}</b> of the ${lose().filter((x) => !x.d).length} ways to box someone in, with ${ln} stuck. ${flatW() ? `It ends ${m.w.p.toFixed(1)}% of games.` : `It is ${cLabel(m.w).toLowerCase()} (${m.w.p.toFixed(1)}% of games).`}`
		: `${wn} ${wn === "You" ? "are" : "is"} winning: this position is <b>Lost ${m.w.i}</b>. With perfect play, ${ln} will be boxed in within ${m.w.d / 2} more move${m.w.d > 2 ? "s" : ""}.`;
}

export function renderLose(): void
{
	renderTip();
	const fin = st.games.filter((g) => g.w).length,
		body = $("#loseBody");
	if (fin < UNLOCK)
	{
		$("#loseTglWrap").hidden = true;
		$("#loseSum").textContent = "A full catalog of every boxed-in position in the game.";
		const A0 = askWay;
		askWay = null;
		body.innerHTML =
			(A0 && ready()
				? `<div class="nowbox"><div class="lcard now"><div class="lh"><b>Way ${A0.i}</b></div>${mini(
						posKey(
							{
								L:
								{
									R: A0.m,
									B: A0.o,
								},
								N: [A0.a, A0.b],
							},
						),
						null,
					)}</div><p><b>Way ${A0.i}</b> ${flatW() ? `ends ${A0.p.toFixed(1)}% of finished games, about the same as every other way.` : `is <b>${cLabel(A0).toLowerCase()}</b>, ending ${A0.p.toFixed(1)}% of finished games.`} The full list unlocks after ${UNLOCK} finished games.</p></div>`
				: "") +
			`<div class="lock"><b>Locked: finish ${UNLOCK - fin} more game${UNLOCK - fin > 1 ? "s" : ""} to open it</b><div class="bar"><i style="width:${(fin / UNLOCK) * 100}%"></i></div><span class="muted">${fin} of ${UNLOCK} games finished. Unfinished games don't count.</span></div>`;
		return;
	}
	if (!ready() || !LOSE)
	{
		body.innerHTML = '<p class="muted">Working out every losing position…</p>';
		return;
	}
	$("#loseTglWrap").hidden = false;
	$("#loseCtl").hidden = false;
	{
		const fs = document.querySelector<HTMLFieldSetElement>("#loseCtl fieldset");
		if (fs) fs.hidden = flatW();
	}
	const you: Side = opt.mode === "cpu" ? opt.human : "R",
		them = other(you);
	for (const w of LOSE) w.n = 0;
	const idx = new Map(LOSE.map((w) => [w.s, w]));
	for (const g of st.games)
	{
		if (!g.w) continue;
		const loser = other(g.w);
		if (g.h && g.h !== loser) continue;
		const P = dec(g.p[g.p.length - 1]!);
		const w = idx.get(canonLose(LS[P.L[loser]]!, LS[P.L[g.w]]!, P.N[0]!, P.N[1]!));
		if (w?.d === 0) w.n++;
	}
	const term = LOSE.filter((w) => w.d === 0),
		hit = term.filter((w) => w.n).length,
		all = $as("#loseAll", HTMLInputElement).checked;
	const symCount = term.reduce((s, w) => s + w.sym, 0);
	$("#loseSum").textContent =
		(LT
			? `The 16,576 positions, each with either player to move, make the game's 33,152 positions. In ${symCount} of them the player to move is boxed in. Copies that are just the board turned or mirrored are shown once.`
			: ONE
				? `The 1,088 positions, each with either player to move, make the game's 2,176 positions. In ${symCount} of them the player to move is boxed in. Copies that are just the board turned or mirrored are shown once, with the losing T covering corner M when its shape allows.`
				: `The 18,368 positions, each with either player to move, make the game's 36,736 positions. In ${symCount} of them the player to move is boxed in. Copies that are just the board turned or mirrored are shown once, with the losing L placed at M1 (or covering corner M when its shape can't sit at M1).`) +
		` That leaves these ${term.length}${flatW() ? `. Each one ends about the same share of games (around ${Math.round(100 / term.length)}%), so there is no rarity scale.` : ", numbered from rarest (Way 1) to most common."} You have been caught by ${hit} of them so far.`;
	const NOW = nowMatch(),
		ASK = askWay;
	askWay = null;
	const card = (w: Way, actual?: Match): string =>
	{
		let P: Pick<Position, "L" | "N">, code: string;
		if (actual)
		{
			P = actual.P;
			code = posCode(P, actual.loser);
		}
		else
		{
			P =
			{
				L:
				{
					R: you === "R" ? w.m : w.o,
					B: you === "R" ? w.o : w.m,
				},
				N: [w.a, w.b],
			};
			code = posCode(P, you);
		}
		const isNow = NOW?.w === w,
			isAsk = ASK === w;
		return `<button class="lcard${w.n ? " hit" : ""}${isNow || isAsk ? " now" : ""}" id="way${actual ? "x" : ""}${w.i}" data-code="${code}" title="Load ${fmtCode(code)} in the decoder"><div class="lh"><b>${w.d ? "Lost" : "Way"} ${w.i}</b>${isNow ? '<span class="nowb">Right now</span>' : w.n ? `<span class="hitb">You ×${w.n}</span>` : ""}</div>${mini(posKey(P), null)}<span class="lc">${fmtCode(code)}</span>${w.d ? "" : flatW() ? `<span class="cmt">${w.p.toFixed(1)}% of games</span>` : `<span class="cm"><i style="width:${Math.min(100, (w.p / topP()) * 100)}%"></i></span><span class="cmt">${cLabel(w)} · ${w.p.toFixed(1)}% of games</span>`}</button>`;
	};
	let html = `<div class="lkey"><span><i style="background:${FC[you]}"></i>your L (${opt.mode === "cpu" ? "you" : NAME[you]}, to move and stuck)</span><span><i style="background:${FC[them]}"></i>the opponent's L</span><span><i style="background:#d13b30"></i>red border: it has happened to you</span></div>`;
	if (NOW)
		html += `<h3>On the board right now</h3><div class="nowbox">${card(NOW.w, NOW)}<p>${nowCaption(NOW)} It is outlined in blue in the list below${NOW.w.d && !all ? " once you tick the box above" : ""}, shown there from a rotated angle if needed.</p></div>`;
	if (ASK && NOW?.w !== ASK)
		html += `<h3>The way you picked</h3><div class="nowbox">${card(ASK)}<p><b>Way ${ASK.i}</b> ${flatW() ? `ends ${ASK.p.toFixed(1)}% of finished games, about the same as every other way.` : `is <b>${cLabel(ASK).toLowerCase()}</b>, ending ${ASK.p.toFixed(1)}% of finished games.`} ${ASK.f} different moves anywhere in the game finish this way.${ASK.n ? ` It has caught you ${ASK.n} time${ASK.n > 1 ? "s" : ""}.` : ""}</p></div>`;
	const srt = $$as("input[name=lsort]", HTMLInputElement).find((i) => i.checked)?.value ?? "rare",
		terms = [...term].toSorted((a, b) => (srt === "rare" ? a.i - b.i : b.i - a.i));
	html += `<h3>Boxed in: no legal place for your L (${term.length})</h3><p class="muted" style="max-width:70ch">How common each way is comes from the complete tree of every possible move from every position: 18,368 positions and 1,632,800 moves. The percentage is how often a finished game ends that way when both players pick the best move 70% of the time and slip 30% of the time. The order barely changes at 10% or 60% slips. With completely random play, they are all equally likely.</p><div class="lgrid">${terms.map((w) => card(w)).join("")}</div>`;
	if (all)
		for (const d of [2, 4, 6, 8])
		{
			const ws = LOSE.filter((w) => w.d === d);
			if (ws.length)
				html += `<h3>Lost with perfect play: the opponent can box you in within ${d / 2} more move${d > 2 ? "s" : ""} (${ws.length})</h3><div class="lgrid">${ws.map((w) => card(w)).join("")}</div>`;
		}
	body.innerHTML = html;
}

export function initLose(): void
{
	$("#loseAll").addEventListener("change", renderLose);
	$$("input[name=lsort]").forEach((i) =>
	{
		i.addEventListener("change", renderLose);
	});
	$("#loseBody").addEventListener("click", (e) =>
	{
		const b = closest(e, ".lcard");
		if (!b) return;
		$as("#codeIn", HTMLInputElement).value = fmtCode(b.dataset["code"]!);
		showCode();
		$("#codes").scrollIntoView(
			{
				behavior: "smooth",
				block: "start",
			},
		);
	});
}
