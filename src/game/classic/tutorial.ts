import {$, $$} from "../dom.ts";
import {mini} from "./mini.ts";
import {other, type Side} from "./rules.ts";
import
{
	BSL,
	FC,
	hooks,
	key,
	legalL,
	LS,
	NAME,
	NL,
	opt,
	optionsFor,
	parseCode,
	pick,
	posCode,
	posKey,
	ready,
	save,
	sid,
	sol,
	st,
	STD,
} from "./state.ts";

// The first-match lesson: a short game against the Perfect computer from a position the player is sure to lose, with a
// coach that says what to do at each step.

let TUTPOS: string | null = null;

// a position where the player to move is lost but has 3 turns before being boxed in
export function findTutPos(): void
{
	const {val, dep} = sol();
	for (let m = 0; m < NL; m++)
		for (let o = 0; o < NL; o++)
		{
			if (LS[m]! & LS[o]!) continue;
			for (let a = 0; a < 16; a++)
				for (const b of BSL[a]!)
				{
					const s = sid[key(m, o, a, b)]!;
					if (s >= 0 && val[s] === -1 && dep[s] === 6)
					{
						TUTPOS = posCode(
							{
								L:
								{
									R: m,
									B: o,
								},
								N: [a, b],
								turn: "R",
							},
						);
						return;
					}
				}
		}
}

const sw = (t: Side): string => `<i class="sw2" style="background:${FC[t]}"></i>`;

export function renderCoach(): void
{
	const el = $("#coach"),
		{G} = st;
	if (!G.tut)
	{
		el.hidden = true;
		return;
	}
	el.hidden = false;
	el.classList.toggle("end", !!G.over);
	const you = opt.human,
		turnNo = Math.floor((st.hist.length - 1) / 2) + 1;
	let html: string;
	if (G.over)
	{
		html =
			G.over === you
				? '<b class="k">Lesson complete</b><h3>You boxed in the computer!</h3><p>Its L had nowhere to go, so it lost. That is the whole game.</p>'
				: `<b class="k">Lesson complete</b><h3>You lost, because your L has nowhere to go.</h3><p>Look at your ${sw(you)}L, marked with ✕. Every spot where it could fit is blocked by the other L or a disc, so you cannot move, and that is the only way to lose. The Perfect computer always finds a way to box you in once you slip.</p><p>Now try it for real against the Easy computer.</p>`;
		html += '<div class="row"><button class="main" id="tutDone">Play the Easy computer</button></div>';
	}
	else if (G.turn !== you)
		html = `<b class="k">Lesson: turn ${turnNo}</b><h3>The computer is moving.</h3><p>Its ${sw(other(you))}L moves first, then it may move a disc. Watch where it goes: it is trying to trap you.</p>`;
	else if (G.phase === "L")
		html = `<b class="k">Lesson: turn ${turnNo}, step 1 of 2</b><h3>Move your L.</h3><p>Your L is the ${sw(you)}one. In one swipe, drag across four empty squares that make an L shape, somewhere different from where it is now. Squares your L already covers count as empty. If you let go early, just swipe again.</p><p class="muted">Not sure where? Copy the glowing dashed shape.</p><div class="row"><button id="tutQuit">Skip the lesson</button></div>`;
	else
		html = `<b class="k">Lesson: turn ${turnNo}, step 2 of 2</b><h3>Move a disc, or end your turn.</h3><p>You may move one black disc to any empty square to block the computer. Tap a disc, then an empty square. If you don't want to, press <b>End turn</b>.</p>`;
	el.innerHTML = html;
	document.getElementById("tutDone")?.addEventListener("click", finishTutorial);
	document.getElementById("tutQuit")?.addEventListener("click", finishTutorial);
	if (!G.over && G.turn === you && G.phase === "L" && !st.sel.length && !st.hintMv && !st.busy && ready())
	{
		st.hintMv = pick(legalL(you).flatMap((j) => optionsFor(you, j)));
		window.setTimeout(hooks.render, 0);
	}
}

export function showIntro(): void
{
	$("#introPic").innerHTML = mini(posKey(parseCode(STD).P!), null);
	$$(".yourL").forEach((e) =>
	{
		e.innerHTML = `${sw("R")}<b>${NAME.R}</b>`;
	});
	$("#intro").hidden = false;
	$("#tutGo").focus();
}

function startTutorial(): void
{
	$("#intro").hidden = true;
	if (!ready() || !TUTPOS)
	{
		window.setTimeout(startTutorial, 100);
		return;
	}
	opt.mode = "cpu";
	opt.human = "R";
	opt.level = "hard";
	save();
	hooks.syncRadios();
	hooks.newGame(TUTPOS, true);
	$(".game").scrollIntoView(
		{
			behavior: "smooth",
			block: "start",
		},
	);
}

function finishTutorial(): void
{
	opt.tutDone = true;
	opt.mode = "cpu";
	opt.human = "R";
	opt.level = "easy";
	save();
	hooks.syncRadios();
	hooks.newGame();
}

export function initTutorial(): void
{
	$("#tutGo").addEventListener("click", startTutorial);
	$("#tutSkip").addEventListener("click", () =>
	{
		$("#intro").hidden = true;
		opt.tutDone = true;
		save();
	});
	$("#howBtn").addEventListener("click", showIntro);
	$("#intro").addEventListener("keydown", (e) =>
	{
		if (e.key === "Escape")
		{
			$("#intro").hidden = true;
			opt.tutDone = true;
			save();
		}
	});
}
