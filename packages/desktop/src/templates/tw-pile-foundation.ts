/**
 * 基樁承載力設計與檢核（found112 §5.3）— 單樁極限／容許垂直支承力與基樁數量檢核。
 *
 * 規範條文與來源（A 級已驗證庫優先，B 級官方來源逐列記於 docs/tw/規範來源.md）：
 * 1. 單樁極限垂直支承力（found112 §5.3.1 式 5.3-1；已驗證公式 found112_Qu_pile）：
 *    Q_u = Q_s + Q_b = f_s·A_s + q_b·A_b
 *    式中 f_s 為樁表面摩擦阻力（tf/m²）、A_s 為樁身表面積（m²）、q_b 為樁端極限支承壓力（tf/m²）、A_b 為樁端斷面積（m²）
 * 2. 單樁容許垂直支承力（found112 §5.3.1 式 5.3-2；已驗證公式 found112_Qa_pile）：
 *    Q_a = Q_s/FS1 + Q_b/FS2
 *    FS1 為樁周表面摩擦阻力安全係數、FS2 為樁端點支承力安全係數（表 5.3-1；已驗證表 found112_FS_pile_T531）
 * 3. 支承力推估（found112 §5.3.1 表 5.3-2，標準貫入試驗 N 值法；B 級官方來源）：
 *    f_s = N/3（≤ 15 tf/m²）；中掘工法 f_s = N/10（≤ 5 tf/m²）
 *    q_b：打入式 30N、鑽掘式 7.5N、預鑽孔工法（植入式）25N、中掘工法（植入式）25N（tf/m²）
 *    N 值取樁端影響範圍內之平均 N 值；砂質土層之 N 值不得大於 50，卵礫石層之 N 值可大於 50，惟其樁端支承壓力
 *    以打入式 ≤ 1800 tf/m²、鑽掘式 ≤ 750 tf/m² 為限（預鑽孔與中掘工法於卵礫石層無上限可依，維持拒算）
 * 4. 本表未涵蓋（須另行檢討，非本表可計算）：靜力學公式（式 5.3-3、5.3-4）、樁載重試驗法、
 *    群樁效應、負摩擦力、水平承載力與沉陷檢核。
 * 5. 單位：規範以 tf 與 tf/m² 表示；本表內部以 SI 計算，1 tf = 9.80665 kN。
 *
 * 結尾行：「控制 UC = … → 基樁承載力檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twPileFoundation = `"基樁承載力設計與檢核（found112 5.3）

'<i>依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）第 5.3.1 條，以標準貫入試驗 N 值法推估基樁之極限與容許垂直支承力，並檢核基樁數量是否足以承擔基礎合計載重。載重試驗法、靜力學公式、群樁效應、負摩擦力與沉陷須另行檢討。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 基樁幾何與配置</h5>

d_p = 600'- <i>基樁直徑 d_p（mm）</i>
L_p = 30000'- <i>基樁長度 L_p（mm；自承載層起算之入土長度，含承載層內長度）</i>
n_pile = 8'- <i>基樁數目 n_pile（根）</i>

<h5>2. 地層與支承力推估方式（found112 5.3.1、表 5.3-2）</h5>
<p class="calc-uitleg">N 值與土別屬「會改變合格與否之重要假設」，須由設計者依據工址鑽探與標準貫入試驗報告填入，不可預設為安全數值。</p>

N_avg = 20'- <i>承載層平均標準貫入試驗 N 值（砂質土層不得大於 50；卵礫石層可大於 50，惟樁端支承壓力另受上限限制）</i>

@select meth "施工法（表 5.3-2 之支承力經驗式）"
  打入式基樁 = 1
  鑽掘式基樁 = 2
  預鑽孔工法（植入式） = 3
  中掘工法（植入式） = 4
@end

@select soil "承載層土別（卵礫石層另有樁端支承壓力上限）"
  砂質土層 = 1
  卵礫石層 = 2
@end

@select est "支承力推估方式（決定表 5.3-1 之安全係數）"
  支承力推估公式（本表 N 值法） = 1
  樁載重試驗 = 2
@end

@select lc "載重情況（決定表 5.3-1 之安全係數）"
  常時載重情況 = 1
  短期載重情況 = 2
  極限限界狀態 = 3
@end

<h5>3. 載重</h5>

P_tot = 12000'- <i>基礎合計垂直載重 P_tot（kN；服務載重）</i>
W_p = 0'- <i>每根基樁自重 W_p（kN；若已含於 P_tot 內則填 0）</i>

#hide
# 砂質土層之 N 值不得大於 50；卵礫石層之 N 值可大於 50，但其樁端支承壓力另有限制，
# 規範僅列打入式與鑽掘式之上限，預鑽孔與中掘工法於卵礫石層無上限可依，維持拒算。
n_ok = if(soil ≡ 1; N_avg ≤ 50; (meth ≡ 1 or meth ≡ 2))
ok_in = if(d_p > 0 and L_p > 0 and n_pile ≥ 1 and n_pile ≡ floor(n_pile) and N_avg > 0 and n_ok and meth ≥ 1 and meth ≤ 4 and meth ≡ floor(meth) and soil ≥ 1 and soil ≤ 2 and est ≥ 1 and est ≤ 2 and lc ≥ 1 and lc ≤ 3 and P_tot > 0 and W_p ≥ 0; 1; 0)
#show

#if ok_in > 0.5

<h5>4. 單樁極限垂直支承力（式 5.3-1）</h5>
#hide
# 樁身表面積與樁端斷面積（m²）
A_s = pi*(d_p/1000)*(L_p/1000)
A_b = pi*(d_p/1000)^2/4
# 表 5.3-2：表面摩擦阻力（tf/m²）；中掘工法另為 N/10（≤5）
fs_use = if(meth ≡ 1; min(N_avg/3; 15); if(meth ≡ 2; min(N_avg/3; 15); if(meth ≡ 3; min(N_avg/3; 15); min(N_avg/10; 5))))
# 表 5.3-2：樁端極限支承壓力（tf/m²）
qb_raw = if(meth ≡ 1; 30*N_avg; if(meth ≡ 2; 7.5*N_avg; 25*N_avg))
# 卵礫石層之樁端支承壓力上限（tf/m²）；預鑽孔與中掘工法規範未列，上限不設
qb_cap = if(soil ≡ 1; 1000000; if(meth ≡ 1; 1800; if(meth ≡ 2; 750; 1000000)))
qb_use = min(qb_raw; qb_cap)
Q_s_tf = fs_use*A_s
Q_b_tf = qb_use*A_b
Q_u_tf = Q_s_tf + Q_b_tf
#show
As_out = A_s'- <i>樁身表面積 A_s（m²）</i>
Ab_out = A_b'- <i>樁端斷面積 A_b（m²）</i>
fs_out = fs_use'- <i>樁表面摩擦阻力 f_s（tf/m²；表 5.3-2）</i>
qb_out = qb_use'- <i>樁端極限支承壓力 q_b（tf/m²；表 5.3-2）</i>
Qs_out = Q_s_tf'- <i>樁周表面摩擦阻力 Q_s（tf）</i>
Qb_out = Q_b_tf'- <i>樁端點極限支承力 Q_b（tf）</i>
Qu_out = Q_u_tf'- <i>單樁極限垂直支承力 Q_u（tf）</i>

<h5>5. 單樁容許垂直支承力（式 5.3-2、表 5.3-1）</h5>
#hide
FS1 = if(lc ≡ 1; if(est ≡ 1; 2.5; 1.8); if(lc ≡ 2; if(est ≡ 1; 1.8; 1.3); if(est ≡ 1; 1.2; 1.1)))
FS2 = if(lc ≡ 1; if(est ≡ 1; 3.5; 2.5); if(lc ≡ 2; if(est ≡ 1; 2.5; 1.8); if(est ≡ 1; 1.5; 1.3)))
Q_a_tf = Q_s_tf/FS1 + Q_b_tf/FS2
Q_a_kN = Q_a_tf*9.80665
#show
FS1_out = FS1'- <i>樁周摩擦阻力安全係數 FS1（表 5.3-1）</i>
FS2_out = FS2'- <i>樁端支承力安全係數 FS2（表 5.3-1）</i>
Qa_out = Q_a_kN'- <i>單樁容許垂直支承力 Q_a（kN；1 tf = 9.80665 kN）</i>

<h5>6. 基樁承載力與數量檢核</h5>
#hide
P_pile = P_tot/n_pile + W_p
UC_pile = P_pile/Q_a_kN
n_req = if(Q_a_kN > W_p; ceil(P_tot/(Q_a_kN - W_p)); 0)
n_req_d = if(n_req > 0; n_req; 0)
UC_n = if(n_req > 0; n_req/n_pile; 99)
UC_max = ru(max(UC_pile; UC_n))
#show
Pp_out = P_pile'- <i>每根基樁承受之載重 P/n + W_p（kN）</i>
nreq_out = n_req_d'- <i>需求基樁數 n_req = ⌈P_tot/(Q_a − W_p)⌉（根）</i>
'<b style="color:'kleur(UC_pile)'">單樁承載力：UC = 'ru(UC_pile)' → 'oordeel(UC_pile)'</b>
'<b style="color:'kleur(UC_n)'">基樁數量：UC = 'ru(UC_n)' → 'oordeel(UC_n)'</b>

<h5>7. 總結</h5>
'<i>本表未涵蓋：靜力學公式（式 5.3-3、5.3-4）、樁載重試驗法、群樁效應、負摩擦力、基樁水平承載力與沉陷檢核；負摩擦力可能發生時（found112 構造編第 90 條）須另行檢討。</i>
#if UC_max ≤ 1.0
'<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>基樁承載力檢核合格</b>
#else
'<b>控制 UC = 'UC_max'</b> > 1.0 → <b>基樁承載力檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。基樁直徑與長度須大於零，樁數須為正整數，N 值須大於零；砂質土層之 N 值不得大於 50，卵礫石層僅打入式與鑽掘式可計算（預鑽孔與中掘工法之樁端支承壓力上限規範未列）；施工法、土別、推估方式與載重情況須為有效選項。
#end if
`;
