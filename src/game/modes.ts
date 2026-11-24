import {ensureMatch} from "./battle/game.ts";
import {$, $$, $$as} from "./dom.ts";
import {setItem} from "./storage.ts";
import {newTilesMatch, setTilesPlayers, tilesPlayers, tilesStarted} from "./tiles/game.ts";
import {MODE_CHANGED, NAMES_RESET, turnBoard, view, VIEW_CHANGED} from "./view.ts";

// Switching between the classic game ("c"), the 4-player battle ("q") and Moving Tiles ("t"), the view controls, and
// the header's player count and variant switches.

function setView(v: string): void
{
	{
		const t = document.getElementById("treeSec");
		if (v !== "c" && t && !t.hidden)
		{
			t.hidden = true;
			document.body.classList.remove("twopen");
		}
	}
	document.body.dataset["view"] = v;
	$("#quad").hidden = v !== "q";
	$$(".cl").forEach((e) =>
	{
		e.hidden = v !== "c";
	});
	{
		const mt = document.getElementById("mtiles");
		if (mt) mt.hidden = v !== "t";
	}
	window.dispatchEvent(
		new CustomEvent(
			MODE_CHANGED,
			{
				detail: v,
			},
		),
	);
	try
	{
		setItem("lgame-view", v);
	}
	catch
	{
		// Storage is unavailable, so the page reopens on the classic game.
	}
	if (v === "q") ensureMatch();
}

// The board's turn buttons and the 2D/3D switch, then the mode the page was last left in.
export function initViews(): void
{
	$("#rotL").addEventListener("click", () =>
	{
		turnBoard(-1);
	});
	$("#rotR").addEventListener("click", () =>
	{
		turnBoard(1);
	});
	$$as("input[name=v3]", HTMLInputElement).forEach((r) =>
	{
		r.checked = r.value === (view.is3d ? "3" : "2");
		r.addEventListener("change", () =>
		{
			view.is3d = r.value === "3";
			try
			{
				setItem("lgame-3d", view.is3d ? "1" : "0");
			}
			catch
			{
				// Storage is unavailable, so the view lasts only until the page reloads.
			}
			window.dispatchEvent(new Event(VIEW_CHANGED));
		});
	});
	let v0 = "c";
	try
	{
		v0 = localStorage.getItem("lgame-view") ?? "c";
	}
	catch
	{
		// Storage is unavailable, so the page opens on the classic game.
	}
	setView(v0);
}

const checked = (name: string): string | undefined =>
	$$as(`input[name=${name}]`, HTMLInputElement).find((r) => r.checked)?.value;
const sync = (): void =>
{
	const v = document.body.dataset["view"] ?? "c",
		pl = v === "q" ? 4 : v === "t" ? tilesPlayers() : 2,
		va = v === "t" ? "t" : "c";
	$$as("input[name=players]", HTMLInputElement).forEach((r) =>
	{
		r.checked = Number(r.value) === pl;
	});
	$$as("input[name=variant]", HTMLInputElement).forEach((r) =>
	{
		r.checked = r.value === va;
	});
};
const pick = (): void =>
{
	window.dispatchEvent(new Event(NAMES_RESET));
	const pl = Number(checked("players")) || 2,
		va = checked("variant") ?? "c";
	if (va === "c")
	{
		setView(pl === 2 ? "c" : "q");
		return;
	}
	const changed = tilesPlayers() !== pl;
	setTilesPlayers(pl);
	setView("t");
	if (changed || !tilesStarted()) newTilesMatch();
};
// header: player count and variant together pick the mode (2 classic, 4 battle, or Moving Tiles with 2 or 4)
export function initHeader(): void
{
	$$as("input[name=players],input[name=variant]", HTMLInputElement).forEach((r) =>
	{
		r.addEventListener("change", pick);
	});
	window.addEventListener(MODE_CHANGED, () =>
	{
		window.setTimeout(sync, 0);
	});
	window.setTimeout(sync, 0);
}
