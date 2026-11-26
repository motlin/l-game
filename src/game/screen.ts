import {$} from "./dom.ts";

// The two screens: setup, the whole page with every setting, rule and guide, and play, at the #play address, which
// keeps only the board and what a player needs mid-game. The CSS hides everything marked .setup while body has
// data-screen="play", and shows .playonly only then.
const PLAY = "#play";

const apply = (): void =>
{
	document.body.dataset["screen"] = location.hash === PLAY ? "play" : "setup";
};

// Goes to the play screen as a new history entry, so the browser's back button returns to the setup screen.
function enterPlay(): void
{
	if (location.hash !== PLAY)
		history.pushState(
			{
				play: true,
			},
			"",
			PLAY,
		);
	apply();
	window.scrollTo(0, 0);
}

// Back to the setup screen: the history entry before the play screen when this page pushed it, otherwise the same
// address without #play, as when the page was opened straight at #play.
function leavePlay(): void
{
	// oxlint-disable-next-line typescript/no-unsafe-member-access -- history.state is whatever enterPlay pushed, or null
	if (history.state?.play === true) history.back();
	else
	{
		history.replaceState(null, "", location.pathname + location.search);
		apply();
	}
}

// The Play and Menu buttons, and every button that starts a game, which goes on to the play screen.
export function initScreens(): void
{
	apply();
	window.addEventListener("popstate", apply);
	window.addEventListener("hashchange", apply);
	$("#menu").addEventListener("click", leavePlay);
	for (const id of ["#play", "#newGame", "#qnew", "#mtnew", "#tutGo", "#codePlay"])
		$(id).addEventListener("click", enterPlay);
}
