import {$, $$as, closest} from "../dom.ts";
import {renderLose, setAskWay, type Way, wayOf, wayTag} from "./lose.ts";
import {mini, miniInner} from "./mini.ts";
import {fmtCode, other, type Side} from "./rules.ts";
import
{
	after,
	dec,
	evalTxt,
	FC,
	legalL,
	NAME,
	opt,
	optionsFor,
	parseCode,
	pick,
	posKey,
	ready,
	save,
	saveGames,
	sol,
	st,
	stateOf,
	STD,
	curKeys,
} from "./state.ts";

// The move tree: every game played from the current opening, merged into one tree of positions, with each move checked
// against perfect play.

interface Node
{
	k: string;
	id: string;
	kids: Map<string, Node>;
	n: number;
	R: number;
	B: number;
	d: number;
	par: Node | null;
	col?: boolean;
	x?: number;
	cx?: number;
	cy?: number;
}

interface Tag
{
	c: string;
	t: string;
	m?: string;
}

type TreeView = "both" | Side;
const asView = (v: string | undefined): TreeView => (v === "R" || v === "B" ? v : "both");
let tview: TreeView = "both";
let selId = "s",
	follow = true,
	tHl: string | null = null,
	clearArm = 0,
	TREE: Node | null = null,
	BYID = new Map<string, Node>(),
	forceD: number | null = null,
	zoom = 1,
	lastScrolled: string | null = null,
	LIVE: Node | null = null,
	treeW = 0,
	treeH = 0;
const collapsed = new Set<string>(),
	expanded = new Set<string>();
export const treeBuilt = (): boolean => TREE !== null;

let T0: Side = "R";
const turnAt = (d: number): Side => (d % 2 ? other(T0) : T0);
const onSel = (n: Node): boolean => selId === n.id || selId.startsWith(`${n.id}|`);

function buildTree(): Node
{
	const SP = parseCode(st.gameStart).P!;
	T0 = SP.turn;
	const root: Node =
	{
		k: posKey(SP),
		id: "s",
		kids: new Map(),
		n: 0,
		R: 0,
		B: 0,
		d: 0,
		par: null,
	};
	BYID = new Map([["s", root]]);
	const TG = st.games.filter((g) => (g.s ?? STD) === st.gameStart),
		all = st.G.over
			? TG
			: TG.concat([
					{
						p: curKeys(),
						w: null,
						d: 0,
					},
				]);
	const add = (n: Node, w: Side | null): void =>
	{
		n.n++;
		if (w) n[w]++;
	};
	for (const g of all)
	{
		let n = root;
		add(n, g.w);
		for (let i = 1; i < g.p.length; i++)
		{
			let c = n.kids.get(g.p[i]!);
			if (!c)
			{
				c =
				{
					k: g.p[i]!,
					id: `${n.id}|${g.p[i]}`,
					kids: new Map(),
					n: 0,
					R: 0,
					B: 0,
					d: i,
					par: n,
				};
				n.kids.set(g.p[i]!, c);
				BYID.set(c.id, c);
			}
			add(c, g.w);
			n = c;
		}
	}
	return root;
}

const tagCache = new Map<string, Tag>();
// How good the move into a node was, judged against perfect play.
function tagFor(n: Node): Tag | null
{
	if (!ready() || !n.par) return null;
	const ck = `${n.par.k}>${n.k}${turnAt(n.d - 1)}`;
	if (tagCache.has(ck)) return tagCache.get(ck)!;
	const {val} = sol(),
		t = turnAt(n.d - 1),
		o = other(t),
		P = dec(n.par.k),
		C = dec(n.k);
	const v0 = val[stateOf(P, t)],
		v1 = val[stateOf(C, o)];
	const s0 = v0 === 1 ? 2 : v0 === 2 ? 1 : 0,
		s1 = v1 === -1 ? 2 : v1 === 2 ? 1 : 0;
	const r: Tag =
		s1 < s0
			? s1 === 0
				?
					{
						c: "bad",
						t: s0 === 2 ? "Blunder: threw a win" : "Blunder: now lost",
						m: "!!",
					}
				:
					{
						c: "meh",
						t: "Mistake: win slipped",
						m: "?",
					}
			: s0 === 2
				?
					{
						c: "good",
						t: "Winning",
						m: "✓",
					}
				: s0 === 1
					?
						{
							c: "ok",
							t: "Safe",
						}
					:
						{
							c: "lost",
							t: "Already lost",
						};
	tagCache.set(ck, r);
	return r;
}
const TAGC: Record<string, string> =
{
	good: "#2e9d5b",
	meh: "#d98a1c",
	bad: "#d13b30",
};
const moverName = (t: Side): string => (opt.mode === "cpu" ? (t === opt.human ? "You" : "Computer") : NAME[t]);

function card(n: Node, extra = ""): string
{
	const t = turnAt(n.d - 1),
		w = n[t],
		l = n[other(t)],
		u = n.n - w - l,
		tg = tagFor(n);
	const way = ((): string =>
	{
		const Q = dec(n.k),
			t2 = turnAt(n.d);
		if (legalL(t2, Q).length) return "";
		const wy = wayOf(Q, t2);
		return wy ? `<div><span class="nowb">${wayTag(wy)}</span></div>` : "";
	})();
	return `<button class="card ${extra}" data-id="${n.id}"><div class="ctop"><span><i class="dot" style="background:${FC[t]}"></i>${moverName(t)}</span>${tg ? `<span class="tag t-${tg.c}">${tg.t}</span>` : ""}</div>${mini(n.k, n.par!.k)}
  <div class="bar"><i style="width:${(n.R / n.n) * 100}%;background:${FC.R}"></i><i style="flex:1"></i><i style="width:${(n.B / n.n) * 100}%;background:${FC.B}"></i></div>
  <div>${n.n} game${n.n > 1 ? "s" : ""}: ${NAME.R} won ${n.R}, ${NAME.B} won ${n.B}${u ? `, ${u} unfinished` : ""}</div>${way}${extra.includes("mist") ? betterHtml(n) : ""}</button>`;
}

const S = 56,
	SW = 72,
	RH = 118,
	PAD = 28;
function drawTree(): void
{
	const perD: number[] = [];
	BYID.forEach((n) =>
	{
		perD[n.d] = (perD[n.d] ?? 0) + 1;
	});
	let acc = 0,
		autoD = 1e9;
	for (let d = 0; d < perD.length; d++)
	{
		acc += perD[d] ?? 0;
		if (acc > 900)
		{
			autoD = Math.max(1, d - 1);
			break;
		}
	}
	const D = forceD ?? autoD,
		isCol = (n: Node): boolean =>
			n.kids.size > 0 && (collapsed.has(n.id) || (!expanded.has(n.id) && n.d >= D && !onSel(n)));
	let x = 0,
		maxD = 0;
	const vis: Node[] = [];
	const f = (n: Node): void =>
	{
		vis.push(n);
		maxD = Math.max(maxD, n.d);
		n.col = isCol(n);
		const ks = n.col ? [] : [...n.kids.values()].toSorted((a, b) => b.n - a.n);
		if (ks.length)
		{
			ks.forEach(f);
			n.x = (ks[0]!.x! + ks[ks.length - 1]!.x!) / 2;
		}
		else n.x = x++;
	};
	f(TREE!);
	const W = PAD * 2 + x * SW,
		H = PAD * 2 + (maxD + 1) * RH;
	let e = "",
		e2 = "",
		nd = "";
	for (const n of vis)
	{
		n.cx = PAD + n.x! * SW + SW / 2;
		n.cy = PAD + n.d * RH;
	}
	for (const n of vis)
	{
		if (!n.par) continue;
		const p = n.par,
			pv = tview === "both" ? null : tview,
			w = pv ? n[pv] : n.R,
			l = pv ? n[other(pv)] : n.B,
			col = pv ? (w > l ? "#2e9d5b" : l > w ? "#d13b30" : "#9a8a76") : w > l ? FC.R : l > w ? FC.B : "#9a8a76",
			sw = Math.min(11, 2.5 + Math.log2(n.n) * 1.8);
		const y1 = p.cy! + S + 10,
			y2 = n.cy! - 4,
			my = (y1 + y2) / 2,
			d = `M${p.cx} ${y1}C${p.cx} ${my} ${n.cx} ${my} ${n.cx} ${y2}`;
		if (onSel(n))
			e2 += `<path d="${d}" stroke="currentColor" stroke-width="${sw + 6}" fill="none" opacity=".85"/><path d="${d}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
		else
			e += `<path d="${d}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity=".75"/>`;
	}
	for (const n of vis)
	{
		const l = n.cx! - S / 2,
			y = n.cy!,
			tg = tagFor(n),
			P = dec(n.k),
			t2 = turnAt(n.d),
			stuck = !legalL(t2, P).length;
		nd += `<g class="tn" data-id="${n.id}"><title>${n.d ? `Move ${n.d}` : "Start"}: ${n.n} game${n.n > 1 ? "s" : ""}, ${NAME.R} won ${n.R}, ${NAME.B} won ${n.B}</title>`;
		if (n.id === selId)
			nd += `<rect x="${l - 6}" y="${y - 6}" width="${S + 12}" height="${S + 12}" rx="13" fill="none" stroke="currentColor" stroke-width="4"/>`;
		else if (n === LIVE && !st.G.over)
			nd += `<rect x="${l - 5}" y="${y - 5}" width="${S + 10}" height="${S + 10}" rx="12" fill="none" stroke="#e8b52c" stroke-width="3" stroke-dasharray="6 4"/>`;
		nd += `<svg x="${l}" y="${y}" width="${S}" height="${S}" viewBox="0 0 400 400">${miniInner(n.k, n.par ? n.par.k : null)}</svg>`;
		if (tg?.m && TAGC[tg.c])
			nd += `<circle cx="${l + S}" cy="${y}" r="11" fill="${TAGC[tg.c]}" stroke="#fff" stroke-width="2"/><text x="${l + S}" y="${y + 4}" font-size="11" font-weight="800" text-anchor="middle" fill="#fff">${tg.m}</text>`;
		if (n === LIVE && !st.G.over)
			nd += `<text x="${n.cx}" y="${y - 11}" font-size="11" font-weight="600" text-anchor="middle" fill="#c99512">now</text>`;
		if (!n.par)
			nd += `<text x="${n.cx}" y="${y - 11}" font-size="12" font-weight="600" text-anchor="middle" fill="currentColor">Start</text>`;
		{
			const bw = S,
				rw = (n.R / n.n) * bw,
				bb = (n.B / n.n) * bw;
			nd += `<rect x="${l}" y="${y + S + 3}" width="${bw}" height="6" rx="3" fill="#9a8a76" opacity=".45"/>${rw ? `<rect x="${l}" y="${y + S + 3}" width="${rw}" height="6" fill="${FC.R}"/>` : ""}${bb ? `<rect x="${l + bw - bb}" y="${y + S + 3}" width="${bb}" height="6" fill="${FC.B}"/>` : ""}`;
		}
		if (stuck)
		{
			const wy = wayOf(P, t2);
			if (wy)
				nd += `<rect x="${n.cx! - 26}" y="${y + S + 32}" width="52" height="16" rx="8" fill="#2f7bff"/><text x="${n.cx}" y="${y + S + 44}" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">Way ${wy.i}</text>`;
		}
		if (stuck)
			nd += `<rect x="${n.cx! - 30}" y="${y + S + 12}" width="60" height="18" rx="9" fill="${FC[other(t2)]}"/><text x="${n.cx}" y="${y + S + 25}" font-size="11" font-weight="600" text-anchor="middle" fill="#fff">${NAME[other(t2)]} wins</text>`;
		nd += "</g>";
		if (n.kids.size)
			nd += `<g class="tg" data-t="${n.id}"><circle cx="${n.cx}" cy="${y + S + 21}" r="10" fill="var(--panel)" stroke="currentColor" stroke-width="2"/><text x="${n.cx}" y="${y + S + 26}" font-size="15" font-weight="700" text-anchor="middle" fill="currentColor">${n.col ? "+" : "−"}</text></g>`;
	}
	const sv = $("#tsvg");
	sv.setAttribute("viewBox", `0 0 ${W} ${H}`);
	sv.setAttribute("width", String(W * zoom));
	sv.setAttribute("height", String(H * zoom));
	sv.innerHTML = e + e2 + nd;
	treeW = W;
	treeH = H;
	const sn = BYID.get(selId);
	if (sn?.cx !== undefined && lastScrolled !== selId)
	{
		lastScrolled = selId;
		const v = $("#tview");
		v.scrollTo(
			{
				left: sn.cx * zoom - v.clientWidth / 2,
				top: sn.cy! * zoom - v.clientHeight / 3,
			},
		);
	}
}

export function renderTree(): void
{
	window.setTimeout(renderLose, 0);
	TREE = buildTree();
	LIVE = TREE;
	{
		const ks = curKeys();
		for (let i = 1; i < ks.length; i++)
		{
			const c: Node | undefined = LIVE.kids.get(ks[i]!);
			if (!c) break;
			LIVE = c;
		}
	}
	if (follow) selId = LIVE.id;
	while (!BYID.has(selId))
	{
		const i = selId.lastIndexOf("|");
		selId = i < 0 ? "s" : selId.slice(0, i);
	}
	const node = BYID.get(selId)!;
	const TG = st.games.filter((g) => (g.s ?? STD) === st.gameStart),
		fin = TG.filter((g) => g.w),
		rw = fin.filter((g) => g.w === "R").length;
	$("#treeSum").textContent =
		(st.gameStart === STD ? "" : `Games starting from ${fmtCode(st.gameStart)}. `) +
		(TG.length
			? `${TG.length} game${TG.length > 1 ? "s" : ""} recorded: ${NAME.R} won ${rw}, ${NAME.B} won ${fin.length - rw}, ${st.games.length - fin.length} unfinished. Tap any board in the tree to inspect it.`
			: "Every game you play is saved here so you can retrace it. Your current game grows the tree as you play.");
	$("#tLive").classList.toggle("on", follow);
	$("#tvR").textContent = `${NAME.R}'s view`;
	$("#tvB").textContent = `${NAME.B}'s view`;
	$$as("input.tv", HTMLInputElement).forEach((i) =>
	{
		i.checked = i.value === tview;
	});
	$("#legend").innerHTML =
		tview === "both"
			? `<i style="background:${FC.R}"></i>${NAME.R} won more <i style="background:${FC.B}"></i>${NAME.B} won more <i style="background:#9a8a76"></i>even or unfinished`
			: `<i style="background:#2e9d5b"></i>good for ${NAME[tview]} <i style="background:#d13b30"></i>bad for ${NAME[tview]} <i style="background:#9a8a76"></i>even or unfinished`;
	drawTree();
	const t = turnAt(node.d),
		P = dec(node.k),
		stuck = !legalL(t, P).length,
		tg = tagFor(node),
		way = stuck ? wayOf(P, t) : null;
	const mover = node.d ? moverName(turnAt(node.d - 1)) : "";
	$("#here").innerHTML =
		`${mini(node.k, node.par ? node.par.k : null)}<p><b>${node.d ? `After move ${node.d}` : "Start position"}</b>${node.d ? ` (${mover === "You" ? "your move" : `${mover}'s move`})` : ""}, ${NAME[t]} to move.${tg ? ` <span class="tag t-${tg.c}">${tg.t}</span>` : ""}</p><p>Reached in ${node.n} game${node.n === 1 ? "" : "s"}: ${NAME.R} won ${node.R}, ${NAME.B} won ${node.B}.</p><p>${stuck ? `${NAME[t]} is boxed in. ${NAME[other(t)]} wins.` : evalTxt(P, t)}</p>${way ? `<p>This finish is <b>${wayTag(way)}</b>.</p><button id="hereWay">See Way ${way.i} in Ways you can lose</button>` : ""}${node.par && tg && (tg.c === "bad" || tg.c === "meh") ? betterHtml(node) : ""}`;
	document.getElementById("hereWay")?.addEventListener("click", () =>
	{
		showWay(wayOf(P, t));
	});
	const kids = [...node.kids.values()].toSorted((a, b) => b.n - a.n);
	let html = kids.map((c) => card(c, c.id === tHl ? "hl" : "")).join("");
	if (ready() && !stuck)
	{
		const mv = pick(legalL(t, P).flatMap((j) => optionsFor(t, j, P)));
		const bk = posKey(after(P, t, mv));
		if (!node.kids.has(bk))
		{
			const v = sol().val[mv.s];
			html += `<div class="card untried"><div class="ctop"><span><i class="dot" style="background:${FC[t]}"></i>Never tried</span><span class="tag t-${v === -1 ? "good" : v === 2 ? "ok" : "lost"}">Best move</span></div>${mini(bk, node.k)}<div>The strongest move here (${v === -1 ? "wins" : v === 2 ? "holds the draw" : "loses slowest"}). Nobody has played it yet.</div></div>`;
		}
	}
	const mn = moverName(t);
	$("#kidsTitle").textContent = stuck
		? "Game over here"
		: `${mn === "You" ? "Your" : mn === "Computer" ? "Computer's" : `${mn}'s`} moves from here`;
	$("#kids").innerHTML =
		html || `<p class="muted">${stuck ? "No moves possible." : "Nothing played from here yet."}</p>`;
	const bad: Node[] = [];
	BYID.forEach((c) =>
	{
		const g = tagFor(c);
		if (g && (g.c === "bad" || g.c === "meh")) bad.push(c);
	});
	bad.sort((a, b) => (tagFor(a)!.c === "bad" ? 0 : 1) - (tagFor(b)!.c === "bad" ? 0 : 1) || b.n - a.n);
	$("#mistSum").textContent = bad.length
		? `Mistakes to review (${bad.length}${bad.length > 8 ? ", worst 8 shown" : ""})`
		: "Mistakes to review";
	$("#mistakes").innerHTML = bad.length
		? bad
				.slice(0, 8)
				.map((c) =>
					card(c, "mist").replace(
						'<div class="ctop">',
						`<div class="muted">Move ${c.d}</div><div class="ctop">`,
					),
				)
				.join("")
		: `<p class="muted">${ready() ? "No mistakes found yet. Each move is checked against perfect play." : "Checking moves…"}</p>`;
}

// What the best move would have done, for a move that threw a win away.
function betterHtml(n: Node): string
{
	if (!ready() || !n.par) return "";
	const {val, dep} = sol(),
		t = turnAt(n.d - 1),
		o = other(t),
		P = dec(n.par.k),
		C = dec(n.k);
	const s0 = stateOf(P, t),
		v0 = val[s0],
		d0 = dep[s0]!,
		s1 = stateOf(C, o),
		v1 = val[s1],
		d1 = dep[s1]!;
	const mv = pick(legalL(t, P).flatMap((j) => optionsFor(t, j, P)));
	const Q = after(P, t, mv);
	const vb = val[mv.s],
		db = dep[mv.s]!,
		who = moverName(t),
		youS = who === "You",
		opp = youS ? "the computer" : NAME[o];
	const played =
		v1 === -1 ? `wins in ${(d1 + 1) / 2}` : v1 === 1 ? `lets ${opp} force a win in ${(d1 + 1) / 2}` : "only draws";
	const better =
		vb === -1
			? db === 0
				? `boxes ${opp} in immediately${((): string =>
					{
						const w = wayOf(Q, o);
						return w ? ` (${wayTag(w)})` : "";
					})()}`
				: `forces a win in ${(db + 1) / 2} more move${db > 1 ? "s" : ""}`
			: vb === 2
				? `keeps the game a draw: ${opp} cannot force a win`
				: "holds out longest";
	const before =
		v0 === 1
			? `${youS ? "You" : who} had a forced win in ${(d0 + 1) / 2}.`
			: "The position was a draw with perfect play.";
	return `<div class="better">${mini(posKey(Q), n.par.k)}<div><b>Better move:</b> this one ${better}. ${before} The move played ${played}.</div></div>`;
}

function selectNode(id: string, hl: string | null = null): void
{
	follow = false;
	selId = id;
	tHl = hl;
	const n = BYID.get(id);
	if (n)
	{
		collapsed.delete(id);
		for (let p = n.par; p; p = p.par) collapsed.delete(p.id);
	}
	renderTree();
}

function setZoom(z: number): void
{
	const v = $("#tview"),
		cx = (v.scrollLeft + v.clientWidth / 2) / zoom,
		cy = (v.scrollTop + v.clientHeight / 2) / zoom;
	zoom = Math.min(1.6, Math.max(0.2, z));
	const sv = $("#tsvg");
	sv.setAttribute("width", String(treeW * zoom));
	sv.setAttribute("height", String(treeH * zoom));
	v.scrollTo(
		{
			left: cx * zoom - v.clientWidth / 2,
			top: cy * zoom - v.clientHeight / 2,
		},
	);
}

export function openTree(): void
{
	const t = $("#treeSec");
	t.hidden = false;
	document.body.classList.add("twopen");
	lastScrolled = null;
	renderTree();
	$("#treeClose").focus();
}
function closeTree(): void
{
	$("#treeSec").hidden = true;
	document.body.classList.remove("twopen");
}
function showWay(w: Way | null): void
{
	if (!w) return;
	closeTree();
	setAskWay(w);
	renderLose();
	const c = document.querySelector("#lose .nowbox") ?? $("#lose");
	c.scrollIntoView(
		{
			behavior: "smooth",
			block: "center",
		},
	);
}

export function initTree(): void
{
	tview = asView(opt.tview);
	// pan by dragging the tree with a mouse; tap a board to select it, tap +/− to fold a branch
	const v = $("#tview");
	let start:
		{
			x: number;
			y: number;
			l: number;
			t: number;
		} | null = null,
		moved = false;
	v.addEventListener("pointerdown", (e) =>
	{
		if (e.pointerType !== "mouse") return;
		start =
		{
			x: e.clientX,
			y: e.clientY,
			l: v.scrollLeft,
			t: v.scrollTop,
		};
		moved = false;
	});
	window.addEventListener("pointermove", (e) =>
	{
		if (!start) return;
		const dx = e.clientX - start.x,
			dy = e.clientY - start.y;
		if (Math.abs(dx) + Math.abs(dy) > 5)
		{
			moved = true;
			v.classList.add("pan");
		}
		if (moved)
		{
			v.scrollLeft = start.l - dx;
			v.scrollTop = start.t - dy;
		}
	});
	window.addEventListener("pointerup", () =>
	{
		start = null;
		v.classList.remove("pan");
	});
	v.addEventListener("click", (e) =>
	{
		if (moved)
		{
			moved = false;
			return;
		}
		const tg = closest(e, ".tg");
		if (tg)
		{
			const id = tg.dataset["t"]!,
				n = BYID.get(id)!;
			if (n.col)
			{
				collapsed.delete(id);
				expanded.add(id);
			}
			else
			{
				expanded.delete(id);
				collapsed.add(id);
				if (selId.startsWith(`${id}|`))
				{
					selId = id;
					follow = false;
				}
			}
			lastScrolled = selId;
			renderTree();
			return;
		}
		const g = closest(e, ".tn");
		if (g)
		{
			lastScrolled = g.dataset["id"]!;
			selectNode(g.dataset["id"]!);
		}
	});
	$("#zIn").addEventListener("click", () =>
	{
		setZoom(zoom * 1.25);
	});
	$("#zOut").addEventListener("click", () =>
	{
		setZoom(zoom / 1.25);
	});
	$("#zFit").addEventListener("click", () =>
	{
		const tv = $("#tview");
		setZoom(Math.min(1, (tv.clientWidth - 8) / treeW, (tv.clientHeight - 8) / treeH));
	});
	$("#tExp").addEventListener("click", () =>
	{
		collapsed.clear();
		forceD = 1e9;
		lastScrolled = null;
		renderTree();
	});
	$("#tCol").addEventListener("click", () =>
	{
		collapsed.clear();
		expanded.clear();
		forceD = 1;
		lastScrolled = null;
		renderTree();
	});
	$("#kids").addEventListener("click", (e) =>
	{
		const b = closest(e, "button.card");
		if (b) selectNode(b.dataset["id"]!);
	});
	$("#mistakes").addEventListener("click", (e) =>
	{
		const b = closest(e, "button.card");
		if (!b) return;
		const n = BYID.get(b.dataset["id"]!);
		if (!n) return;
		selectNode(n.par!.id, n.id);
		$("#treeSec").scrollIntoView(
			{
				behavior: "smooth",
				block: "start",
			},
		);
	});
	$$as("input.tv", HTMLInputElement).forEach((i) =>
	{
		i.addEventListener("change", () =>
		{
			tview = asView(i.value);
			opt.tview = tview;
			save();
			renderTree();
		});
	});
	$("#tLive").addEventListener("click", () =>
	{
		follow = true;
		tHl = null;
		lastScrolled = null;
		renderTree();
	});
	$("#tClear").addEventListener("click", () =>
	{
		const b = $("#tClear");
		if (Date.now() - clearArm > 3000)
		{
			clearArm = Date.now();
			b.textContent = "Click again to clear";
			window.setTimeout(() =>
			{
				b.textContent = "Clear history";
			}, 3000);
			return;
		}
		st.games = [];
		saveGames();
		clearArm = 0;
		b.textContent = "Clear history";
		selId = "s";
		collapsed.clear();
		expanded.clear();
		renderTree();
	});
	$("#treeOpen").addEventListener("click", openTree);
	$("#treeClose").addEventListener("click", closeTree);
	document.addEventListener("keydown", (e) =>
	{
		if (e.key === "Escape" && !$("#treeSec").hidden) closeTree();
	});
}
