import {initBattle} from "./game/battle/game.ts";
import {initClassic} from "./game/classic/game.ts";
import {initErrorBar} from "./game/errors.ts";
import {initHeader, initViews} from "./game/modes.ts";
import {initScreens} from "./game/screen.ts";
import {initTiles} from "./game/tiles/game.ts";
import {initVariant} from "./game/variant.ts";
import {registerServiceWorker} from "./pwa/register.ts";

// Boots the page in the order its inline scripts ran: the piece's wording, the error bar, the 2-player game, the
// battle and the view controls, Moving Tiles, the header, and the setup and play screens. Each part starts on its own, as each script did, so a
// failure in one leaves the others working and shows in the error bar.
initVariant();
initErrorBar();
for (const init of [initClassic, initBattle, initViews, initTiles, initHeader, initScreens])
{
	try
	{
		init();
	}
	catch (error)
	{
		reportError(error);
	}
}
registerServiceWorker();
