import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// The 1990 look, over the game's own; leave it out and the game is as it was (see italia90.css).
import { listenForFirstTap } from "./game/music";
import "./italia90.css";
import { LEAGUE_PATTERN } from "./teams";
import { wipeSaved } from "./wipe";

wipeSaved();
listenForFirstTap();
if (LEAGUE_PATTERN) {
  document.documentElement.style.setProperty("--league-pattern", `url("${LEAGUE_PATTERN}")`);
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
