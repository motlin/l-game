import {$$as} from "./dom.ts";
import {PIECE} from "./piece.ts";
import {clearStoredNames} from "./storage.ts";

// The piece switch in the header, and the page's wording for the T game and L vs T. The markup is written for the L
// game; the T game also rewrites every later change to the page's text, so text the scripts write reads right too.

const q = (s: string): HTMLElement | null => document.querySelector<HTMLElement>(s);
const set = (s: string, v: string): void =>
{
	const e = q(s);
	if (e) e.innerHTML = v;
};

function wireSwitch(): void
{
	$$as("input[name=piece]", HTMLInputElement).forEach((r) =>
	{
		r.checked = r.value === PIECE;
		r.addEventListener("change", () =>
		{
			clearStoredNames();
			try
			{
				localStorage.setItem("lgame-piece", r.value);
			}
			catch
			{
				// Storage is unavailable, so the page reloads as the same game.
			}
			location.reload();
		});
	});
}

function lVersusT(): void
{
	document.documentElement.classList.add("pieceLT");
	document.title = "L vs T";
	{
		const e = q("header h1");
		if (e) e.textContent = "L vs T";
	}
	set(
		"header p",
		"Edward de Bono's L game with a twist: the L takes on the T. With 2 players it is one L against one T; with 4 players it is a team battle, two L pieces against two T pieces.",
	);
	set(
		"#codeLede",
		'Any position fits in six characters, like <b class="cd" id="ltStd"></b>: two for Player 1\'s L, two for Player 2\'s T, and two for the discs.',
	);
	set(
		"#ruleDiscs",
		"The board is 4 by 4. Player 1 owns an L and Player 2 owns a T, each covering four squares, and two black neutral discs belong to nobody. The L fits in twice as many places as the T, so the T player has to be careful: from most positions only one or two moves are safe.",
	);
	q("#codeStep2")?.insertAdjacentHTML(
		"beforeend",
		"<p><b>The T (Player 2)</b> is written as its middle square (the center of its three-square bar) and a digit for the way its stem points: up 1, right 2, down 3, left 4.</p>",
	);
	{
		const e = q("#solveTxt");
		if (e) e.innerHTML = e.innerHTML.replace("18,368", "16,576");
	}
}

// The T game's wording: every L in the page's text becomes a T, except in pictures, code and position codes.
const fix = (t: string): string =>
	t
		.replace(/\bL Game\b/g, "T Game")
		.replace(/\bL game\b/g, "T game")
		.replace(/\bL-shaped\b/g, "T-shaped")
		.replace(/\ban L\b/g, "a T")
		.replace(/\bAn L\b/g, "A T")
		.replace(/\bL's\b/g, "T's")
		.replace(/\bLs\b/g, "Ts")
		.replace(/\bL\b/g, "T")
		.replace(/in one stroke(?! \(slide)/g, "in one stroke (slide back over the middle to reach the stem)");
const skip = (n: Node): boolean =>
{
	for (let e = n.parentElement; e; e = e.parentElement)
		if (
			e.namespaceURI === "http://www.w3.org/2000/svg" ||
			/^(SCRIPT|STYLE|CODE|TEXTAREA)$/.test(e.tagName) ||
			e.classList.contains("keepL") ||
			e.classList.contains("cd")
		)
			return true;
	return false;
};
const one = (n: Node): void =>
{
	if (skip(n)) return;
	const v = fix(n.nodeValue ?? "");
	if (v !== n.nodeValue) n.nodeValue = v;
};
const walk = (root: Node): void =>
{
	const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) one(n);
};

function tGame(): void
{
	document.documentElement.classList.add("pieceT");
	document.title = "The T Game";
	set("header p", "A T-shaped twist on Edward de Bono's L game: the same rules, but every player's piece is a T.");
	set(
		"#codeLede",
		"Any position fits in six characters, like <b class=\"cd\">B3 K3 P1</b>: two for the first player's T, two for the second player's T, one for the disc and one for whose turn it is. Once you learn the three rules below you can read or write a code by eye, and set up any position you like to try your own variants.",
	);
	set(
		"#codeStep2",
		'<h3>2. A T is a middle square and a direction</h3><p>The <b>middle</b> is the center of the T\'s three-square bar, the square the stem sticks out from (marked with a dot). Write its letter, then a digit for the way the stem points: <b>up 1, right 2, down 3, left 4</b>.</p><div id="figDirs" class="dirs"></div>',
	);
	set(
		"#codeEx",
		'<h3>Worked example: the standard opening</h3><p><b class="cd">B3</b>: the first player\'s T runs along the top (A, B, C) and is centered on B, with its stem pointing down (to F), so 3. <b class="cd">K3</b>: the second player\'s T is centered on K with its stem pointing down (to O), so 3. <b class="cd">P1</b>: the disc is on P, and it is the first player\'s turn.</p>',
	);
	set(
		"#codeStep3",
		"<h3>3. The disc, then whose turn</h3><p>The T game has <b>one</b> disc. The fifth character is its square. The last character is <b>1</b> if it is the first player's turn, or <b>2</b> for the second player.</p>",
	);
	set(
		"#ruleDiscs",
		"The board is 4 by 4. Each player owns one T-shaped piece covering four squares, and one black neutral disc belongs to nobody. (With two discs, almost every move in the T game can be punished at once, so it uses one.)",
	);
	set(
		"#mtRule1",
		"The same T game, but the floor itself moves. Two players start on a 5 by 5 floor with one blocker: on 4 by 4, whoever moved a tile first almost always won on the spot. Four players start from the battle pinwheel on 6 by 6, with 4 blockers.",
	);
	set("#ruleDisc2", "Then you may move the disc to any empty square, or leave it where it is.");
	set(
		"#qcodeLi",
		"<b>Next, four T's in player order</b>, three characters each: the middle square of the T's bar, then the same direction digit as the classic code, for the way the stem points: up 1, right 2, down 3, left 4. A <b>lowercase</b> letter means that T is a statue.",
	);
	{
		const e = document.querySelector<HTMLInputElement>("#codeIn");
		if (e) e.placeholder = "e.g. B3 K3 P1";
	}
	{
		const e = q("#solveTxt");
		if (e) e.innerHTML = e.innerHTML.replace("18,368", "1,088");
	}
	walk(document.body);
	new MutationObserver((ms) =>
	{
		for (const m of ms)
		{
			if (m.type === "characterData") one(m.target);
			else
				for (const a of m.addedNodes)
				{
					if (a.nodeType === Node.TEXT_NODE) one(a);
					else if (a.nodeType === Node.ELEMENT_NODE) walk(a);
				}
		}
	}).observe(
		document.body,
		{
			subtree: true,
			childList: true,
			characterData: true,
		},
	);
}

export function initVariant(): void
{
	wireSwitch();
	if (PIECE === "LT") lVersusT();
	if (PIECE === "T") tGame();
}
