import { rekentaalDemo } from "./rekentaal-demo";
import { balklaag } from "./balklaag";
import { ligger } from "./ligger";
import { tweepaalspoer } from "./tweepaalspoer";
import { doorsnedeSpanningen } from "./doorsnede-spanningen";
// 台灣版（rc112 混凝土結構設計規範）
import { twRcBeam } from "./tw-rc-beam";
import { twRcColumn } from "./tw-rc-column";
import { twIsolatedFooting } from "./tw-isolated-footing";
// 台灣版（steel99 鋼結構設計規範）
import { twSteelBeam } from "./tw-steel-beam";
import { twSteelColumn } from "./tw-steel-column";
// 台灣版（found112 / swc_tech 基礎與土木水保規範）
import { twRetainingWall } from "./tw-retaining-wall";
import { twDrainageChannel } from "./tw-drainage-channel";
import { twDetentionBasin } from "./tw-detention-basin";
import { twBoxCulvert } from "./tw-box-culvert";
import { twSedimentBasin } from "./tw-sediment-basin";
import { twSeismicLoad } from "./tw-seismic-load";
import { twWindLoad } from "./tw-wind-load";
import { twDeadLiveLoads } from "./tw-dead-live-loads";
import { twRcSlab } from "./tw-rc-slab";
import { twPileCap } from "./tw-pile-cap";
import { twPileFoundation } from "./tw-pile-foundation";
import { twGravityRetainingWall } from "./tw-gravity-retaining-wall";
import { twBackwaterProfile } from "./tw-backwater-profile";
import { twBridgeSeismic } from "./tw-bridge-seismic";

export const templates: Record<string, string> = {
  "balklaag": balklaag,
  "ligger": ligger,
  "tweepaalspoer": tweepaalspoer,
  "doorsnede-spanningen": doorsnedeSpanningen,
  "rekentaal-demo": rekentaalDemo,
  // 台灣版模組
  "tw-rc-beam": twRcBeam,
  "tw-rc-column": twRcColumn,
  "tw-isolated-footing": twIsolatedFooting,
  "tw-steel-beam": twSteelBeam,
  "tw-steel-column": twSteelColumn,
  "tw-retaining-wall": twRetainingWall,
  "tw-drainage-channel": twDrainageChannel,
  "tw-detention-basin": twDetentionBasin,
  "tw-box-culvert": twBoxCulvert,
  "tw-sediment-basin": twSedimentBasin,
  "tw-seismic-load": twSeismicLoad,
  "tw-wind-load": twWindLoad,
  "tw-dead-live-loads": twDeadLiveLoads,
  "tw-rc-slab": twRcSlab,
  "tw-pile-cap": twPileCap,
  "tw-pile-foundation": twPileFoundation,
  "tw-gravity-retaining-wall": twGravityRetainingWall,
  "tw-backwater-profile": twBackwaterProfile,
  "tw-bridge-seismic": twBridgeSeismic,
};
