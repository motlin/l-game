import {ODDS} from "../art.ts";
import {$, $$as, $as, parseJSON} from "../dom.ts";
import {DMAP, LPATH} from "../geometry.ts";
import {type IsoBoard, cellAt as isoCellAt, render as isoRender} from "../iso.ts";
import {removeItem, setItem} from "../storage.ts";
import {view, VIEW_CHANGED} from "../view.ts";
import {initCodes, showCode, startTxt} from "./codes.ts";
import {applyColors, initColors, shade, swapPlayers} from "./colors.ts";
import
{
	buildLose,
	buildTip,
	cLabel,
	flatW,
	initLose,
	loseReady,
	nowCaption,
	nowMatch,
	renderLose,
	UNLOCK,
	type Way,
	wayOf,
} from "./lose.ts";
import {lShapes, mini, setTurn, xy} from "./mini.ts";
import {bit, cells, fmtCode, type Move, other, PH, type Position, type Side} from "./rules.ts";
import {replies, solve, trapShare} from "./solver.ts";
import
{
	after,
	blockedFor,
	board,
	colOf,
	COL,
	curKeys,
	FC,
	hooks,
	humanTurn,
	isEmpty,
	LIDX,
	legalL,
	load,
	LS,
	NAME,
	opt,
	optionsFor,
	parseCode,
	pick,
	posCode,
	posKey,
	ready,
	rotP,
	save,
	saveGames,
	score,
	SHP,
	snap,
	sol,
	st,
	stateOf,
	STD,
} from "./state.ts";
import {openTree, initTree, renderTree} from "./tree.ts";
import {findTutPos, initTutorial, renderCoach, showIntro} from "./tutorial.ts";

// The 2-player game: the flow of a game, the computer player, hints, input on the board, and drawing it.

let selN = -1,
	wasSel = false,
	drag = false,
	flashL: Side | null = null,
	lastN:
	{
		from: number;
		to: number;
	} | null = null,
	lastL:
	{
		t: Side;
		m: number;
	} | null = null,
	gid = 0,
	msgT = 0;

// ---- game history (every game you play, saved in this browser)
function record(w: Side | null): void
{
	const p = curKeys();
	if (p.length < 2) return;
	st.games.push(
		{
			p,
			w,
			s: st.gameStart,
			h: opt.mode === "cpu" ? opt.human : null,
			d: Date.now(),
		},
	);
	if (st.games.length > 400) st.games = st.games.slice(-400);
	saveGames();
}
function saveCur(): void
{
	try
	{
		if (st.G.over || st.G.tut || st.hist.length < 2) removeItem("lgame-cur");
		else
			setItem(
				"lgame-cur",
				JSON.stringify(
					{
						s: st.gameStart,
						p: curKeys(),
						h: opt.mode === "cpu" ? opt.human : null,
					},
				),
			);
	}
	catch
	{
		// Storage is unavailable, so an unfinished game is not kept.
	}
}

// ---- flow
function newGame(code?: string, tut?: boolean): void
{
	stopHint();
	if (!st.G.over && !st.G.tut && st.hist.length > 1) record(null);
	if (opt.mode === "pvp" && opt.randFirst && !tut)
	{
		if (Math.random() < 0.5) swapPlayers();
		$("#firstTxt").textContent = `Picked at random: ${NAME.R} goes first.`;
	}
	gid++;
	st.busy = false;
	let pc = parseCode(code ?? opt.start ?? STD);
	if (!pc.P) pc = parseCode(STD);
	st.gameStart = pc.code!;
	st.G = pc.P!;
	st.G.tut = !!tut;
	if (!legalL(st.G.turn).length) st.G.over = other(st.G.turn);
	st.hist = [snap()];
	st.sel = [];
	selN = -1;
	st.hintMv = null;
	flashL = null;
	lastN = null;
	lastL = null;
	saveCur();
	render();
	renderTree();
	maybeAI();
}

function endTurn(): void
{
	const {G} = st;
	stopHint();
	G.turn = other(G.turn);
	G.phase = "L";
	selN = -1;
	st.sel = [];
	st.hintMv = null;
	st.hist.push(snap());
	if (!legalL(G.turn).length)
	{
		G.over = other(G.turn);
		if (!G.tut)
		{
			if (opt.mode === "cpu") score[G.over === opt.human ? "you" : "cpu"]++;
			else score[G.over]++;
			save();
			record(G.over);
		}
	}
	saveCur();
	render();
	renderTree();
	maybeAI();
}

// The computer picks the best move with probability p, otherwise any legal move.
function chooseMove(p: number | undefined, t: Side): Move
{
	const all = legalL(t).flatMap((j) => optionsFor(t, j));
	return Math.random() < (p ?? Number.NaN) ? pick(all, true) : all[(Math.random() * all.length) | 0]!;
}
const STRENGTH: Record<string, number> =
{
	easy: 0.2,
	medium: 0.65,
	hard: 1,
};

function maybeAI(): void
{
	if (opt.mode !== "cpu" || st.G.over || st.G.turn === opt.human) return;
	st.busy = true;
	render();
	const id = gid;
	const go = (): void =>
	{
		if (id !== gid) return;
		if (!ready())
		{
			window.setTimeout(go, 100);
			return;
		}
		const {G} = st,
			t = G.turn,
			mv = chooseMove(STRENGTH[opt.level], t);
		lastL =
		{
			t,
			m: LS[G.L[t]]!,
		};
		G.L[t] = mv.j;
		G.phase = "N";
		flashL = t;
		lastN = null;
		render();
		window.setTimeout(
			() =>
			{
				if (id !== gid) return;
				if (mv.ni >= 0)
				{
					lastN =
					{
						from: G.N[mv.ni]!,
						to: mv.to!,
					};
					G.N[mv.ni] = mv.to!;
				}
				st.busy = false;
				endTurn();
				window.setTimeout(() =>
				{
					flashL = null;
				}, 500);
			},
			mv.ni >= 0 ? 700 : 400,
		);
	};
	window.setTimeout(go, 650);
}

function msg(t: string): void
{
	const el = $("#instr");
	el.textContent = t;
	el.classList.add("err");
	clearTimeout(msgT);
	msgT = window.setTimeout(() =>
	{
		el.classList.remove("err");
		render();
	}, 1800);
}

function tryCommit(): void
{
	const {G} = st,
		t = G.turn,
		j = LIDX.get(cells(st.sel));
	st.sel = [];
	if (j !== undefined && SHP[j] !== SHP[G.L[t]]) msg(`Your piece is ${SHP[G.L[t]] ? "a T" : "an L"}. Try again.`);
	else if (j === undefined) msg("Those four squares don't make an L. Try again.");
	else if (j === G.L[t]) msg(`Your ${SHP[G.L[t]] ? "T" : "L"} has to end up somewhere new.`);
	else
	{
		lastL =
		{
			t,
			m: LS[G.L[t]]!,
		};
		G.L[t] = j;
		G.phase = "N";
		st.hintMv = null;
		lastN = null;
		flashL = null;
	}
	render();
}

function moveNeutral(i: number, c: number): void
{
	lastN =
	{
		from: st.G.N[i]!,
		to: c,
	};
	st.G.N[i] = c;
	endTurn();
}

// ---- hints: hold the button to see the best move as a ghost; a quick tap shows it briefly
let hintAnim:
	{
		mv: Move;
		t: Side;
		timer: number;
		why: string;
	} | null = null,
	hintDown = 0;
function stopHint(): void
{
	if (hintAnim)
	{
		clearTimeout(hintAnim.timer);
		hintAnim = null;
	}
}
function startHint(): void
{
	if (!humanTurn() || !ready()) return;
	const {G} = st,
		{val, dep} = sol();
	st.sel = [];
	stopHint();
	const t = G.turn;
	const mv = G.phase === "L" ? pick(legalL(t).flatMap((j) => optionsFor(t, j))) : pick(optionsFor(t, G.L[t]));
	st.hintMv = null;
	if (G.phase === "N" && mv.ni < 0)
	{
		msg("Best here: leave both discs and end your turn.");
		render();
		return;
	}
	const v = val[mv.s],
		d = dep[mv.s]!,
		[ra, rb] = replies(st.sol, mv.s),
		n = rb - ra;
	let why: string;
	if (v === -1)
		why =
			d === 0
				? "It boxes them in right now."
				: `It forces a win in ${(d + 1) / 2} more move${d > 1 ? "s" : ""}, the fastest way.`;
	else if (v === 2)
	{
		const bad = Math.round(trapShare(st.sol, mv.s, (x) => val[x] === 1) * n);
		why = `Nobody can force a win from here, so this keeps the draw and sets the best trap: ${bad} of their ${n} possible replies would hand you a forced win.`;
	}
	else
	{
		const ok = Math.round(trapShare(st.sol, mv.s, (x) => val[x] !== -1) * n);
		why = `You're lost against perfect play, but this holds out longest${ok ? ` and ${ok} of their ${n} replies would let you escape` : ""}.`;
	}
	hintAnim =
	{
		mv,
		t,
		timer: 0,
		why,
	};
	hintDown = Date.now();
	render();
}
function endHint(): void
{
	if (!hintAnim || hintAnim.timer) return;
	if (Date.now() - hintDown < 300)
	{
		hintAnim.timer = window.setTimeout(() =>
		{
			stopHint();
			render();
		}, 1500);
		return;
	}
	stopHint();
	render();
}

// ---- odds: chance the player to move wins if both play well but sometimes slip (looks one move ahead, then trusts the
// solver)
function leafP(s: number): number
{
	const {val, dep} = sol(),
		v = val[s],
		d = dep[s]!;
	return v === 1 ? 0.8 + 0.2 / (1 + d / 4) : v === -1 ? 0.2 - 0.2 / (1 + d / 4) : 0.5;
}
const it = (
	r: number,
	b: number,
):
{
	color: string;
	label: string;
	p: number;
}[] => [
	{
		color: FC.R,
		label: NAME.R,
		p: r,
	},
	{
		color: FC.B,
		label: NAME.B,
		p: b,
	},
];
function oddsC(): void
{
	const {G} = st;
	if (G.over)
	{
		ODDS("oddsC", [
			{
				color: FC[G.over],
				label: NAME[G.over],
				p: 1,
			},
		]);
		return;
	}
	if (!ready() || G.phase !== "L") return;
	const t = G.turn,
		s = stateOf(G, t);
	if (s < 0) return;
	const {off, ed} = sol(),
		a = off[s]!,
		b = off[s + 1]!;
	let pm: number;
	if (a === b) pm = 0;
	else
	{
		let mx = 0,
			sum = 0;
		for (let i = a; i < b; i++)
		{
			const x = 1 - leafP(ed[i]!);
			sum += x;
			if (x > mx) mx = x;
		}
		pm = 0.75 * mx + (0.25 * sum) / (b - a);
	}
	pm = Math.max(0, Math.min(1, pm));
	ODDS("oddsC", t === "R" ? it(pm, 1 - pm) : it(1 - pm, pm));
}

// ---- drawing
const svg = (): SVGSVGElement => $as("#board", SVGSVGElement);

const drawL = (m: number, t: Side, cls = "", age = 0): string =>
	`<g class="${cls}"${cls.includes("flash") ? ` style="animation-delay:-${age}ms"` : ""}><g transform="translate(0,6)" fill="rgba(0,0,0,.3)">${lShapes(m)}</g><g fill="url(#g${t})">${lShapes(m)}</g><g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" transform="translate(0,1.5)" clip-path="none">${lShapes(m)}</g><g fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2">${lShapes(m)}</g></g>`;
const disc = (c: number, cls = "", age = 0): string =>
{
	const [x, y] = xy(c);
	return `<g class="${cls}"${cls ? ` style="animation-delay:-${age}ms"` : ""}><g transform="translate(0,6)"><circle cx="${x + 50}" cy="${y + 50}" r="25" fill="rgba(0,0,0,.3)"/></g><circle cx="${x + 50}" cy="${y + 50}" r="25" fill="url(#gN)"/><g transform="translate(-7,-8)" data-sx="-7" data-sy="-8"><circle cx="${x + 50}" cy="${y + 50}" r="7" fill="rgba(255,255,255,.18)"/></g></g>`;
};

let lastNSeen:
	{
		from: number;
		to: number;
	} | null = null,
	lastNT = 0,
	flashLSeen: Side | null = null,
	flashLT = 0;

// The squares of a placement mask.
const mc = (m: number): number[] => [...Array(16).keys()].filter((c) => m & bit(c));

// Draws the board and the panel beside it. While a hint shows, the board is drawn as it would be after the best move.
function render(): void
{
	const NOW = Date.now();
	if (lastN !== lastNSeen)
	{
		lastNSeen = lastN;
		lastNT = NOW;
	}
	if (flashL !== flashLSeen)
	{
		flashLSeen = flashL;
		flashLT = NOW;
	}
	const HA = hintAnim,
		GREAL = st.G,
		SAVE =
		{
			lastL,
			lastN,
			hintMv: st.hintMv,
			sel: st.sel,
		};
	if (HA)
	{
		lastL = null;
		lastN = null;
		st.hintMv = null;
		st.sel = [];
		st.G =
		{
			...st.G,
			L:
			{
				...st.G.L,
			},
			N: [...st.G.N],
		};
		st.G.L[HA.t] = HA.mv.j;
		if (HA.mv.ni >= 0) st.G.N[HA.mv.ni] = HA.mv.to!;
	}
	const {G, sel, hintMv} = st;
	setTurn(view.rot);
	const t = G.turn,
		hum = humanTurn();
	let s = `<defs>
  <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(opt.colR, 0.25)}"/><stop offset="1" stop-color="${shade(opt.colR, -0.18)}"/></linearGradient>
  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(opt.colB, 0.25)}"/><stop offset="1" stop-color="${shade(opt.colB, -0.18)}"/></linearGradient>
  <radialGradient id="gN" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#555"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3e4"/><stop offset="1" stop-color="#eadcc2"/></linearGradient></defs>`;
	for (let c = 0; c < 16; c++)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" rx="12" fill="url(#gT)"/>`;
	}
	if (lastN)
	{
		const [x, y] = xy(lastN.from);
		s += `<circle cx="${x + 50}" cy="${y + 50}" r="22" fill="none" stroke="#8a7357" stroke-width="3" stroke-dasharray="6 6"/>`;
	}
	if (lastL)
	{
		const c2 = FC[lastL.t];
		for (let c = 0; c < 16; c++)
			if (lastL.m & bit(c))
			{
				const [x, y] = xy(c);
				s += `<rect x="${x + 16}" y="${y + 16}" width="68" height="68" rx="14" fill="none" stroke="${c2}" stroke-width="3" stroke-dasharray="6 6" opacity=".7"/>`;
			}
	}
	for (const p of ["R", "B"] as const)
	{
		const lifted = p === t && G.phase === "L" && hum && sel.length > 0;
		if (p === HA?.t && G.phase === "L")
		{
			const sh = lShapes(LS[G.L[p]]!);
			s += `<g><g transform="translate(0,4)" fill="rgba(0,0,0,.18)">${sh}</g><g fill="${shade(colOf(p), 0.6)}">${sh}</g><g fill="none" stroke="${shade(colOf(p), 0.2)}" stroke-width="2">${sh}</g></g>`;
			continue;
		}
		s += drawL(
			LS[G.L[p]]!,
			p,
			(lifted ? "ghost " : "") + (flashL === p && NOW - flashLT < 500 ? "flash" : ""),
			NOW - flashLT,
		);
	}
	s = s.replace(/class="ghost /g, 'opacity=".28" class="').replace(/class="hghost /g, 'opacity=".6" class="');
	G.N.forEach((c, i) =>
	{
		if (c === PH) return;
		if (HA?.mv.ni === i)
		{
			const [x, y] = xy(c);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="25" fill="#9a948c"/><circle cx="${x + 43}" cy="${y + 42}" r="7" fill="rgba(255,255,255,.3)"/>`;
		}
		else s += disc(c, lastN?.to === c && NOW - lastNT < 500 ? "flash" : "", NOW - lastNT);
		if (hum && G.phase === "N" && selN === i)
		{
			const [x, y] = xy(c);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="33" fill="none" stroke="#fff" stroke-width="10"/><circle cx="${x + 50}" cy="${y + 50}" r="33" fill="none" stroke="#2b1d14" stroke-width="5"/>`;
		}
	});
	if (hum && G.phase === "N" && selN >= 0)
		for (let c = 0; c < 16; c++)
			if (isEmpty(c))
			{
				const [x, y] = xy(c);
				s += `<circle cx="${x + 50}" cy="${y + 50}" r="9" fill="#2b1d14" stroke="#fff" stroke-width="3" opacity=".85"/>`;
			}
	const fill = FC[t];
	for (const c of sel)
	{
		const [x, y] = xy(c);
		s += `<rect x="${x + 14}" y="${y + 14}" width="72" height="72" rx="14" fill="${fill}" fill-opacity=".35" stroke="${fill}" stroke-width="4" stroke-dasharray="10 6"/>`;
	}
	if (hintMv)
	{
		if (G.phase === "L") s += `<g class="pulse" opacity=".55" fill="${fill}">${lShapes(LS[hintMv.j]!)}</g>`;
		if (hintMv.ni >= 0)
		{
			const [a, b] = xy(G.N[hintMv.ni]!),
				[x, y] = xy(hintMv.to!);
			s += `<g class="pulse"><circle cx="${a + 50}" cy="${b + 50}" r="33" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="7 5"/><circle cx="${x + 50}" cy="${y + 50}" r="25" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="7 5"/><line x1="${a + 50}" y1="${b + 50}" x2="${x + 50}" y2="${y + 50}" stroke="#111" stroke-width="3" stroke-dasharray="4 6"/></g>`;
		}
	}
	if (G.over)
	{
		const m = LS[G.L[other(G.over)]]!;
		for (let c = 0; c < 16; c++)
			if (m & bit(c))
			{
				const [x, y] = xy(c);
				s += `<g class="pulse" stroke="#fff" stroke-width="7" stroke-linecap="round"><line x1="${x + 27}" y1="${y + 27}" x2="${x + 73}" y2="${y + 73}"/><line x1="${x + 73}" y1="${y + 27}" x2="${x + 27}" y2="${y + 73}"/></g>`;
			}
	}
	if (HA)
	{
		const mcs: number[] = [];
		for (let c = 0; c < 16; c++) if (LS[G.L[HA.t]]! & bit(c)) mcs.push(DMAP(c, 4, view.rot));
		s += `<path d="${LPATH(mcs, 4, 100, 3, 22, 10)}" fill="none" stroke="#f4c430" stroke-width="6" stroke-dasharray="14 8" class="pulse"/>`;
		if (HA.mv.ni >= 0)
		{
			const [x, y] = xy(HA.mv.to!);
			s += `<circle cx="${x + 50}" cy="${y + 50}" r="34" fill="none" stroke="#f4c430" stroke-width="6" stroke-dasharray="10 6"/>`;
		}
	}
	const board3 = svg();
	if (view.is3d)
	{
		const o: IsoBoard =
		{
			N: 4,
			pieces: [],
			discs: [],
			tiles: [],
			dots: [],
			rings: [],
			over: [],
		};
		for (const p of ["R", "B"] as const)
		{
			const lifted = p === t && G.phase === "L" && hum && sel.length > 0;
			o.pieces.push(
				{
					cells: mc(LS[G.L[p]]!),
					color: FC[p],
					ghost: lifted,
					flash: flashL === p && NOW - flashLT < 500,
					age: NOW - flashLT,
					x: !!G.over && p === other(G.over),
				},
			);
		}
		G.N.forEach((c, i) =>
		{
			if (c !== PH)
				o.discs.push(
					{
						c,
						ring: hum && G.phase === "N" && selN === i ? "#2b1d14" : null,
						flash: !!lastN && lastN.to === c && NOW - lastNT < 500,
						age: NOW - lastNT,
					},
				);
		});
		if (lastL)
			for (const c of mc(lastL.m))
				o.tiles.push(
					{
						c,
						stroke: FC[lastL.t],
						dash: 1,
						sw: 3,
						op: 0.75,
					},
				);
		if (lastN)
			o.rings.push(
				{
					c: lastN.from,
				},
			);
		if (hum && G.phase === "N" && selN >= 0)
			for (let c = 0; c < 16; c++)
				if (isEmpty(c))
					o.dots.push(
						{
							c,
							color: "#2b1d14",
							halo: 1,
						},
					);
		for (const c of sel)
			o.tiles.push(
				{
					c,
					fill: FC[t],
					stroke: FC[t],
					dash: 1,
					op: 0.55,
				},
			);
		if (hintMv)
		{
			if (G.phase === "L")
				for (const c of mc(LS[hintMv.j]!))
					o.tiles.push(
						{
							c,
							fill: FC[t],
							op: 0.4,
						},
					);
			if (hintMv.ni >= 0)
			{
				o.rings.push(
					{
						c: G.N[hintMv.ni]!,
						color: "#111",
					},
				);
				o.rings.push(
					{
						c: hintMv.to!,
						color: "#111",
					},
				);
			}
		}
		if (HA)
		{
			const pc = o.pieces.find((x) => x.color === FC[HA.t]);
			if (pc)
			{
				pc.hl = true;
				if (G.phase === "L") pc.color = shade(colOf(HA.t), 0.6);
			}
			if (HA.mv.ni >= 0)
				o.rings.push(
					{
						c: HA.mv.to!,
						color: "#f4c430",
					},
				);
		}
		o.rot = view.rot;
		isoRender(board3, o);
	}
	else
	{
		board3.style.aspectRatio = "";
		board3.setAttribute("viewBox", "0 0 400 400");
		board3.innerHTML = s;
	}
	setTurn(0);
	if (HA)
	{
		st.G = GREAL;
		({lastL, lastN} = SAVE);
		st.hintMv = SAVE.hintMv;
		st.sel = SAVE.sel;
	}
	renderPanel(t, hum);
}

function renderPanel(t: Side, hum: boolean): void
{
	const {G, sel} = st,
		HA = hintAnim;
	const cpuT = opt.mode === "cpu" && t !== opt.human,
		who = opt.mode === "cpu" ? (cpuT ? "Computer" : "Your") : NAME[t],
		mover = who === "Your" ? "Your" : `${NAME[t]}'s`;
	$("#chip").style.background = COL[G.over ?? t];
	$("#status").textContent = G.over
		? `${NAME[G.over]} wins`
		: cpuT
			? `Computer (${NAME[t]}) is moving`
			: G.phase === "L"
				? `${mover} move: place the ${SHP[G.L[t]] ? "T" : "L"}`
				: `${mover} move: a disc (optional)`;
	const instr = $("#instr");
	if (HA && !instr.classList.contains("err"))
		instr.textContent = `Hint: the gold outline shows the best move. ${HA.why} ${HA.mv.ni >= 0 && G.phase === "L" ? "Then move the pale disc too. " : ""}Let go of Hint to see the board again.`;
	else if (!instr.classList.contains("err"))
		instr.textContent = G.over
			? `${NAME[other(G.over)]} had nowhere to put the ${SHP[G.L[other(G.over)]] ? "T" : "L"}.`
			: cpuT
				? "Thinking…"
				: G.phase === "L"
					? sel.length
						? `${sel.length} of 4 squares. Let go early to start over.`
						: `Swipe across four squares in one stroke to set your ${SHP[G.L[G.turn]] ? "T" : "L"} down somewhere new.${SHP[G.L[G.turn]] ? " (Slide back over the middle to reach the stem.)" : ""} Flip or turn it any way you like.`
					: "Tap a black disc, then an empty square. Or end your turn without moving one.";
	$("#again").hidden = !G.over;
	$("#skip").hidden = !!G.over;
	$("#hint").hidden = !!G.over;
	$as("#skip", HTMLButtonElement).disabled = !(hum && G.phase === "N");
	$as("#hint", HTMLButtonElement).disabled = !hum || !ready();
	$as("#undo", HTMLButtonElement).disabled =
		st.busy || !!G.over || (G.phase === "L" && !sel.length && st.hist.length <= (opt.mode === "cpu" ? 2 : 1));
	$("#levelSet").hidden = opt.mode !== "cpu";
	$("#sideSet").hidden = opt.mode !== "cpu";
	$("#pvpSet").hidden = opt.mode !== "pvp";
	renderCoach();
	oddsC();
	{
		const c = posCode(rotP(parseJSON<Position>(st.hist[st.hist.length - 1]!), view.rot));
		$("#codeNow").textContent = fmtCode(c);
		$("#codeNow").dataset["c"] = c;
	}
	$("#score").innerHTML =
		opt.mode === "cpu"
			? `<span>You ${score.you}</span><small>wins</small><span>Computer ${score.cpu}</span>`
			: `<span>${NAME.R} ${score.R}</span><small>wins</small><span>${NAME.B} ${score.B}</span>`;
	renderAnalysis(t, hum);
	const res = $("#result");
	res.classList.toggle("on", !!G.over);
	if (G.over)
	{
		let extra = "";
		const m = nowMatch();
		if (m)
		{
			const locked = st.games.filter((g) => g.w).length < UNLOCK;
			extra = `<div class="rnow">${mini(posKey(m.P), null)}<div>${nowCaption(m)}${locked ? ` The full list of ways unlocks after ${UNLOCK} finished games.` : ""}<br><button id="seeWays">${locked ? "See the ways-to-lose panel" : "See it among all the ways"}</button></div></div>`;
		}
		res.innerHTML = `<b>${opt.mode === "cpu" ? (G.over === opt.human ? "You win!" : "Computer wins") : `${NAME[G.over]} wins!`}</b> ${NAME[other(G.over)]}'s L (marked ✕) has no legal square to move to.${extra}<div class="row" style="justify-content:center;margin-top:8px"><button id="reviewTree">Review in the move tree</button></div>`;
		$("#reviewTree").addEventListener("click", () =>
		{
			openTree();
		});
		document.getElementById("seeWays")?.addEventListener("click", () =>
		{
			renderLose();
			const c = document.querySelector("#lose .nowbox") ?? $("#lose");
			c.scrollIntoView(
				{
					behavior: "smooth",
					block: "center",
				},
			);
		});
	}
}

// The analysis line and the wins to look for, under their checkboxes.
function renderAnalysis(t: Side, hum: boolean): void
{
	const {G} = st;
	const an = $("#anText");
	an.hidden = !$as("#anOn", HTMLInputElement).checked;
	if (!an.hidden)
	{
		if (!ready()) an.textContent = "Solving every position…";
		else if (G.over) an.textContent = "Game over. The dashed outline shows where the last L moved from.";
		else if (G.phase === "N") an.textContent = "Analysis shows at the start of each turn.";
		else
		{
			const {val, dep} = sol(),
				s = stateOf(G, t),
				v = val[s],
				d = dep[s]!,
				n = NAME[t];
			an.textContent =
				v === 1
					? `${n} can force a win in ${(d + 1) / 2} move${d > 1 ? "s" : ""}.`
					: v === -1
						? `${n} is lost against perfect play, holding out at most ${d / 2} more move${d > 2 ? "s" : ""}.`
						: "Balanced: perfect play from here is a draw.";
		}
	}
	const lb = $("#lookBox");
	lb.hidden = !$as("#lookOn", HTMLInputElement).checked;
	if (lb.hidden) return;
	if (!ready() || !loseReady())
	{
		lb.innerHTML = "<p>Working it out…</p>";
		return;
	}
	if (G.over || G.phase !== "L" || !hum)
	{
		lb.innerHTML = "<p>Shown at the start of your turn.</p>";
		return;
	}
	const {val, dep} = sol(),
		tt = G.turn,
		fin:
		{
			m: Move;
			w: Way;
		}[] = [];
	for (const j of legalL(tt))
		for (const m of optionsFor(tt, j))
			if (val[m.s] === -1 && dep[m.s] === 0)
			{
				const w = wayOf(after(G, tt, m), other(tt));
				if (w)
					fin.push(
						{
							m,
							w,
						},
					);
			}
	const by = new Map<
		Way,
		{
			m: Move;
			w: Way;
		}
	>();
	for (const x of fin) if (!by.has(x.w)) by.set(x.w, x);
	const ws = [...by.values()].toSorted((a, b) => b.w.i - a.w.i);
	const s = stateOf(G, tt);
	lb.innerHTML = ws.length
		? `<p>You can box them in right now. Most common first:</p>${ws.map((x, i) => `<button data-i="${i}">Way ${x.w.i}${flatW() ? "" : `: ${cLabel(x.w).toLowerCase()}`}</button>`).join("")}<p class="muted">Tap one to see the move.</p>`
		: `<p>No move boxes them in this turn.${val[s] === 1 ? ` But you can force a win in ${(dep[s]! + 1) / 2}: use Hint to find the next step.` : ""}</p>`;
	lb.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
	{
		b.addEventListener("click", () =>
		{
			st.hintMv = ws[Number(b.dataset["i"])]!.m;
			st.sel = [];
			render();
		});
	});
}

const back = (d: number): number => (d < 0 ? -1 : DMAP(d, 4, (4 - view.rot) % 4));
// ---- input
function cellAt(e: PointerEvent): number
{
	if (view.turning) return -1;
	const s = svg();
	if (view.is3d) return back(isoCellAt(s, e, 4));
	const r = s.getBoundingClientRect(),
		x = Math.floor(((e.clientX - r.left) / r.width) * 4),
		y = Math.floor(((e.clientY - r.top) / r.height) * 4);
	return x < 0 || y < 0 || x > 3 || y > 3 ? -1 : back(y * 4 + x);
}

const RADIO_KEYS: Record<string, "mode" | "level" | "human"> =
{
	mode: "mode",
	level: "level",
	side: "human",
};
// The opponent, strength and side radios, which show opt.
const settingRadios = (): HTMLInputElement[] => $$as("input[type=radio]:not(.tv):not(.qx)", HTMLInputElement);
function syncRadios(): void
{
	settingRadios().forEach((r) =>
	{
		const k = RADIO_KEYS[r.name];
		r.checked = k !== undefined && r.value === opt[k];
	});
}

function wireInput(): void
{
	const s = svg();
	s.addEventListener("pointerdown", (e) =>
	{
		if (!humanTurn()) return;
		const c = cellAt(e);
		if (c < 0) return;
		e.preventDefault();
		try
		{
			s.setPointerCapture(e.pointerId);
		}
		catch
		{
			// The pointer is already gone.
		}
		const {G} = st;
		if (G.phase === "L")
		{
			if (blockedFor(G.turn) & bit(c)) return;
			drag = true;
			st.sel = [c];
		}
		else
		{
			const i = G.N.indexOf(c);
			if (i >= 0)
			{
				wasSel = selN === i;
				selN = i;
				drag = true;
			}
			else if (selN >= 0 && isEmpty(c))
			{
				moveNeutral(selN, c);
				return;
			}
		}
		st.hintMv = null;
		render();
	});
	s.addEventListener("pointermove", (e) =>
	{
		if (!drag || st.G.phase !== "L") return;
		const c = cellAt(e);
		if (c >= 0 && !(blockedFor(st.G.turn) & bit(c)) && !st.sel.includes(c) && st.sel.length < 4)
		{
			st.sel.push(c);
			render();
		}
	});
	s.addEventListener("pointerup", (e) =>
	{
		if (!drag) return;
		drag = false;
		const c = cellAt(e),
			{G} = st;
		if (G.phase === "L")
		{
			if (st.sel.length === 4)
			{
				tryCommit();
				return;
			}
			st.sel = [];
			render();
		}
		else if (selN >= 0)
		{
			if (c >= 0 && c !== G.N[selN] && isEmpty(c))
			{
				moveNeutral(selN, c);
				return;
			}
			if (c === G.N[selN] && wasSel) selN = -1;
			render();
		}
	});
	s.addEventListener("pointercancel", () =>
	{
		drag = false;
		if (st.G.phase === "L")
		{
			st.sel = [];
			render();
		}
	});
	$("#skip").addEventListener("click", () =>
	{
		if (humanTurn() && st.G.phase === "N") endTurn();
	});
	$("#undo").addEventListener("click", () =>
	{
		if (st.busy || st.G.over) return;
		if (st.G.phase === "N" || st.sel.length) st.G = parseJSON<Position>(st.hist[st.hist.length - 1]!);
		else
		{
			const n = opt.mode === "cpu" ? 2 : 1;
			if (st.hist.length <= n) return;
			for (let i = 0; i < n; i++) st.hist.pop();
			st.G = parseJSON<Position>(st.hist[st.hist.length - 1]!);
		}
		st.sel = [];
		selN = -1;
		st.hintMv = null;
		lastN = null;
		lastL = null;
		flashL = null;
		saveCur();
		render();
		renderTree();
	});
	const hb = $("#hint");
	hb.title = "Hold to see the best move";
	hb.addEventListener("pointerdown", (e) =>
	{
		e.preventDefault();
		try
		{
			hb.setPointerCapture(e.pointerId);
		}
		catch
		{
			// The pointer is already gone.
		}
		startHint();
	});
	for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) hb.addEventListener(ev, endHint);
	hb.addEventListener("keydown", (e) =>
	{
		if ((e.key === " " || e.key === "Enter") && !e.repeat)
		{
			e.preventDefault();
			startHint();
		}
	});
	hb.addEventListener("keyup", (e) =>
	{
		if (e.key === " " || e.key === "Enter")
		{
			hintDown = 0;
			endHint();
		}
	});
	$("#again").addEventListener("click", () =>
	{
		newGame(st.gameStart);
	});
	$("#newGame").addEventListener("click", () =>
	{
		newGame();
	});
	$("#swapP").addEventListener("click", () =>
	{
		swapPlayers();
		const r = opt.randFirst;
		opt.randFirst = false;
		newGame(st.gameStart);
		opt.randFirst = r;
		$("#firstTxt").textContent = `${NAME.R} goes first now.`;
	});
	const rf = $as("#randFirst", HTMLInputElement);
	rf.checked = !!opt.randFirst;
	rf.addEventListener("change", () =>
	{
		opt.randFirst = rf.checked;
		save();
		$("#firstTxt").textContent = opt.randFirst ? "From the next game on, a random player goes first." : "";
	});
	$("#anOn").addEventListener("change", render);
	$("#lookOn").addEventListener("change", render);
	window.addEventListener(VIEW_CHANGED, () =>
	{
		render();
		startTxt();
	});
	settingRadios().forEach((r) =>
	{
		const k = RADIO_KEYS[r.name];
		if (k === undefined) return;
		if (r.value === opt[k]) r.checked = true;
		r.addEventListener("change", () =>
		{
			if (k === "human") opt.human = r.value === "B" ? "B" : "R";
			else opt[k] = r.value;
			save();
			newGame(st.gameStart);
		});
	});
}

export function initClassic(): void
{
	load();
	hooks.render = render;
	hooks.newGame = newGame;
	hooks.syncRadios = syncRadios;
	wireInput();
	initTree();
	initColors();
	initCodes();
	initLose();
	initTutorial();
	applyColors();
	newGame();
	if (!opt.tutDone && !st.games.length) showIntro();
	$as("#codeIn", HTMLInputElement).value = fmtCode(opt.start ?? STD);
	startTxt();
	showCode();
	const ltStd = document.getElementById("ltStd");
	if (ltStd) ltStd.textContent = fmtCode(STD);
	window.setTimeout(() =>
	{
		st.sol = solve(board);
		findTutPos();
		buildLose();
		if (board.piece === "L") buildTip();
		render();
		renderTree();
		showCode();
	}, 30);
}
