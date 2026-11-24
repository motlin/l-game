import {expect, test} from "@playwright/test";

test("the game loads, draws the board and reports no errors", async ({page}) =>
{
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(page.locator("header h1")).toHaveText("The L Game");
	await expect(page.locator("svg#board")).toBeVisible();
	await expect.poll(async () => page.locator("svg#board rect").count()).toBeGreaterThanOrEqual(16);
	await expect(page.locator("#errbar")).toHaveCount(0);
	expect(errors).toStrictEqual([]);
});
