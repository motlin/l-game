// A red bar along the bottom of the page for any script error, so a player can report it.
export function initErrorBar(): void
{
	window.addEventListener("error", (e) =>
	{
		try
		{
			let b = document.getElementById("errbar");
			if (!b)
			{
				b = document.createElement("div");
				b.id = "errbar";
				b.style.cssText =
					"position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#d13b30;color:#fff;font:14px/1.4 system-ui;padding:10px 14px;border-radius:12px";
				document.body.appendChild(b);
			}
			b.textContent = `Something went wrong: ${e.message} (line ${e.lineno}:${e.colno})`;
		}
		catch
		{
			// Nowhere left to report it.
		}
	});
}
