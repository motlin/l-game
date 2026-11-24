import {expect, type Page, test} from "@playwright/test";
import {serveFonts} from "./harness/fonts.ts";

// Opens the game the way a returning player sees it, past the first-visit lesson, and collects page errors.
async function open(page: Page): Promise<string[]>
{
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await serveFonts(page);
	await page.goto("/");
	await page.locator("#tutSkip").click();
	return errors;
}

// Drags across board squares, given as indexes on an n by n board, the way a player swipes a piece into place.
async function swipe(page: Page, board: string, cells: number[], n: number): Promise<void>
{
	const box = (await page.locator(board).boundingBox())!;
	const at = (c: number): [number, number] => [
		box.x + ((c % n) + 0.5) * (box.width / n),
		box.y + (Math.floor(c / n) + 0.5) * (box.height / n),
	];
	await page.mouse.move(...at(cells[0]!));
	await page.mouse.down();
	for (const c of cells.slice(1))
		await page.mouse.move(
			...at(c),
			{
				steps: 4,
			},
		);
	await page.mouse.up();
}

test("a 2-player game against the computer takes a move and answers it", async ({page}) =>
{
	const errors = await open(page);
	await expect(page.locator("#codeNow")).toHaveText("C5 N1 AP");
	// The red L on B C G K moves to C G K L, which keeps the game a draw, so the computer cannot win at once.
	await swipe(page, "#board", [2, 6, 10, 11], 4);
	await expect(page.locator("#status")).toHaveText("Your move: a disc (optional)");
	await page.locator("#skip").click();
	await expect(page.locator("#status")).toHaveText("Computer (P2) is moving");
	await expect(page.locator("#status")).toHaveText(
		"Your move: place the L",
		{
			timeout: 10_000,
		},
	);
	await expect(page.locator("#codeNow")).not.toHaveText("C5 N1 AP");
	expect(errors).toStrictEqual([]);
});

test("switching to 4 players shows the battle board with four L's and four blockers", async ({page}) =>
{
	const errors = await open(page);
	await page
		.getByText(
			"4 players",
			{
				exact: true,
			},
		)
		.click();
	await expect(page.locator("#quad")).toBeVisible();
	await expect(page.locator("main.game")).toBeHidden();
	await expect(page.locator("#qstatus")).toHaveText("P1: move your L");
	await expect(page.locator("#qcodeNow")).toHaveText("1 B41 C23 E35 D57 A1 A6 F1 F6");
	await expect.poll(async () => page.locator("svg#qboard rect").count()).toBeGreaterThanOrEqual(36);
	expect(errors).toStrictEqual([]);
});

test("switching to the T game reloads as the T game with its own opening", async ({page}) =>
{
	const errors = await open(page);
	await page
		.getByText(
			"T game",
			{
				exact: true,
			},
		)
		.click();
	await expect(page.locator("header h1")).toHaveText("The T Game");
	await expect(page).toHaveTitle("The T Game");
	await expect(page.locator("#codeNow")).toHaveText("B3 K3 P1");
	await expect(page.locator("#status")).toHaveText("Your move: place the T");
	expect(errors).toStrictEqual([]);
});
