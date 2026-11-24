import {parseJSON} from "./dom.ts";
import {PIECE} from "./piece.ts";

// The T game and L vs T keep their own 2-player settings, stats, saved games and game in progress, under keys of their
// own. Every other key (the battle and Moving Tiles settings, the view, the board's turn) is shared by all three.
const KEYS: Record<string, Record<string, string>> =
{
	L: {},
	T:
	{
		"lgame-opt": "tgame1-opt",
		"lgame-score": "tgame1-score",
		"lgame-games": "tgame1-games",
		"lgame-cur": "tgame1-cur",
	},
	LT:
	{
		"lgame-opt": "ltgame-opt",
		"lgame-score": "ltgame-score",
		"lgame-games": "ltgame-games",
		"lgame-cur": "ltgame-cur",
	},
};
const keys = KEYS[PIECE] ?? {};

// The key a setting is stored under for this page's piece.
const storageKey = (key: string): string => keys[key] ?? key;

// Reads a setting like localStorage.getItem, throwing when storage is unavailable. The T game and L vs T start with the
// tutorial already done, because a player who switched to them already knows how to play.
export function getItem(key: string): string | null
{
	const value = localStorage.getItem(storageKey(key));
	return value === null && key === "lgame-opt" && storageKey(key) !== key ? '{"tutDone":true}' : value;
}

export function setItem(key: string, value: string): void
{
	localStorage.setItem(storageKey(key), value);
}

export function removeItem(key: string): void
{
	localStorage.removeItem(storageKey(key));
}

const edit = (key: string, change: (saved: Record<string, unknown>) => void): void =>
{
	const value = localStorage.getItem(key);
	if (value === null) return;
	const saved = parseJSON<Record<string, unknown>>(value);
	change(saved);
	localStorage.setItem(key, JSON.stringify(saved));
};
// Switching games forgets the player names in every game's settings, under their real keys.
export function clearStoredNames(): void
{
	try
	{
		for (const key of ["lgame-opt", "tgame1-opt", "ltgame-opt"])
			edit(key, (saved) =>
			{
				saved["nameR"] = "";
				saved["nameB"] = "";
			});
		for (const key of ["lgame-q", "lgame-mt"])
			edit(key, (saved) =>
			{
				saved["names"] = [];
			});
	}
	catch
	{
		// Storage is unavailable or holds something unreadable, as the original tolerated.
	}
}
