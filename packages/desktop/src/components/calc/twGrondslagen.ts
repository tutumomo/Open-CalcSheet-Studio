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
    hint: "一般區域及近斷層區域：S_DS = F_a·S_S^D（seis113 第 2.5 節）；臺北盆地依微分區查表（seis113 第 2.7.1 節）。",
  },
  {
    naam: "tw_SD1",
    label: "工址一秒週期設計水平譜加速度係數 S_D1",
    standaard: "0.48",
    hint: "一般區域及近斷層區域：S_D1 = F_v·S_1^D（seis113 第 2.5 節）；臺北盆地依微分區查表（seis113 第 2.7.1 節）。",
  },
  {
    naam: "tw_V10",
    label: "基本設計風速 V_10 (m/s)",
    standaard: "37.5",
    opties: [
      // 分區摘錄自已驗證表 wind103full_V10_zones；同一縣市各鄉鎮市區分屬不同風速區，須逐區查表
      { label: "47.5 m/s（例：花蓮市、吉安鄉、恆春鎮、滿州鄉）", waarde: "47.5" },
      { label: "42.5 m/s（例：基隆市、臺北市全區、新北市淡水與汐止等區）", waarde: "42.5" },
      { label: "37.5 m/s（例：新北市板橋與新莊等區、桃園各區、臺南市中西與安平等區）", waarde: "37.5" },
      { label: "32.5 m/s（例：新竹市、苗栗縣、臺中市中與西屯等區）", waarde: "32.5" },
      { label: "27.5 m/s（例：臺中市烏日與大里等區、彰化市、嘉義市）", waarde: "27.5" },
      { label: "22.5 m/s（南投縣竹山鎮、水里鄉、集集鎮、鹿谷鄉）", waarde: "22.5" },
    ],
    hint: "地況 C、離地面 10 公尺高、50 年回歸期之 10 分鐘平均風速，依耐風設計規範（wind103full）第 2.4 節逐鄉鎮市區查表；外島另訂（如金門 35、澎湖 33、蘭嶼 65 m/s），不在上列選項中，須另行輸入。",
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
    hint: "依建築物耐風設計規範（wind103full）之地況分類；選項說明為摘要，判定時以規範原文為準。",
  },
];

/**
 * 混凝土結構因數化載重組合（rc112 表 5.3.1）片段。
 * 尚未完成：目前只有 (5.3.1a)、(5.3.1b) 去掉 Lr／S／R 項之形式，完整 7 組見 rapport/tw/normwaarden.ts；
 * 接成 #include 前不得用於檢核。
 */
export const TW_RC_BELASTINGCOMBINATIES = `
'<h6>設計載重組合（rc112 第 5.3 節）</h6>
#hide
U_1 = 1.4*D
U_2 = 1.2*D + 1.6*L
#show
`;

/**
 * 鋼結構容許應力法（ASD）載重組合（steel99 第 2.2 節式 2.2-1～2.2-5）片段；尚未完成，只有前兩式：
 */
export const TW_STEEL_ASD_COMBINATIES = `
'<h6>容許應力設計載重組合（steel99 ASD）</h6>
#hide
Ra_1 = D
Ra_2 = D + L
#show
`;
