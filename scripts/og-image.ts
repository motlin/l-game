import {readFileSync} from "node:fs";
import {chromium} from "@playwright/test";

// Renders scripts/icons/og.svg to public/og.jpg in Chromium, with Lexend loaded from Google Fonts as the page loads it.
const svg = readFileSync("scripts/icons/og.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage(
	{
		viewport:
		{
			width: 1200,
			height: 630,
		},
	},
);
await page.setContent(
	`<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=block" rel="stylesheet">
<style>body{margin:0}svg{display:block}</style>${svg}`,
	{
		waitUntil: "networkidle",
	},
);
await page.evaluate(async () => document.fonts.ready.then(() => undefined));
await page.screenshot(
	{
		path: "public/og.jpg",
		type: "jpeg",
		quality: 85,
	},
);
await browser.close();
