// Drawings and widgets shared by the battle and Moving Tiles: the hammer, its badge, a hammer breaking, and the odds bar.

export const HAMMER = (cx: number, cy: number, s = 1, old = false): string =>
	`<g${old ? ' opacity=".45"' : ""} transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) scale(${s}) rotate(-35)" class="hammer"><ellipse cx="3" cy="30" rx="20" ry="6" fill="rgba(0,0,0,.22)" transform="rotate(35)"/><rect x="-4.5" y="-8" width="9" height="38" rx="4" fill="#a0662f" stroke="#4a2c12" stroke-width="2.5"/><rect x="-18" y="-22" width="36" height="16" rx="4" fill="#a9b2bc" stroke="#3d4650" stroke-width="2.5"/><rect x="-15" y="-20" width="30" height="4" rx="2" fill="rgba(255,255,255,.55)"/></g>`;

export const HB = (got: number, ready: number): string =>
	` <span class="hbadge${ready ? " ready" : ""}" title="Hammers in hand: ${ready}. Each hammer breaks when you use it. (${got} picked up this match)">🔨 ${ready}</span>`;

export const HBREAK = (cx: number, cy: number, age: number): string =>
	age > 900
		? ""
		: `<g class="hbreak" style="animation-delay:-${age}ms" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})"><g class="hb1" style="animation-delay:-${age}ms"><rect x="-18" y="-22" width="17" height="16" rx="3" fill="#a9b2bc" stroke="#3d4650" stroke-width="2.5"/><rect x="-4.5" y="-8" width="9" height="18" rx="3" fill="#a0662f" stroke="#4a2c12" stroke-width="2.5"/></g><g class="hb2" style="animation-delay:-${age}ms"><rect x="1" y="-22" width="17" height="16" rx="3" fill="#a9b2bc" stroke="#3d4650" stroke-width="2.5"/><rect x="-4.5" y="12" width="9" height="18" rx="3" fill="#a0662f" stroke="#4a2c12" stroke-width="2.5"/></g><path d="M-4 -24l3 10l-4 6l5 8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;

export interface OddsItem
{
	color: string;
	label: string;
	p: number;
}

// The odds bar above a board: one slice per player (or team) still in the game.
export function ODDS(id: string, items: OddsItem[] | null): void
{
	const el = document.getElementById(id);
	if (!el) return;
	if (!items?.length)
	{
		el.hidden = true;
		return;
	}
	el.hidden = false;
	const tot = items.reduce((a, b) => a + b.p, 0) || 1;
	el.innerHTML = items
		.map((it) =>
		{
			const v = it.p / tot,
				pc = Math.round(v * 100);
			return `<i style="width:${(v * 100).toFixed(2)}%;background:${it.color}" title="${it.label}: ${pc}%"><span>${v >= 0.14 ? `${it.label} ${pc}%` : v >= 0.06 ? `${pc}%` : ""}</span></i>`;
		})
		.join("");
}

// A crown over the top row of a piece, for the player with the most checkmates.
export const crownAt = (x: number, y: number, jewels = false): string =>
	`<g class="qcrown"><path d="M${x - 30} ${y}L${x - 32} ${y - 30}L${x - 15} ${y - 15}L${x} ${y - 38}L${x + 15} ${y - 15}L${x + 32} ${y - 30}L${x + 30} ${y}Z" fill="#f4c430" stroke="#7a4b00" stroke-width="4" stroke-linejoin="round"/><rect x="${x - 30}" y="${y - 6}" width="60" height="9" rx="3" fill="#d9a514" stroke="#7a4b00" stroke-width="3"/><circle cx="${x}" cy="${y - 38}" r="5" fill="#e0463a" stroke="#7a4b00" stroke-width="2"/>${jewels ? `<circle cx="${x - 32}" cy="${y - 30}" r="4" fill="#2f6be0"/><circle cx="${x + 32}" cy="${y - 30}" r="4" fill="#2f6be0"/>` : ""}</g>`;
