/**
 * 台灣結構型鋼規格表檢查（packages/desktop/src/components/calc/twProfielen.ts）
 *
 * 涵蓋 H 型鋼、槽鋼、等邊角鋼、不等邊角鋼、方矩形鋼管、圓形鋼管。
 *
 * 1. 內部自洽（所有表）：id 唯一；i = √(I/A)；W = I/(h/2)（或 I/e）；質量 = 0.785 × A（7850 kg/m³）。
 *    這不能證明手冊值等於 CNS 官方表，只能抓出抄錯位數、欄位錯置。官方表逐列核對尚未完成，
 *    見 docs/tw/規範來源.md §5.11。
 * 2. 方管、圓管：以獨立數值積分（逐條切片）重算面積、慣性矩、塑性模數，與閉合式產生的表比對。
 *    2b. H 型鋼第 1～19 列：釘死東和鋼鐵型錄（使用者提供，非官方正本）之尺寸、圓角 R、單重，
 *        並以含圓角切片積分重算 A、Ix、Zx、Iy、Zy。
 * 3. 槽鋼／角鋼：同一系列內，厚度增加則 A、I 單調增加；等邊角鋼 Ix = Iy。
 * 4. 矩陣與查表：矩陣字串經計算核心取值，每個量必須帶正確單位且等於表值。
 * 5. 回歸：H 型鋼仍為 20 列，既有鋼梁／鋼柱模組使用的 id 與欄位不變。
 *
 * 執行：node scripts/check-tw-profielen.mjs（需已建置 core）
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";
import * as P from "../packages/desktop/src/components/calc/twProfielen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

console.log("=== 台灣結構型鋼規格表（twProfielen） ===\n");

// ── 1. 內部自洽 ──────────────────────────────────────────────────────
console.log("1. 內部自洽（i = √(I/A)、W = I/e、質量 = 0.785·A）");
const H = P.TW_H_TABEL, C = P.TW_C_TABEL, LE = P.TW_L_EQ_TABEL, LU = P.TW_L_UEQ_TABEL, BX = P.TW_BOX_TABEL, PP = P.TW_PIPE_TABEL;

function eenduidig(naam, tabel) {
  const ids = tabel.map((r) => r[0]);
  const namen = tabel.map((r) => r[1]);
  meld(new Set(ids).size === ids.length && new Set(namen).size === namen.length && ids.every((v, i) => v === i + 1), `${naam}：${tabel.length} 列，id 為 1..n 且名稱不重複`);
}
[["H 型鋼", H], ["槽鋼", C], ["等邊角鋼", LE], ["不等邊角鋼", LU], ["方管", BX], ["圓管", PP]].forEach(([n, t]) => eenduidig(n, t));

function ruim(naam, rijen, tol, f) {
  const slecht = [];
  for (const r of rijen) {
    const afw = f(r);
    if (afw === null) continue;
    if (afw.some((x) => !(x <= tol))) slecht.push(`${r[1]}(${afw.map((x) => (x * 100).toFixed(2)).join("/")}%)`);
  }
  meld(slecht.length === 0, naam, slecht.slice(0, 6).join("; "));
}
// H：[h,A,Ix,Wx,ix,Iy,Wy,iy,w] 索引見 TwHRegel
ruim("H 型鋼：ix、iy、Wx、Wy、質量", H, 0.03, (r) => [
  rel(Math.sqrt(r[8] / r[7]), r[11]), rel(Math.sqrt(r[12] / r[7]), r[15]),
  rel(r[8] / (r[2] / 20), r[9]), rel(r[12] / (r[3] / 20), r[13]), rel(r[7] * 0.785, r[18]),
]);
// C：[2 h,3 b,4 tw,5 tf,6 r,7 A,8 Ix,9 Wx,10 ix,11 Iy,12 Wy,13 iy,14 w]
ruim("槽鋼：ix、iy、Wx、質量", C, 0.01, (r) => [
  rel(Math.sqrt(r[8] / r[7]), r[10]), rel(Math.sqrt(r[11] / r[7]), r[13]),
  rel(r[8] / (r[2] / 20), r[9]), rel(r[7] * 0.785, r[14]),
]);
// 等邊：[2 b,3 t,4 r1,5 A,6 Ix,7 Wx,8 ix,9 Iy,10 Wy,11 iy,12 w]
ruim("等邊角鋼：ix、質量，且 Ix = Iy", LE, 0.01, (r) => [
  rel(Math.sqrt(r[6] / r[5]), r[8]), rel(r[5] * 0.785, r[12]), r[6] === r[9] && r[7] === r[10] && r[8] === r[11] ? 0 : 1,
]);
// 不等邊：[2 B,3 b,4 t,5 r1,6 A,7 Ix,8 Wx,9 ix,10 Iy,11 Wy,12 iy,13 w]
ruim("不等邊角鋼：ix、iy、質量", LU, 0.01, (r) => [
  rel(Math.sqrt(r[7] / r[6]), r[9]), rel(Math.sqrt(r[10] / r[6]), r[12]), rel(r[6] * 0.785, r[13]),
]);
// BOX：[2 h,3 b,4 t,5 A,6 Ix,7 Wx,8 Zx,9 ix,10 Iy,11 Wy,12 Zy,13 iy,14 w]
ruim("方管：ix、iy、Wx、Wy、質量", BX, 0.005, (r) => [
  rel(Math.sqrt(r[6] / r[5]), r[9]), rel(Math.sqrt(r[10] / r[5]), r[13]),
  rel(r[6] / (r[2] / 20), r[7]), rel(r[10] / (r[3] / 20), r[11]), rel(r[5] * 0.785, r[14]),
]);
// PIPE：[2 D,3 t,4 A,5 I,6 W,7 Z,8 i,9 w]
ruim("圓管：i、W、質量", PP, 0.01, (r) => [
  rel(Math.sqrt(r[5] / r[4]), r[8]), rel(r[5] / (r[2] / 20), r[6]), rel(r[4] * 0.785, r[9]),
]);
meld(H.length === 20, "回歸：H 型鋼維持 20 列（鋼梁／鋼柱模組使用）");
meld(P.TW_PROFIELEN.length === 20 && P.TW_PROFIELEN[0].naam === "RH 100x100x6x8" && P.TW_PROFIELEN[19].naam === "RH 900x300x16x28", "回歸：TW_PROFIELEN 首尾不變");

// ── 2. 方管、圓管獨立數值積分 ─────────────────────────────────────────
console.log("\n2. 方管、圓管：逐條切片獨立數值積分");

/** 圓角矩形在高度 y（自形心起算）處的弦長 */
function breedte(w, h, r, y) {
  const ay = Math.abs(y);
  if (ay > h / 2) return 0;
  if (ay <= h / 2 - r) return w;
  const dy = ay - (h / 2 - r);
  return w - 2 * (r - Math.sqrt(Math.max(r * r - dy * dy, 0)));
}
/** 以中點法對 N 條切片積分：回傳 A、Ix（繞水平形心軸）、Z（塑性模數＝2×上半面積一次矩） */
function integreer(w, h, r, N = 40000) {
  const dy = h / N;
  let A = 0, I = 0, Q = 0;
  for (let i = 0; i < N; i++) {
    const y = -h / 2 + (i + 0.5) * dy;
    const dA = breedte(w, h, r, y) * dy;
    A += dA; I += dA * y * y; if (y > 0) Q += dA * y;
  }
  return { A, I, Z: 2 * Q };
}
{
  const slecht = [];
  for (const [id, , h, b, t, A, Ix, , Zx, , Iy, , Zy] of BX) {
    const ro = 2 * t, ri = t;
    const ux = integreer(b, h, ro), ix = integreer(b - 2 * t, h - 2 * t, ri);
    const uy = integreer(h, b, ro), iy = integreer(h - 2 * t, b - 2 * t, ri);
    const gA = (ux.A - ix.A) / 100, gIx = (ux.I - ix.I) / 1e4, gZx = (ux.Z - ix.Z) / 1e3;
    const gIy = (uy.I - iy.I) / 1e4, gZy = (uy.Z - iy.Z) / 1e3;
    // 表值四捨五入到 0.01／0.1 cm 單位：容許 0.1% 加絕對 0.06
    const nabij = (x, y, abs) => Math.abs(x - y) <= Math.max(abs, y * 0.001);
    if (!(nabij(A, gA, 0.006) && nabij(Ix, gIx, 0.06) && nabij(Zx, gZx, 0.06) && nabij(Iy, gIy, 0.06) && nabij(Zy, gZy, 0.06))) slecht.push(`#${id}`);
  }
  meld(slecht.length === 0, "方管 14 列：A、Ix、Iy、Zx、Zy 與數值積分一致（外角 2t、內角 t）", slecht.join(","));
  meld(BX.every((r) => r[2] === r[3] && r[6] === r[10] && r[8] === r[12]), "方管：均為正方形，x、y 向性質相同");
}
{
  const slecht = [];
  for (const [id, , D, t, A, I, , Z] of PP) {
    const u = integreer(D, D, D / 2), i = integreer(D - 2 * t, D - 2 * t, (D - 2 * t) / 2);
    const gA = (u.A - i.A) / 100, gI = (u.I - i.I) / 1e4, gZ = (u.Z - i.Z) / 1e3;
    const nabij = (x, y, abs) => Math.abs(x - y) <= Math.max(abs, y * 0.002);
    if (!(nabij(A, gA, 0.006) && nabij(I, gI, 0.06) && nabij(Z, gZ, 0.06))) slecht.push(`#${id}`);
  }
  meld(slecht.length === 0, "圓管 15 列：A、I、Z 與數值積分一致", slecht.join(","));
}

// ── 2b. H 型鋼：型錄尺寸＋圓角 R 逐條切片積分 ─────────────────────────
// 型錄來源（使用者提供，製造商型錄、非官方 CNS 原件，待使用者覆核）：
//   東和鋼鐵「H型鋼 中國國家標準(CNS)&日本工業規格(JIS)」（標示 CNS 1490 G1011／JIS G 3192），
//   https://www.tunghosteel.com/Files/papp/410/ ，擷取 2026-11-14。型錄只列 H×B×t1×t2、R、單重，
//   A、I、W、Z、i 由本表以幾何（含四個圓角）推得；此處以不同方法（切片積分）重算核對。
// 第 20 列 RH 900x300x16x28 不在該型錄範圍內，維持舊值（未驗證），不納入本節。
console.log("\n2b. H 型鋼：型錄尺寸、圓角 R、單重與切片積分");
{
  // id → [h, b, tw, tf, R, 單重 kg/m]（型錄原值）
  const KATALOG = {
    1: [100, 100, 6, 8, 8, 16.9], 2: [125, 125, 6.5, 9, 8, 23.6], 3: [150, 150, 7, 10, 8, 31.1],
    4: [175, 175, 7.5, 11, 13, 40.4], 5: [200, 200, 8, 12, 13, 49.9], 6: [250, 250, 9, 14, 13, 71.8],
    7: [300, 300, 10, 15, 13, 93], 8: [350, 350, 12, 19, 13, 135], 9: [400, 400, 13, 21, 22, 171.7],
    10: [200, 100, 5.5, 8, 8, 20.9], 11: [250, 125, 6, 9, 8, 29], 12: [300, 150, 6.5, 9, 13, 36.7],
    13: [350, 175, 7, 11, 13, 49.4], 14: [400, 200, 8, 13, 13, 65.4], 15: [450, 200, 9, 14, 13, 74.9],
    16: [500, 200, 10, 16, 13, 88.2], 17: [600, 200, 11, 17, 13, 103], 18: [700, 300, 13, 24, 18, 182],
    19: [800, 300, 14, 26, 18, 207],
  };
  /** 圓角在離角點 e（0..R）處的額外寬度（每側） */
  const hoek = (R, e) => (e < 0 || e > R ? 0 : R - Math.sqrt(Math.max(R * R - (R - e) * (R - e), 0)));
  /** 繞強軸：沿 y 切片；繞弱軸：沿 x 切片。回傳 A、I、Z（mm 系） */
  function hSnede(h, b, tw, tf, R, N = 40000) {
    let A = 0, Ix = 0, Qx = 0;
    const dy = h / N;
    for (let i = 0; i < N; i++) {
      const y = -h / 2 + (i + 0.5) * dy, ay = Math.abs(y);
      const w = ay > h / 2 - tf ? b : tw + 2 * hoek(R, h / 2 - tf - ay);
      A += w * dy; Ix += w * dy * y * y; if (y > 0) Qx += w * dy * y;
    }
    let Iy = 0, Qy = 0;
    const dx = b / N;
    for (let i = 0; i < N; i++) {
      const x = -b / 2 + (i + 0.5) * dx, ax = Math.abs(x);
      const hgt = ax <= tw / 2 ? h : 2 * tf + 2 * hoek(R, ax - tw / 2);
      Iy += hgt * dx * x * x; if (x > 0) Qy += hgt * dx * x;
    }
    return { A, Ix, Zx: 2 * Qx, Iy, Zy: 2 * Qy };
  }
  const slecht = [], gewichtFout = [], maatFout = [];
  for (const r of H) {
    const k = KATALOG[r[0]];
    if (!k) continue;
    const [h, b, tw, tf, R, w] = k;
    if (!(r[2] === h && r[3] === b && r[4] === tw && r[5] === tf && r[6] === R)) maatFout.push(r[1]);
    if (r[18] !== w) gewichtFout.push(`${r[1]}(${r[18]}≠${w})`);
    const g = hSnede(h, b, tw, tf, R);
    // 表值取三位有效數字（A 取 0.01 cm²）：容許 0.6 %
    const afw = [rel(r[7], g.A / 100), rel(r[8], g.Ix / 1e4), rel(r[10], g.Zx / 1e3), rel(r[12], g.Iy / 1e4), rel(r[14], g.Zy / 1e3)];
    if (afw.some((x) => !(x <= 0.006))) slecht.push(`${r[1]}(${afw.map((x) => (x * 100).toFixed(2)).join("/")}%)`);
  }
  meld(Object.keys(KATALOG).length === 19, "型錄對照 19 列（id 1–19）");
  meld(maatFout.length === 0, "H 型鋼 19 列：h、b、tw、tf、R 等於型錄值", maatFout.join(","));
  meld(gewichtFout.length === 0, "H 型鋼 19 列：單重等於型錄值", gewichtFout.join(","));
  meld(slecht.length === 0, "H 型鋼 19 列：A、Ix、Zx、Iy、Zy 與含圓角切片積分一致（≤ 0.6 %）", slecht.join("; "));
  // 單重與 A 的關係：型錄單重 ≈ 0.785·A（7850 kg/m³），容許 0.5 %
  const wA = H.filter((r) => KATALOG[r[0]]).filter((r) => rel(r[7] * 0.785, r[18]) > 0.005).map((r) => r[1]);
  meld(wA.length === 0, "H 型鋼 19 列：型錄單重與 0.785·A 相差 ≤ 0.5 %", wA.join(","));
}

// ── 3. 單調性與幾何合理性 ─────────────────────────────────────────────
console.log("\n3. 單調性與幾何合理性");
{
  // 槽鋼：同高度、同翼寬者，板厚越大 A、Ix 越大（150x75 兩列）
  const c4 = C.find((r) => r[1] === "C 150x75x6.5x10"), c5 = C.find((r) => r[1] === "C 150x75x9x12.5");
  meld(c5[7] > c4[7] && c5[8] > c4[8] && c5[14] > c4[14], "槽鋼：C 150x75 較厚者 A、Ix、質量較大");
  // 槽鋼：高度遞增序列的 Ix 單調
  const byH = [...C].sort((a, b) => a[2] - b[2] || a[7] - b[7]);
  meld(byH.every((r, i) => i === 0 || r[8] >= byH[i - 1][8]), "槽鋼：依高度排序後 Ix 不遞減");
  for (const [naam, t, iT, iA, iI, iW] of [["等邊角鋼", LE, 3, 5, 6, 12], ["不等邊角鋼", LU, 4, 6, 7, 13]]) {
    // 同尺寸（名稱去掉最後一段）板厚遞增 → A、I、質量遞增
    const grp = new Map();
    for (const r of t) { const k = r[1].replace(/x[^x]+$/, ""); (grp.get(k) ?? grp.set(k, []).get(k)).push(r); }
    let ok = true; const bad = [];
    for (const [k, rs] of grp) for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1], b = rs[i];
      if (b[iT] > a[iT] && !(b[iA] > a[iA] && b[iI] > a[iI] && b[iW] > a[iW])) { ok = false; bad.push(k); }
    }
    meld(ok, `${naam}：同尺寸板厚增加，A、I、質量隨之增加`, bad.join(","));
  }
  meld(LE.every((r) => r[3] < r[2] / 2) && LU.every((r) => r[4] < Math.min(r[2], r[3]) / 2), "角鋼：板厚小於肢寬一半");
  meld(BX.every((r) => 2 * r[4] < Math.min(r[2], r[3])) && PP.every((r) => 2 * r[3] < r[2]), "鋼管：壁厚小於半徑");
}

// ── 4. 矩陣與查表經計算核心 ───────────────────────────────────────────
console.log("\n4. 矩陣與查表經計算核心取值");
function 取值(矩陣, 查表, 鍵) {
  const 文字 = `${矩陣}\nkey = ${鍵}\n${查表}\n`;
  return leesGetallen(evaluate(parse(文字), {}));
}
function 比對(標籤, u, 預期) {
  const 壞 = Object.entries(預期).filter(([k, v]) => !(typeof u[k] === "number" && rel(u[k], v) < 1e-9)).map(([k, v]) => `${k}: ${u[k]} ≠ ${v}`);
  meld(壞.length === 0, 標籤, 壞.slice(0, 4).join("; "));
}
// leesGetallen 回傳的是數值（以輸出單位），故比對表值 × 單位換算：mm → 係數 1 ；cm² → 1 等，取決於 leesGetallen 對單位的處理。
// 先以一組已知列試探單位慣例，再套用到全部。
{
  const r = C[6]; // C 200x80x7.5x11
  const u = 取值(P.twChannelMatrix(), P.twChannelOpzoeking("7"), 7);
  const 慣例 = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v]));
  meld(typeof u.h === "number" && typeof u.A === "number" && typeof u.w === "number", "槽鋼：查表產出 h、A、w 皆為數值", JSON.stringify(Object.keys(慣例)));
  // 單位慣例：以 h（mm）判斷，若為 0.2 表示 SI（m），若為 200 表示 mm
  const 比 = u.h / r[2];
  const si = Math.abs(比 - 0.001) < 1e-9;
  const fk = (值, 次方 = 1) => 值 * (si ? 0.001 ** 次方 : 1);
  // cm → m：0.01；為免混淆，直接用 cm 表 → m 因子
  const cm = (值, 次) => (si ? 值 * 0.01 ** 次 : 值);
  比對("槽鋼 C 200x80x7.5x11：h、b、tw、tf", u, { h: fk(r[2]), b: fk(r[3]), t_w: fk(r[4]), t_f: fk(r[5]) });
  比對("槽鋼：A、Ix、Wx、ix、Iy、Wy、iy", u, { A: cm(r[7], 2), I_x: cm(r[8], 4), W_x: cm(r[9], 3), i_x: cm(r[10], 1), I_y: cm(r[11], 4), W_y: cm(r[12], 3), i_y: cm(r[13], 1) });
  // 全部列都能查到
  let ok = true;
  for (const row of C) { const v = 取值(P.twChannelMatrix(), P.twChannelOpzoeking(String(row[0])), row[0]); if (!(rel(v.A, cm(row[7], 2)) < 1e-9)) ok = false; }
  meld(ok, `槽鋼：${C.length} 列皆可由矩陣查回 A`);
}
{
  const r = LE[8]; // L 100x100x10
  const u = 取值(P.twAngleMatrix(), P.twAngleOpzoeking("9"), 9);
  const si = Math.abs(u.b / r[2] - 0.001) < 1e-9;
  const cm = (值, 次) => (si ? 值 * 0.01 ** 次 : 值);
  比對("等邊角鋼 L 100x100x10：A、Ix、Iy = Ix、ix、iy = ix", u, { A: cm(r[5], 2), I_x: cm(r[6], 4), I_y: cm(r[6], 4), i_x: cm(r[8], 1), i_y: cm(r[8], 1) });
}
{
  const r = LU[5]; // L 125x75x10
  const u = 取值(P.twUnequalAngleMatrix(), P.twUnequalAngleOpzoeking("6"), 6);
  const si = Math.abs(u.B / r[2] - 0.001) < 1e-9;
  const cm = (值, 次) => (si ? 值 * 0.01 ** 次 : 值);
  比對("不等邊角鋼 L 125x75x10：A、Ix、Iy、iy", u, { A: cm(r[6], 2), I_x: cm(r[7], 4), I_y: cm(r[10], 4), i_y: cm(r[12], 1) });
}
{
  const r = BX[4]; // BOX 150x150x6
  const u = 取值(P.twBoxMatrix(), P.twBoxOpzoeking("5"), 5);
  const si = Math.abs(u.h / r[2] - 0.001) < 1e-9;
  const cm = (值, 次) => (si ? 值 * 0.01 ** 次 : 值);
  比對("方管 BOX 150x150x6：A、Ix、Zx、Iy、Zy", u, { A: cm(r[5], 2), I_x: cm(r[6], 4), Z_x: cm(r[8], 3), I_y: cm(r[10], 4), Z_y: cm(r[12], 3) });
}
{
  const r = PP[8]; // PIPE 165.2x6
  const u = 取值(P.twPipeMatrix(), P.twPipeOpzoeking("9"), 9);
  const si = Math.abs(u.D / r[2] - 0.001) < 1e-9;
  const cm = (值, 次) => (si ? 值 * 0.01 ** 次 : 值);
  比對("圓管 PIPE 165.2x6：A、I、Z、I_y = I_x", u, { A: cm(r[4], 2), I_x: cm(r[5], 4), Z_x: cm(r[7], 3), I_y: cm(r[5], 4), Z_y: cm(r[7], 3) });
}
{
  // 指定 ids 子集；未知 id 拋錯
  const sub = P.twChannelMatrix({ ids: [1, 3] });
  meld(sub.includes("tw_channels = [1; 3 |"), "矩陣：ids 子集只含指定列");
  let 拋 = false; try { P.twPipeMatrix({ ids: [99] }); } catch { 拋 = true; }
  meld(拋, "矩陣：未知 id 拋出錯誤");
}

// ── 5. 鋼材等級 ───────────────────────────────────────────────────────
console.log("\n5. 鋼材等級");
{
  const K = P.TW_STAAL_KWALITEITEN;
  const 舊 = ["SS400", "SM400", "SM490", "SN400B", "SN490B"];
  meld(舊.every((k) => K[k]) && K.SS400.fy === 245 && K.SM490.fy === 325 && K.SN490B.sn === true, "回歸：原五種鋼材等級不變");
  meld(["STKR400", "STKR490", "STK400", "STK490"].every((k) => K[k] && K[k].E === 200000 && K[k].G === 79000), "新增鋼管等級 STKR400／STKR490／STK400／STK490（E、G 同 steel99）");
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
