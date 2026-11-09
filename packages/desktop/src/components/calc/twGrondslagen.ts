/**
 * 台灣專案設計基礎與載重組合 — 依據建築技術規則構造編、seis113、wind103、rc112、steel99。
 *
 * 本檔提供全專案共用的台灣設計參數定義與標準載重組合片段，
 * 變數名稱加上 tw_ 前綴，嚴格避免與 Eurocode 既有變數衝突（AGENTS.md §3）。
 */

export interface TwProjectGegevenVeld {
  naam: string;
  label: string;
  standaard: string;
  hint: string;
  opties?: { label: string; waarde: string }[];
}

export const TW_PROJECT_VELDEN: TwProjectGegevenVeld[] = [
  {
    naam: "tw_I",
    label: "耐震用途係數 I",
    standaard: "1.0",
    opties: [
      { label: "第一類（地震災後須維持機能救濟大眾，如醫院、消防、電信等）：I = 1.5", waarde: "1.5" },
      { label: "第二類（儲存多量毒性、爆炸性等危險物品之建築物）：I = 1.5", waarde: "1.5" },
      { label: "第三類（人群聚集場所達一定比例，如學校、大型集會場所）：I = 1.25", waarde: "1.25" },
      { label: "第四類（其他一般建築物）：I = 1.0", waarde: "1.0" },
    ],
    hint: "依據建築技術規則建築構造編第 43-1 條（已驗證表 btr_struct_seismic_I）及 seis113。",
  },
  {
    naam: "tw_SDS",
    label: "工址短週期設計水平譜加速度係數 S_DS",
    standaard: "0.80",
    hint: "由工址震區短週期譜加速度係數 S_S 與地盤放大係數 F_a 決定：S_DS = (2/3)·F_a·S_S（seis113 第 2.3 節）。",
  },
  {
    naam: "tw_SD1",
    label: "工址一秒週期設計水平譜加速度係數 S_D1",
    standaard: "0.48",
    hint: "由工址一秒週期譜加速度係數 S_1 與地盤放大係數 F_v 決定：S_D1 = (2/3)·F_v·S_1（seis113 第 2.3 節）。",
  },
  {
    naam: "tw_V10",
    label: "基本設計風速 V_10 (m/s)",
    standaard: "37.5",
    opties: [
      { label: "47.5 m/s（花蓮市、吉安、屏東恆春、滿州等）", waarde: "47.5" },
      { label: "42.5 m/s（臺北市、基隆市、新北北海岸、宜蘭沿海等）", waarde: "42.5" },
      { label: "37.5 m/s（新北市區、桃園市、高雄市區、屏東一般等）", waarde: "37.5" },
      { label: "32.5 m/s（臺中市區、新竹市、苗栗縣、臺南市區等）", waarde: "32.5" },
      { label: "27.5 m/s（彰化縣、雲林縣、嘉義市、南投一般等）", waarde: "27.5" },
    ],
    hint: "離地面 10 公尺高、50 年回歸期、10 分鐘平均之基本設計風速（建築技術規則第 33 條、耐風規範 wind103full 第 2.4 節）。",
  },
  {
    naam: "tw_terrein",
    label: "地況分類",
    standaard: "B",
    opties: [
      { label: "地況 A：大城市中心，至少半數建築物高度超過 20 公尺", waarde: "A" },
      { label: "地況 B：郊區、小市鎮或有中等高度障礙物之散布地區", waarde: "B" },
      { label: "地況 C：平坦開闊地面、水面或海岸地區", waarde: "C" },
    ],
    hint: "建築物耐風設計規範（wind103full）第 2.5 節及建築技術規則第 32 條。",
  },
];

/**
 * 混凝土結構極限載重組合（rc112 第 5.3 節、建築技術規則第 57 條）：
 * 包含 D（靜載重）、L（活載重）、E（地震力）、W（風力）。
 */
export const TW_RC_BELASTINGCOMBINATIES = `
'<h6>設計載重組合（rc112 第 5.3 節）</h6>
#hide
U_1 = 1.4*D
U_2 = 1.2*D + 1.6*L
#show
`;

/**
 * 鋼結構容許應力法（ASD）載重組合（steel99 第 1.5 節）：
 */
export const TW_STEEL_ASD_COMBINATIES = `
'<h6>容許應力設計載重組合（steel99 ASD）</h6>
#hide
Ra_1 = D
Ra_2 = D + L
#show
`;
