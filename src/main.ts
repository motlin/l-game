import {registerServiceWorker} from "./pwa/register.ts";

// The game itself is the inline scripts in index.html, as it came from the artifact. This module adds offline play.
registerServiceWorker();
