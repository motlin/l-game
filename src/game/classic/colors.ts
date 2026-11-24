import {$, $$as, $as, cleanName} from "../dom.ts";
import {NAMES_RESET} from "../view.ts";
import {showCode} from "./codes.ts";
import type {Side} from "./rules.ts";
import {colOf, DEFCOL, DEFNAME, FC, hooks, LT, NAME, opt, save, score, setName, shownName, nameOf} from "./state.ts";
import {renderTree, treeBuilt} from "./tree.ts";

// The two players' names and piece colors.

const rgb = (c: number[]): string => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
export const shade = (c: number[], k: number): string =>
	rgb(k > 0 ? c.map((v) => v + (255 - v) * k) : c.map((v) => v * (1 + k)));

export function applyColors(): void
{
	for (const p of ["R", "B"] as const)
	{
		FC[p] = rgb(colOf(p));
		document.documentElement.style.setProperty(p === "R" ? "--red" : "--blue", FC[p]);
		NAME[p] = shownName(p);
	}
	for (const p of ["R", "B"] as const)
	{
		$(`#sw${p}`).style.background = FC[p];
		$$as(`.crow[data-p=${p}] input[type=range]`, HTMLInputElement).forEach((i) =>
		{
			i.value = String(colOf(p)[Number(i.dataset["c"])]);
			if (i.nextElementSibling instanceof HTMLOutputElement) i.nextElementSibling.value = i.value;
		});
	}
	$("#sideR").textContent = NAME.R + (LT ? " (L, first)" : " (first)");
	$("#sideB").textContent = NAME.B + (LT ? " (T, second)" : " (second)");
	$("#chipSR").style.background = FC.R;
	$("#chipSB").style.background = FC.B;
	$("#sumNames").textContent = `${NAME.R} vs ${NAME.B}`;
}

// two humans: trade seats so the other person moves first (each keeps their name, color and wins)
export function swapPlayers(): void
{
	[opt.nameR, opt.nameB] = [opt.nameB, opt.nameR];
	[opt.colR, opt.colB] = [opt.colB, opt.colR];
	[score.R, score.B] = [score.B, score.R];
	for (const p of ["R", "B"] as const) $as(`#nm${p}`, HTMLInputElement).value = cleanName(nameOf(p));
	applyColors();
	save();
}

// Everything that shows a name or a color.
function redraw(): void
{
	applyColors();
	save();
	hooks.render();
	if (treeBuilt()) renderTree();
	showCode();
}

export function initColors(): void
{
	for (const p of ["R", "B"] as const)
	{
		const el = $as(`#nm${p}`, HTMLInputElement);
		el.value = cleanName(nameOf(p));
		el.placeholder = DEFNAME[p];
		el.addEventListener("input", () =>
		{
			setName(p, cleanName(el.value));
			redraw();
		});
	}
	$$as(".crow input[type=range]", HTMLInputElement).forEach((i) =>
	{
		const o = document.createElement("output");
		i.after(o);
		i.addEventListener("input", () =>
		{
			const p: Side = i.closest<HTMLElement>(".crow")!.dataset["p"] === "B" ? "B" : "R";
			colOf(p)[Number(i.dataset["c"])] = Number(i.value);
			redraw();
		});
	});
	window.addEventListener(NAMES_RESET, () =>
	{
		opt.nameR = "";
		opt.nameB = "";
		for (const p of ["R", "B"] as const) $as(`#nm${p}`, HTMLInputElement).value = "";
		redraw();
	});
	$("#colReset").addEventListener("click", () =>
	{
		opt.colR = [...DEFCOL.R];
		opt.colB = [...DEFCOL.B];
		applyColors();
		save();
		hooks.render();
		renderTree();
		showCode();
	});
}
