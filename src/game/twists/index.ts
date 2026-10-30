import { beach } from "./beach";
import { colosseum } from "./colosseum";
import { cupFinal } from "./cupfinal";
import { funfair } from "./funfair";
import { haunted } from "./haunted";
import { mars } from "./mars";
import { moon } from "./moon";
import { pisa } from "./pisa";
import { sakura } from "./sakura";
import { snow } from "./snow";
import { space } from "./space";
import type { TwistKind, TwistRule } from "./twist";
import { underwater } from "./underwater";
import { PLAIN, type TwistContext, type TwistView } from "./view";
import { volcano } from "./volcano";

// Builds the view of a round's twist, for the scene (see ./view.ts).

const VIEWS: Record<TwistKind, (context: TwistContext, rule: TwistRule) => TwistView> = {
  zap: moon,
  breeze: beach,
  snow,
  sway: underwater,
  bombs: volcano,
  dust: mars,
  warp: space,
  bounce: funfair,
  haunt: haunted,
  flare: cupFinal,
  verdict: colosseum,
  lean: pisa,
  gale: sakura,
};

export const buildTwist = (context: TwistContext): TwistView => {
  const rule = context.rules.twist;
  return rule ? VIEWS[rule.kind](context, rule) : PLAIN;
};

export type { Dressing, TwistView } from "./view";
