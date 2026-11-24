import {$, $as, copyCode} from "../dom.ts";
import {view} from "../view.ts";
import {lShapes, mini, xy} from "./mini.ts";
import {ARM, cells, fmtCode, other, SQ} from "./rules.ts";
import {evalTxt, hooks, lCells, legalL, NAME, ONE, opt, parseCode, posCode, posKey, rotP, save, STD} from "./state.ts";

// Position codes: the guide's figures, the decoder, and the buttons that start games from a code.

const DR = [
	[-1, 0],
	[0, 1],
	[1, 0],
	[0, -1],
];

// A code typed for the board as it looks on screen, as a code for the unturned board.
function unrotCode(code: string): string
{
	const pc = parseCode(code);
	return pc.P ? posCode(rotP(pc.P, (4 - view.rot) % 4)) : code;
}

export function showCode(): void
{
	const v = $as("#codeIn", HTMLInputElement).value,
		pc = parseCode(v),
		o = $("#codeOut");
	const ok = !!pc.P;
	$as("#codePlay", HTMLButtonElement).disabled = !ok;
	$as("#codeStart", HTMLButtonElement).disabled = !ok;
	if (!v.trim())
	{
		o.textContent = "Type a code to see the position.";
		o.classList.remove("bad");
		$("#codePv").innerHTML = "";
		return;
	}
	if (!pc.P)
	{
		o.textContent = pc.err;
		o.classList.add("bad");
		$("#codePv").innerHTML = "";
		return;
	}
	o.classList.remove("bad");
	const P = pc.P,
		stuck = !legalL(P.turn, P).length;
	$("#codePv").innerHTML = mini(posKey(P), null);
	const evaluation = evalTxt(P, P.turn);
	o.textContent =
		`${NAME[P.turn]} to move.` +
		(stuck
			? ` ${NAME[P.turn]} has no move, so ${NAME[other(P.turn)]} has already won.`
			: evaluation
				? ` ${evaluation}`
				: "");
	$("#codeStart").textContent = (opt.start ?? STD) === pc.code ? "New games start here" : "Start every new game here";
}

export function startTxt(): void
{
	const s = opt.start ?? STD,
		pc = parseCode(s),
		shown = pc.P ? posCode(rotP(pc.P, view.rot)) : s;
	$("#codeStartTxt").textContent =
		`New games start from ${fmtCode(shown)}${s === STD ? " (the standard opening)" : ""}${view.rot ? ", as the board is turned right now" : ""}.`;
}

const tile = (c: number, extra = ""): string =>
{
	const [x, y] = xy(c);
	return `<rect x="${x + 4}" y="${y + 4}" width="92" height="92" rx="12" fill="#f3e8d4"/>${extra}`;
};
// The guide's lettered board and one figure for each direction digit.
function drawFigures(): void
{
	let g = '<rect width="400" height="400" rx="28" fill="#3a2416"/>';
	for (let c = 0; c < 16; c++)
	{
		const [x, y] = xy(c);
		g += `${tile(c)}<text x="${x + 50}" y="${y + 50}" font-size="42" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#3a2416" font-family="Lexend,system-ui,sans-serif">${SQ[c]}</text>`;
	}
	$("#figGrid").innerHTML =
		`<svg viewBox="0 0 400 400" role="img" aria-label="Board squares lettered A to P">${g}</svg>`;
	const order = [9, 10, 5, 6, 13, 14, 1, 2, 8, 11, 4, 7, 12, 15, 0, 3];
	let html = "";
	for (let dg = 1; dg <= (ONE ? 4 : 8); dg++)
	{
		const c = order.find((k) => lCells(k, dg))!,
			cs = lCells(c, dg)!,
			m = cells(cs),
			[x, y] = xy(c),
			a = ONE ? dg - 1 : (dg - 1) >> 1,
			ln = ONE ? 92 : 170,
			dy = DR[a]![0]!,
			dx = DR[a]![1]!,
			ex = x + 50 + dx * ln,
			ey = y + 50 + dy * ln;
		let s = '<rect width="400" height="400" rx="28" fill="#3a2416"/>';
		for (let k = 0; k < 16; k++) s += tile(k);
		s += `<g fill="#7a5a40">${lShapes(m)}</g><line x1="${x + 50}" y1="${y + 50}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M${ex + dx * 28} ${ey + dy * 28} l${-dx * 30 - dy * 22} ${-dy * 30 + dx * 22} l${dy * 44} ${-dx * 44}z" fill="#fff"/><circle cx="${x + 50}" cy="${y + 50}" r="22" fill="#fff" stroke="#3a2416" stroke-width="6"/>`;
		html += `<figure><svg viewBox="0 0 400 400" aria-hidden="true">${s}</svg><b>${dg}</b>${ONE ? `stem ${ARM[a]}` : `arm ${ARM[a]}, foot to your ${dg % 2 ? "right" : "left"}`}</figure>`;
	}
	$("#figDirs").innerHTML = html;
}

export function initCodes(): void
{
	drawFigures();
	$("#codeIn").addEventListener("input", showCode);
	$("#codeForm").addEventListener("submit", (e) =>
	{
		e.preventDefault();
		const pc = parseCode($as("#codeIn", HTMLInputElement).value);
		if (!pc.P) return;
		hooks.newGame(unrotCode(pc.code));
		$(".game").scrollIntoView(
			{
				behavior: "smooth",
			},
		);
	});
	$("#codeStart").addEventListener("click", () =>
	{
		const pc = parseCode($as("#codeIn", HTMLInputElement).value);
		if (!pc.P) return;
		opt.start = unrotCode(pc.code);
		save();
		startTxt();
		showCode();
		hooks.newGame(opt.start);
	});
	$("#codeStd").addEventListener("click", () =>
	{
		opt.start = STD;
		save();
		$as("#codeIn", HTMLInputElement).value = fmtCode(STD);
		startTxt();
		showCode();
		hooks.newGame(STD);
	});
	$("#codeCur").addEventListener("click", () =>
	{
		$as("#codeIn", HTMLInputElement).value = fmtCode($("#codeNow").dataset["c"]!);
		showCode();
	});
	$("#codeCopy").addEventListener("click", () =>
	{
		const m = $("#codeMsg");
		copyCode($("#codeNow").dataset["c"]!, $("#codeNow"), m);
		window.setTimeout(() =>
		{
			m.textContent = "";
		}, 2500);
	});
}
