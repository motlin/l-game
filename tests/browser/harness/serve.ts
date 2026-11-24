import {spawn} from "node:child_process";
import {join, resolve} from "node:path";

process.title = "l-game-harness";

// Serves dist/ through `wrangler dev` on miniflare, the way Cloudflare serves it, including public/_headers.
// Nothing touches the account.
const root = resolve(import.meta.dirname, "../../..");
const wrangler = join(root, "node_modules/.bin/wrangler");
const port = process.env["L_GAME_PORT"] ?? "4828";
const dev = spawn(
	wrangler,
	["dev", "--port", port, "--ip", "127.0.0.1", "--show-interactive-dev-session=false"],
	{
		cwd: root,
		env:
		{
			...process.env,
			CI: "1",
			WRANGLER_SEND_METRICS: "false",
		},
		stdio: "inherit",
	},
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => dev.kill(signal));
dev.on("exit", (code) => process.exit(code ?? 0));
