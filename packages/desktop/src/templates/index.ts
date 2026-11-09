import { rekentaalDemo } from "./rekentaal-demo";
import { balklaag } from "./balklaag";
import { ligger } from "./ligger";
import { tweepaalspoer } from "./tweepaalspoer";
import { doorsnedeSpanningen } from "./doorsnede-spanningen";
// 台灣版（rc112 混凝土結構設計規範）
import { twRcBeam } from "./tw-rc-beam";
import { twRcColumn } from "./tw-rc-column";
// 台灣版（steel99 鋼結構設計規範）
import { twSteelBeam } from "./tw-steel-beam";

export const templates: Record<string, string> = {
  "balklaag": balklaag,
  "ligger": ligger,
  "tweepaalspoer": tweepaalspoer,
  "doorsnede-spanningen": doorsnedeSpanningen,
  "rekentaal-demo": rekentaalDemo,
  // 台灣版模組
  "tw-rc-beam": twRcBeam,
  "tw-rc-column": twRcColumn,
  "tw-steel-beam": twSteelBeam,
};
