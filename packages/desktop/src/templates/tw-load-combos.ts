/**
 * 台灣載重組合共用 #include 片段（階段 2b／3）。
 *
 * 在計算表中以 `#include tw-load-combos-rc112.cpd`（或 `…-steel-asd.cpd`）引入，
 * 之後即可呼叫下列函式；片段只定義函式，不印出任何結果，也不引入任何輸入變數。
 * 引數可帶單位（例如 `5*(kN/m^2)`），結果單位與引數相同；各引數須為同一類量（同為力、同為彎矩等）。
 *
 * 來源（A 級已驗證庫，見 docs/tw/規範來源.md §5.12）：
 *   - rc112 表 5.3.1（建築物混凝土結構設計規範 112.08.10）：regs_table rc112_load_combinations_T531
 *   - steel99 第 2.2 節式 2.2-1～2.2-5（容許應力設計法）：regs_table steel99_load_combos_ASD
 *   - 建築技術規則建築構造編第 413-1 條、第 235-2 條：載重因數及載重組合於設計規範定之，
 *     故本片段不另設建築技術規則專屬係數，只是把該二條所指向的設計規範組合整理成可引用的函式。
 *
 * 注意：
 *   - 強度設計組合（rc112）與容許應力組合（steel99 ASD）不可混用。
 *   - steel99 極限設計法（LRFD）組合尚無已驗證結構化表，本片段不含；缺口見規範來源 §5.12。
 *   - 活載重 L 可依建築技術規則第 17 條折減，折減由使用者先做好再代入；本片段不折減。
 *   - 片段不判斷載重是否有利或不利；W、E 的正負號（「±」）由呼叫端決定，或用 `_p`／`_m` 兩版本。
 */

/** rc112 表 5.3.1 強度設計因數化載重組合 */
export const twLoadCombosRc112 = `'<h6>載重組合函式（rc112 表 5.3.1）：rc_U1 … rc_U7、rc_Umax</h6>
#hide
rc_U1(D) = 1.4*D
rc_U2(D; L; Q) = 1.2*D + 1.6*L + 0.5*Q
rc_U3a(D; L; Q) = 1.2*D + 1.6*Q + 1.0*L
rc_U3b(D; W; Q) = 1.2*D + 1.6*Q + 0.8*W
rc_U3(D; L; W; Q) = max(rc_U3a(D; L; Q); rc_U3b(D; W; Q))
rc_U4(D; L; W; Q) = 1.2*D + 1.6*W + 1.0*L + 0.5*Q
rc_U5(D; L; E; S) = 1.2*D + 1.0*E + 1.0*L + 0.2*S
rc_U6(D; W) = 0.9*D + 1.6*W
rc_U7(D; E) = 0.9*D + 1.0*E
rc_Umax(D; L; Q; W; E; S) = max(max(rc_U1(D); rc_U2(D; L; Q)); max(rc_U3(D; L; W; Q); max(rc_U4(D; L; W; Q); rc_U5(D; L; E; S))))
#show
`;

/** steel99 第 2.2 節 容許應力設計法（ASD）載重組合 */
export const twLoadCombosSteelAsd = `'<h6>載重組合函式（steel99 §2.2 容許應力設計法）：asd_1 … asd_5</h6>
#hide
asd_1(D; L) = D + L
asd_2p(D; L; W) = D + 0.75*L + 1.25*W
asd_2m(D; L; W) = D + 0.75*L - 1.25*W
asd_3p(D; L; E) = D + 0.75*L + 0.8*E
asd_3m(D; L; E) = D + 0.75*L - 0.8*E
asd_4p(D; W) = 0.7*D + 1.25*W
asd_4m(D; W) = 0.7*D - 1.25*W
asd_5p(D; E) = 0.7*D + 0.8*E
asd_5m(D; E) = 0.7*D - 0.8*E
asd_max(D; L; W; E) = max(max(asd_1(D; L); asd_2p(D; L; abs(W))); max(asd_3p(D; L; abs(E)); max(asd_4p(D; abs(W)); asd_5p(D; abs(E)))))
#show
`;
