import {setItem} from "./storage.ts";

// How every board is drawn: flat from the top or in 3D from a corner, how many quarter turns clockwise it is turned,
// and, while a turn animates, the angle the 3D board has reached and that input waits for it.
export const view =
{
	is3d: false,
	rot: 0,
	theta: 0,
	turning: false,
};
try
{
	view.is3d = localStorage.getItem("lgame-3d") === "1";
}
catch
{
	// Storage is unavailable, so the board starts flat.
}
try
{
	view.rot = (Number(localStorage.getItem("lgame-rot")) || 0) % 4;
}
catch
{
	// Storage is unavailable, so the board starts unturned.
}

// The events the three games listen for: the view changed (a redraw), the mode changed, and names were reset.
export const VIEW_CHANGED = "lgame-view3d";
export const MODE_CHANGED = "lgame-view";
export const NAMES_RESET = "lgame-resetnames";

function finishTurn(d: number): void
{
	view.rot = (view.rot + d + 4) % 4;
	view.theta = 0;
	view.turning = false;
	try
	{
		setItem("lgame-rot", String(view.rot));
	}
	catch
	{
		// Storage is unavailable, so the turn lasts only until the page reloads.
	}
	window.dispatchEvent(new Event(VIEW_CHANGED));
}

const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// Turns every board a quarter turn, animated unless the player prefers reduced motion.
export function turnBoard(d: number): void
{
	if (view.turning) return;
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (reduce)
	{
		finishTurn(d);
		return;
	}
	view.turning = true;
	const dur = 550,
		t0 = performance.now();
	if (view.is3d)
	{
		// 3D: redraw the board at in-between angles so it turns on its base
		const step = (now: number): void =>
		{
			const k = Math.min(1, (now - t0) / dur);
			view.theta = (d * ease(k) * Math.PI) / 2;
			window.dispatchEvent(new Event(VIEW_CHANGED));
			if (k < 1) requestAnimationFrame(step);
			else finishTurn(d);
		};
		requestAnimationFrame(step);
		return;
	}
	// 2D: spin the flat board frame by frame; the light and shadows turn the other way so they keep coming from the top
	// of the screen
	const svgs = ["board", "qboard", "mtboard"]
		.map((id) => document.getElementById(id))
		.filter((s): s is HTMLElement => s !== null && s.getClientRects().length > 0);
	const frame = (a: number): void =>
	{
		const rad = (a * Math.PI) / 180,
			sn = Math.sin(rad),
			cs = Math.cos(rad);
		for (const s of svgs)
		{
			s.style.transformOrigin = s.dataset["org"] ?? "50% 50%";
			s.style.transform = a ? `rotate(${a}deg)` : "";
			s.querySelectorAll("linearGradient,radialGradient").forEach((g) =>
			{
				if (a) g.setAttribute("gradientTransform", `rotate(${-a} .5 .5)`);
				else g.removeAttribute("gradientTransform");
			});
			s.querySelectorAll<SVGGElement>('g[transform^="translate(0,"],g[data-sy]').forEach((g) =>
			{
				if (g.dataset["sy"] === undefined)
				{
					// The original escaped this pattern twice, so it looks for a backslash and never matches: a plain
					// shadow keeps its offset while the board spins. Kept as it was, so the spin looks the same.
					const m = /translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/.exec(g.getAttribute("transform") ?? "");
					if (!m) return;
					g.dataset["sx"] = m[1];
					g.dataset["sy"] = m[2];
				}
				const sx = Number(g.dataset["sx"]) || 0,
					sy = Number(g.dataset["sy"]);
				g.setAttribute(
					"transform",
					`translate(${(sx * cs + sy * sn).toFixed(2)},${(-sx * sn + sy * cs).toFixed(2)})`,
				);
			});
		}
	};
	const step = (now: number): void =>
	{
		const k = Math.min(1, (now - t0) / dur);
		frame(d * 90 * ease(k));
		if (k < 1) requestAnimationFrame(step);
		else
		{
			frame(0);
			finishTurn(d);
		}
	};
	requestAnimationFrame(step);
}
