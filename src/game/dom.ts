// The element a selector names. The markup in index.html always has it, so a miss is a bug, as it was in the original.
export const $ = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

// The element a selector names, which has to be of the given kind, such as an input or the board's SVG.
export function $as<T extends Element>(selector: string, kind: new () => T): T
{
	const el = document.querySelector(selector);
	if (!(el instanceof kind)) throw new Error(`${selector} is missing or the wrong kind of element`);
	return el;
}

export const $$ = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];

// The elements a selector names that are of the given kind.
export const $$as = <T extends Element>(selector: string, kind: new () => T): T[] =>
	[...document.querySelectorAll(selector)].filter((el): el is T => el instanceof kind);

// The nearest element around an event's target that matches the selector, HTML or SVG.
export function closest(event: Event, selector: string): HTMLElement | SVGElement | null
{
	const el = event.target instanceof Element ? event.target.closest(selector) : null;
	return el instanceof HTMLElement || el instanceof SVGElement ? el : null;
}

// Saved JSON is read back as the shape the game wrote, as the original trusted it to be.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- the one place saved JSON is given its type, as the original trusted it
export const parseJSON = <T>(text: string): T => JSON.parse(text) as T;

// Player names go into markup, so the characters that would break it become look-alikes.
export const cleanName = (name: string | null | undefined): string =>
	(name ?? "")
		.replace(/'/g, "’")
		.replace(/"/g, "”")
		.replace(/`/g, "‘")
		.replace(/&/g, "＆")
		.replace(/</g, "‹")
		.replace(/>/g, "›")
		.trim();

// Copies a position code, or selects it for the keyboard when the clipboard is out of reach.
export function copyCode(code: string, box: HTMLElement, message: HTMLElement): void
{
	const fail = (): void =>
	{
		const range = document.createRange();
		range.selectNodeContents(box);
		const selection = getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		message.textContent = "Selected. Copy it with your keyboard.";
	};
	try
	{
		navigator.clipboard.writeText(code).then(() =>
		{
			message.textContent = `Copied ${code}.`;
			return code;
		}, fail);
	}
	catch
	{
		fail();
	}
}
