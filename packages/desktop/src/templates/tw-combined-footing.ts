/**
 * 鋼筋混凝土雙柱聯合基腳設計與檢核 — 依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）
 * 與《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 *
 * 規範依據：
 * 1. 聯合基腳（found112 §4.1.2）：「可取柱為支點，基礎板下壓力為載重，推算基礎板控制斷面之設計剪力及彎矩」；
 *    基礎板中心須與柱載重合力中心盡量相合（解說）。本模組採剛性基腳法：基底壓力沿長向呈線性分布，
 *    其合力與力矩與兩柱因數化載重平衡（自重與覆土為均佈，於結構設計中互相抵消）。
 * 2. 聯合基腳及筏式基礎依 rc112 §13.3.4.1 與第八章；§13.3.4.2 直接設計法不得使用於聯合基腳，本模組不使用。
 * 3. 地盤支承力與偏心（found112 §4.1.1、§4.3）、抗滑（§4.6，FS ≥ 1.5）。
 * 4. 單向剪力（rc112 §13.3.6.1.1）：Vc = 0.17λ√f'c·bw·d，ϕ = 0.75，臨界斷面距柱面 d。
 * 5. 雙向沖剪（rc112 表 22.6.5.2）：內柱 αs = 40；臨界周長距柱面 d/2。
 * 6. 抗彎（rc112 §13.2.7、§24.4.3.2）：ϕ = 0.90，ρmin = 0.0018，間距上限 min(3h, 450 mm)。
 * 7. 柱底承壓（rc112 §22.8）、鋼筋伸展（rc112 第 25 章）。
 *
 * 適用範圍（超出即拒算）：兩柱皆為內柱（臨界周長完整位於基腳內，不計彎矩傳遞）；
 * 因數化載重偏心 |e| ≤ L/6（基底全斷面受壓）；兩柱面淨距 ≥ 2d。梯形基腳、懸臂（連梁）基腳與筏式基礎未涵蓋。
 *
 * 結尾行：「控制 UC = … → 聯合基腳檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twCombinedFooting = `"鋼筋混凝土雙柱聯合基腳設計與檢核（found112 / rc112）

'<i>依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112 第 4.1.2 節）與《建築物混凝土結構設計規範》（112年8月10日版，rc112），以剛性基腳法（基底壓力線性分布、取柱為支點）檢核雙柱矩形聯合基腳：地盤支承力、偏心、抗滑、單向剪力、雙向沖剪、縱向上下層抗彎、橫向帶狀抗彎與剪力、鋼筋間距、錨定與柱底承壓。限兩柱均為內柱、因數化載重偏心不超過 L/6；梯形基腳、連梁基腳與筏式基礎未涵蓋。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 材料性質與設計參數</h5>

fc_in = ?{28}*(MPa)', 混凝土規定抗壓強度 f'c<span class="alleen-scherm">（17～70 MPa）</span><span class="kolom-3"></span>'
fy_in = ?{420}*(MPa)', 鋼筋規定降伏強度 fy<span class="alleen-scherm">（SD420 為 420 MPa）</span><span class="kolom-3"></span>'
gamma_c = ?{24}*(kN/m^3)', 鋼筋混凝土單位體積重量 γc<span class="kolom-3"></span>'
gamma_s = ?{18}*(kN/m^3)', 覆土單位體積重量 γs<span class="kolom-3"></span>'
cover = ?{75}*(mm)', 底層鋼筋淨保護層厚度<span class="alleen-scherm">（rc112 表 20.6.1.3.1，地下澆置接觸地盤 75 mm）</span><span class="kolom-3"></span>'

<h5>2. 基腳與雙柱幾何（長向 L 為兩柱連線方向，x 自基腳左端量起）</h5>

L_f = ?{6000}*(mm)', 基腳長度 L（長向）<span class="kolom-3"></span>'
B_f = ?{2200}*(mm)', 基腳寬度 B（橫向）<span class="kolom-3"></span>'
h_f = ?{800}*(mm)', 基腳全厚度 h<span class="kolom-3"></span>'
D_f = ?{1000}*(mm)', 基腳頂面至地表覆土深度 Df<span class="kolom-3"></span>'
x_1 = ?{900}*(mm)', 柱 1 形心至基腳左端距離 x1<span class="kolom-3"></span>'
c_1l = ?{500}*(mm)', 柱 1 長向尺寸 c1l<span class="kolom-3"></span>'
c_1b = ?{500}*(mm)', 柱 1 橫向尺寸 c1b<span class="kolom-3"></span>'
x_2 = ?{4900}*(mm)', 柱 2 形心至基腳左端距離 x2<span class="kolom-3"></span>'
c_2l = ?{500}*(mm)', 柱 2 長向尺寸 c2l<span class="kolom-3"></span>'
c_2b = ?{500}*(mm)', 柱 2 橫向尺寸 c2b<span class="kolom-3"></span>'

<h5>3. 載重條件</h5>

'<h6>服務載重（D + L；檢核地盤支承力、偏心與抗滑）</h6>
P1_s = ?{1400}*(kN)', 柱 1 服務軸力<span class="kolom-3"></span>'
P2_s = ?{1800}*(kN)', 柱 2 服務軸力<span class="kolom-3"></span>'
H_serv = ?{80}*(kN)', 服務水平合力 H<span class="kolom-3"></span>'

'<h6>極限設計載重（因數化；檢核結構剪力、沖剪、抗彎與承壓）</h6>
P1_u = ?{1960}*(kN)', 柱 1 因數化軸力 Pu1<span class="kolom-3"></span>'
P2_u = ?{2520}*(kN)', 柱 2 因數化軸力 Pu2<span class="kolom-3"></span>'

<h5>4. 地盤參數（found112 §4.3、§4.6）</h5>
<p class="calc-uitleg">工址土壤參數屬「會改變合格與否之重要假設」，須由設計者依地質鑽探報告填入，不可預設為安全數值。</p>

q_a_in = ?{350}*(kPa)', 容許地盤支承力 qa<span class="alleen-scherm">（依工址鑽探報告輸入）</span><span class="kolom-3"></span>'
mu_base = ?{0.50}', 基底摩擦係數 μ = tanδ<span class="alleen-scherm">（通常 0.40～0.50）</span><span class="kolom-3"></span>'

<h5>5. 鋼筋配置</h5>

'<h6>縱向底層主筋（抵抗柱間以外之正彎矩，沿寬度 B 分佈）</h6>
@select bar_b_id "縱向底層鋼筋規格"
  D25（直徑 25.4 mm，單根 506.7 mm²） = 1
  D16（直徑 15.9 mm，單根 198.6 mm²） = 2
  D19（直徑 19.1 mm，單根 286.5 mm²） = 3
  D22（直徑 22.2 mm，單根 387.1 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
@end
n_bb = ?{9}', 縱向底層鋼筋總根數<span class="kolom-3"></span>'

'<h6>縱向頂層主筋（抵抗兩柱之間負彎矩，沿寬度 B 分佈，全長通過）</h6>
@select bar_t_id "縱向頂層鋼筋規格"
  D25（直徑 25.4 mm，單根 506.7 mm²） = 1
  D16（直徑 15.9 mm，單根 198.6 mm²） = 2
  D19（直徑 19.1 mm，單根 286.5 mm²） = 3
  D22（直徑 22.2 mm，單根 387.1 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
@end
n_bt = ?{9}', 縱向頂層鋼筋總根數<span class="kolom-3"></span>'

'<h6>橫向底層鋼筋（每柱下方帶狀，寬度 = 柱長向尺寸 + 橫向有效深度）</h6>
@select bar_q_id "橫向鋼筋規格"
  D25（直徑 25.4 mm，單根 506.7 mm²） = 1
  D16（直徑 15.9 mm，單根 198.6 mm²） = 2
  D19（直徑 19.1 mm，單根 286.5 mm²） = 3
  D22（直徑 22.2 mm，單根 387.1 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
@end
s_q = ?{150}*(mm)', 橫向鋼筋間距 sq<span class="kolom-3"></span>'

@select hook_mode "鋼筋端部錨定型式"
  90° 標準彎鉤（端部設置彎鉤） = 1
  直鋼筋伸展（無端部彎鉤） = 2
@end

#hide
rebar_d_arr = [1; 2; 3; 4; 5; 6 | 25.4; 15.9; 19.1; 22.2; 28.7; 32.2]
rebar_A_arr = [1; 2; 3; 4; 5; 6 | 506.7; 198.6; 286.5; 387.1; 646.9; 814.3]

db_b = hlookup(rebar_d_arr; bar_b_id; 1; 2) * mm
Ab_b1 = hlookup(rebar_A_arr; bar_b_id; 1; 2) * mm^2
db_t = hlookup(rebar_d_arr; bar_t_id; 1; 2) * mm
Ab_t1 = hlookup(rebar_A_arr; bar_t_id; 1; 2) * mm^2
db_q = hlookup(rebar_d_arr; bar_q_id; 1; 2) * mm
Ab_q1 = hlookup(rebar_A_arr; bar_q_id; 1; 2) * mm^2

# 有效深度：縱向底筋在最下層，橫向筋疊於其上
d_bot = h_f - cover - db_b / 2
d_tra = h_f - cover - db_b - db_q / 2
d_top = h_f - cover - db_t / 2
d_v = max(min(d_bot; min(d_tra; d_top)); 10 mm)

# 純數值（m、mm、kN、MPa、kPa）
Lm = L_f / (1 m)
Bm = B_f / (1 m)
hm = h_f / (1 m)
Dm = D_f / (1 m)
B_mm = B_f / (1 mm)
h_mm = h_f / (1 mm)
fcn = fc_in / (1 MPa)
fyn = fy_in / (1 MPa)
rf = sqrt(fcn)
cvr = cover / (1 mm)
dv = d_v / (1 mm)
dbot = d_bot / (1 mm)
dtra = d_tra / (1 mm)
dtop = d_top / (1 mm)
dbb = db_b / (1 mm)
dbt = db_t / (1 mm)
dbq = db_q / (1 mm)
x1 = x_1 / (1 m)
x2 = x_2 / (1 m)
c1l = c_1l / (1 m)
c1b = c_1b / (1 m)
c2l = c_2l / (1 m)
c2b = c_2b / (1 m)
Pu1 = P1_u / (1 kN)
Pu2 = P2_u / (1 kN)
Ps1 = P1_s / (1 kN)
Ps2 = P2_s / (1 kN)
Hs = H_serv / (1 kN)
qa = q_a_in / (1 kPa)
sq = s_q / (1 mm)
Abb = Ab_b1 / (1 mm^2)
Abt = Ab_t1 / (1 mm^2)
Abq = Ab_q1 / (1 mm^2)

# 柱面位置與臨界斷面
x1l = x1 - c1l / 2
x1r = x1 + c1l / 2
x2l = x2 - c2l / 2
x2r = x2 + c2l / 2
dvm = dv / 1000

# 因數化載重之線性基底壓力 w(x) = w0 + kw·x（kN/m）
Pu = Pu1 + Pu2
xu = (Pu1 * x1 + Pu2 * x2) / max(Pu; 0.001)
e_u = xu - Lm / 2
w0 = Pu / Lm - 6 * Pu * e_u / Lm^2
k_w = 12 * Pu * e_u / Lm^3

# 輸入防護
ok_mat = bool(fcn ≥ 17) * bool(fcn ≤ 70) * bool(fyn ≥ 280) * bool(fyn ≤ 550)
ok_size = bool(Lm > 0) * bool(Bm > 0) * bool(h_mm ≥ 200) * bool(cvr ≥ 50) * bool(Dm ≥ 0)
ok_col = bool(c1l > 0) * bool(c1b > 0) * bool(c2l > 0) * bool(c2b > 0) * bool(x1 < x2)
ok_loads = bool(Ps1 > 0) * bool(Ps2 > 0) * bool(Pu1 > 0) * bool(Pu2 > 0) * bool(qa > 0) * bool(Hs ≥ 0) * bool(mu_base > 0)
ok_rebar = bool(n_bb ≥ 2) * bool(n_bt ≥ 2) * bool(sq > 0) * bool(dv > 100)
ok_inner = bool(x1l * 1000 ≥ dv / 2) * bool((Lm - x2r) * 1000 ≥ dv / 2) * bool((x2l - x1r) ≥ 2 * dvm) * bool(B_mm ≥ max(c1b; c2b) * 1000 + dv)
ok_band = bool(x1 * 1000 - (c1l * 1000 + dtra) / 2 ≥ 0) * bool((Lm - x2) * 1000 - (c2l * 1000 + dtra) / 2 ≥ 0) * bool((x2 - x1) * 1000 ≥ (c1l * 1000 + c2l * 1000 + 2 * dtra) / 2)
ok_ecc = bool(abs(e_u) ≤ Lm / 6)
ok_all_input = ok_mat * ok_size * ok_col * ok_loads * ok_rebar * ok_inner * ok_band * ok_ecc
#show

#if ok_all_input ≡ 1
    # 6. 地盤支承力與偏心（found112 §4.1.1、§4.3）

    #hide
    W_foot_n = Bm * Lm * hm * gamma_c / (1 kN/m^3)
    W_soil_n = Bm * Lm * Dm * gamma_s / (1 kN/m^3)
    Ptot_n = Ps1 + Ps2 + W_foot_n + W_soil_n
    xs_n = (Ps1 * x1 + Ps2 * x2 + (W_foot_n + W_soil_n) * Lm / 2) / Ptot_n
    es_n = xs_n - Lm / 2
    q_avg_n = Ptot_n / (Bm * Lm)
    q_mom_n = 6 * Ptot_n * abs(es_n) / (Bm * Lm^2)
    q_max_n = q_avg_n + q_mom_n
    q_min_n = q_avg_n - q_mom_n
    UC_bearing = q_max_n / qa
    UC_ecc = abs(es_n) / (Lm / 6)
    is_uplift = bool(q_min_n < 0)
    FS_slide = mu_base * Ptot_n / max(Hs; 0.001)
    UC_slide = 1.5 / max(FS_slide; 0.001)
    W_foot = W_foot_n * kN
    W_soil = W_soil_n * kN
    P_tot = Ptot_n * kN
    e_s = es_n * m
    q_avg = q_avg_n * kPa
    q_max = q_max_n * kPa
    q_min = q_min_n * kPa
    R_fric = mu_base * Ptot_n * kN
    #show

    W_foot to kN', 基腳自重 Wf = B·L·h·γc<span class="kolom-2"></span>'
    W_soil to kN', 基腳頂覆土重 Ws = B·L·Df·γs<span class="kolom-2"></span>'
    P_tot to kN', 作用於地盤之總服務垂直載重<span class="kolom-2"></span>'
    e_s to mm', 服務載重合力對基腳形心之偏心 es（核心限值 L/6）<span class="kolom-2"></span>'
    q_avg', 基底平均壓力 q_avg = P_total / (B·L)<span class="kolom-2"></span>'
    q_max', 基底最大壓力 q_max = q_avg + 6·P·|es| / (B·L²)<span class="kolom-2"></span>'
    q_min', 基底最小壓力 q_min = q_avg − 6·P·|es| / (B·L²)（小於 0 表示揚起）<span class="kolom-2"></span>'
    UC_bearing', 支承力檢核比 UC = q_max / qa<span class="kolom-2"></span>'
    '地盤支承力檢核：UC = <b>'ru(UC_bearing)'</b> <b>'oordeel(UC_bearing)'</b>（'q_max' ≤ 'q_a_in'）<span class="alleen-scherm"></span>
    UC_ecc', 偏心檢核比 UC = |es| / (L/6)<span class="kolom-2"></span>'
    '基底偏心檢核：UC = <b>'ru(UC_ecc)'</b> <b>'oordeel(UC_ecc)'</b>（'if(is_uplift ≡ 0; "基底全斷面受壓"; "基底有揚起趨勢")'）<span class="alleen-scherm"></span>
    R_fric to kN', 基底極限摩擦力 Rf = μ·P_total（found112 式 4.6-1）<span class="kolom-2"></span>'
    FS_slide', 抗滑安全係數 FS = Rf / H（需 ≥ 1.5）<span class="kolom-2"></span>'
    '基底抗滑檢核：UC = <b>'ru(UC_slide)'</b> <b>'oordeel(UC_slide)'</b>（FS = 'ru(FS_slide)' ≥ 1.5）<span class="alleen-scherm"></span>

    # 7. 因數化基底壓力與剛性基腳法內力（found112 §4.1.2）
    <p class="calc-uitleg">取柱為支點、基底壓力為載重：基底壓力沿長向線性分布，合力與兩柱因數化載重之合力同點。剪力 V(x) = ∫w dx − ΣP（左側向上為正），彎矩 M(x) 以底層受拉為正；兩柱之間為負彎矩（頂層受拉）。rc112 §13.3.4.2 直接設計法不得使用於聯合基腳。</p>

    #hide
    Vf(x) = w0 * x + k_w * x^2 / 2 - if(x > x1; Pu1; 0) - if(x > x2; Pu2; 0)
    Mf(x) = w0 * x^2 / 2 + k_w * x^3 / 6 - Pu1 * max(x - x1; 0) - Pu2 * max(x - x2; 0)

    disc = max(w0^2 + 2 * k_w * Pu1; 0)
    x0_raw = 2 * Pu1 / max(w0 + sqrt(disc); 0.000001)
    x0 = min(max(x0_raw; x1r); x2l)

    M_x0 = Mf(x0)
    M_x1r = Mf(x1r)
    M_x2l = Mf(x2l)
    M_x1l = Mf(x1l)
    M_x2r = Mf(x2r)
    Mneg_n = max(-min(M_x0; min(M_x1r; M_x2l)); 0)
    Mpos_n = max(max(M_x1l; M_x2r); max(max(M_x1r; M_x2l); 0))

    xa = max(x1l - dvm; 0)
    xb = x1r + dvm
    xc = x2l - dvm
    xd = min(x2r + dvm; Lm)
    Vu_n = max(max(abs(Vf(xa)); abs(Vf(xb))); max(abs(Vf(xc)); abs(Vf(xd))))

    w_left = w0 * kN/m
    w_right = (w0 + k_w * Lm) * kN/m
    e_u_d = e_u * m
    M_neg = Mneg_n * kN*m
    M_pos = Mpos_n * kN*m
    V_u = Vu_n * kN
    x_zero = x0 * m
    #show

    e_u_d to mm', 因數化柱載重合力對形心之偏心 eu（需 ≤ L/6）<span class="kolom-2"></span>'
    w_left to kN/m', 左端線載重 w(0) = Pu/L − 6·Pu·eu/L²<span class="kolom-2"></span>'
    w_right to kN/m', 右端線載重 w(L) = Pu/L + 6·Pu·eu/L²<span class="kolom-2"></span>'
    x_zero to mm', 兩柱間剪力為零之位置 x0（限制於兩柱內側面之間）<span class="kolom-2"></span>'
    M_neg to kN*m', 頂層受拉之控制負彎矩（取 x0 與兩柱內側面之最小值）<span class="kolom-2"></span>'
    M_pos to kN*m', 底層受拉之控制正彎矩（取兩柱外側面與內側面之最大值）<span class="kolom-2"></span>'
    V_u to kN', 控制單向剪力（距柱面 d 處四個斷面之最大絕對值）<span class="kolom-2"></span>'

    # 8. 單向剪力（rc112 §13.3.6.1.1）

    #hide
    phiVc_n = 0.75 * 0.17 * rf * B_mm * dv / 1000
    UC_vone = Vu_n / max(phiVc_n; 0.001)
    phiVc = phiVc_n * kN
    #show

    phiVc to kN', 單向設計剪力強度 ϕVc = 0.75·0.17·√f'c·B·d（d 取三層有效深度之最小值 'd_v'）<span class="kolom-2"></span>'
    UC_vone', 單向剪力檢核比 UC = Vu / ϕVc<span class="kolom-2"></span>'
    '單向剪力檢核：UC = <b>'ru(UC_vone)'</b> <b>'oordeel(UC_vone)'</b>（'V_u' ≤ 'phiVc'）<span class="alleen-scherm"></span>

    # 9. 雙向沖剪（rc112 表 22.6.5.2，內柱 αs = 40，臨界周長距柱面 d/2）

    #hide
    lam_s = min(1.0; sqrt(2.0 / (1.0 + dv / 250.0)))
    b11 = c1l * 1000 + dv
    b12 = c1b * 1000 + dv
    bo1 = 2 * (b11 + b12)
    q_c1 = (w0 + k_w * x1) / Bm
    Vup1 = Pu1 - q_c1 * b11 * b12 / 1e6
    beta1 = max(c1l; c1b) / min(c1l; c1b)
    vc1 = min(0.33; min(0.17 * (1 + 2 / beta1); 0.083 * (2 + 40 * dv / bo1))) * lam_s * rf
    phiVp1 = 0.75 * vc1 * bo1 * dv / 1000
    UC_p1 = max(Vup1; 0) / max(phiVp1; 0.001)

    b21 = c2l * 1000 + dv
    b22 = c2b * 1000 + dv
    bo2 = 2 * (b21 + b22)
    q_c2 = (w0 + k_w * x2) / Bm
    Vup2 = Pu2 - q_c2 * b21 * b22 / 1e6
    beta2 = max(c2l; c2b) / min(c2l; c2b)
    vc2 = min(0.33; min(0.17 * (1 + 2 / beta2); 0.083 * (2 + 40 * dv / bo2))) * lam_s * rf
    phiVp2 = 0.75 * vc2 * bo2 * dv / 1000
    UC_p2 = max(Vup2; 0) / max(phiVp2; 0.001)
    UC_punch = max(UC_p1; UC_p2)

    V_up1 = Vup1 * kN
    V_up2 = Vup2 * kN
    phiV_p1 = phiVp1 * kN
    phiV_p2 = phiVp2 * kN
    #show

    lam_s', 尺寸效應係數 λs = min(1, √(2/(1+d/250)))<span class="kolom-2"></span>'
    V_up1 to kN', 柱 1 沖剪需求 Vup = Pu − q·(c1l+d)(c1b+d)<span class="kolom-2"></span>'
    phiV_p1 to kN', 柱 1 沖剪設計強度 ϕ·vc·bo·d<span class="kolom-2"></span>'
    V_up2 to kN', 柱 2 沖剪需求<span class="kolom-2"></span>'
    phiV_p2 to kN', 柱 2 沖剪設計強度<span class="kolom-2"></span>'
    UC_punch', 沖剪檢核比 UC = max(Vup1/ϕVp1, Vup2/ϕVp2)<span class="kolom-2"></span>'
    '雙向沖剪檢核：UC = <b>'ru(UC_punch)'</b> <b>'oordeel(UC_punch)'</b>（柱 1：'ru(UC_p1)'，柱 2：'ru(UC_p2)'）<span class="alleen-scherm"></span>

    # 10. 縱向抗彎（rc112 §13.2.7、§24.4.3.2）

    #hide
    As_b = n_bb * Abb
    As_t = n_bt * Abt
    a_b = As_b * fyn / (0.85 * fcn * B_mm)
    a_t = As_t * fyn / (0.85 * fcn * B_mm)
    phiMb_n = 0.9 * As_b * fyn * (dbot - a_b / 2) / 1e6
    phiMt_n = 0.9 * As_t * fyn * (dtop - a_t / 2) / 1e6
    UC_flex_b = Mpos_n / max(phiMb_n; 0.001)
    UC_flex_t = Mneg_n / max(phiMt_n; 0.001)
    As_min = 0.0018 * B_mm * h_mm
    UC_rho_b = As_min / As_b
    UC_rho_t = As_min / As_t
    s_max = min(3 * h_mm; 450)
    sb = (B_mm - 2 * cvr - dbb) / max(n_bb - 1; 1)
    st = (B_mm - 2 * cvr - dbt) / max(n_bt - 1; 1)
    UC_space_b = sb / s_max
    UC_space_t = st / s_max
    UC_clear_b = max(dbb; 25) / max(sb - dbb; 1)
    UC_clear_t = max(dbt; 25) / max(st - dbt; 1)
    phiM_b = phiMb_n * kN*m
    phiM_t = phiMt_n * kN*m
    A_s_b = As_b * mm^2
    A_s_t = As_t * mm^2
    A_s_min = As_min * mm^2
    #show

    A_s_b to cm^2', 縱向底層鋼筋面積<span class="kolom-2"></span>'
    A_s_t to cm^2', 縱向頂層鋼筋面積<span class="kolom-2"></span>'
    A_s_min to cm^2', 每層最小鋼筋面積 As,min = 0.0018·B·h<span class="kolom-2"></span>'
    phiM_b to kN*m', 底層設計抗彎強度 ϕMn（d = 'dbot' mm）<span class="kolom-2"></span>'
    phiM_t to kN*m', 頂層設計抗彎強度 ϕMn（d = 'dtop' mm）<span class="kolom-2"></span>'
    UC_flex_b', 底層抗彎檢核比 UC = M⁺ / ϕMn<span class="kolom-2"></span>'
    UC_flex_t', 頂層抗彎檢核比 UC = |M⁻| / ϕMn<span class="kolom-2"></span>'
    '縱向抗彎檢核：底層 UC = <b>'ru(UC_flex_b)'</b> <b>'oordeel(UC_flex_b)'</b>，頂層 UC = <b>'ru(UC_flex_t)'</b> <b>'oordeel(UC_flex_t)'</b><span class="alleen-scherm"></span>
    UC_rho_b', 底層最小鋼筋比檢核比<span class="kolom-2"></span>'
    UC_rho_t', 頂層最小鋼筋比檢核比<span class="kolom-2"></span>'
    UC_space_b', 底層鋼筋間距檢核比 s / min(3h, 450)<span class="kolom-2"></span>'
    UC_space_t', 頂層鋼筋間距檢核比<span class="kolom-2"></span>'

    # 11. 橫向帶狀抗彎與剪力（每柱下方，帶寬 = 柱長向尺寸 + 橫向有效深度）

    #hide
    bw1 = c1l * 1000 + dtra
    bw2 = c2l * 1000 + dtra
    ct1 = (B_mm - c1b * 1000) / 2
    ct2 = (B_mm - c2b * 1000) / 2
    Mt1 = (Pu1 / Bm) * (ct1 / 1000)^2 / 2
    Mt2 = (Pu2 / Bm) * (ct2 / 1000)^2 / 2
    Asq1 = Abq * bw1 / sq
    Asq2 = Abq * bw2 / sq
    aq1 = Asq1 * fyn / (0.85 * fcn * bw1)
    aq2 = Asq2 * fyn / (0.85 * fcn * bw2)
    phiMq1 = 0.9 * Asq1 * fyn * (dtra - aq1 / 2) / 1e6
    phiMq2 = 0.9 * Asq2 * fyn * (dtra - aq2 / 2) / 1e6
    UC_tq = max(Mt1 / max(phiMq1; 0.001); Mt2 / max(phiMq2; 0.001))
    UC_rho_q = max(0.0018 * bw1 * h_mm / Asq1; 0.0018 * bw2 * h_mm / Asq2)
    Vt1 = (Pu1 / Bm) * max(ct1 - dtra; 0) / 1000
    Vt2 = (Pu2 / Bm) * max(ct2 - dtra; 0) / 1000
    phiVt1 = 0.75 * 0.17 * rf * bw1 * dtra / 1000
    phiVt2 = 0.75 * 0.17 * rf * bw2 * dtra / 1000
    UC_tv = max(Vt1 / max(phiVt1; 0.001); Vt2 / max(phiVt2; 0.001))
    UC_space_q = sq / s_max
    UC_clear_q = max(dbq; 25) / max(sq - dbq; 1)
    M_t1 = Mt1 * kN*m
    M_t2 = Mt2 * kN*m
    phiM_q1 = phiMq1 * kN*m
    phiM_q2 = phiMq2 * kN*m
    #show

    M_t1 to kN*m', 柱 1 橫向帶懸臂彎矩 Mt = (Pu/B)·ct²/2<span class="kolom-2"></span>'
    phiM_q1 to kN*m', 柱 1 橫向帶設計抗彎強度（d = 'dtra' mm）<span class="kolom-2"></span>'
    M_t2 to kN*m', 柱 2 橫向帶懸臂彎矩<span class="kolom-2"></span>'
    phiM_q2 to kN*m', 柱 2 橫向帶設計抗彎強度<span class="kolom-2"></span>'
    UC_tq', 橫向抗彎檢核比（取兩柱較大者）<span class="kolom-2"></span>'
    UC_rho_q', 橫向最小鋼筋比檢核比<span class="kolom-2"></span>'
    UC_tv', 橫向剪力檢核比（距柱面 d 處，取兩柱較大者）<span class="kolom-2"></span>'
    UC_space_q', 橫向鋼筋間距檢核比<span class="kolom-2"></span>'
    '橫向抗彎檢核：UC = <b>'ru(UC_tq)'</b> <b>'oordeel(UC_tq)'</b>；橫向剪力 UC = <b>'ru(UC_tv)'</b> <b>'oordeel(UC_tv)'</b><span class="alleen-scherm"></span>

    # 12. 柱底承壓與錨定伸展（rc112 §22.8、第 25 章）

    #hide
    phiPn1 = 0.65 * 0.85 * fcn * c1l * c1b * 1e6 / 1000
    phiPn2 = 0.65 * 0.85 * fcn * c2l * c2b * 1e6 / 1000
    UC_bear_col = max(Pu1 / phiPn1; Pu2 / phiPn2)
    ld_str_b = if(dbb ≤ 19.1; fyn / (2.1 * rf); fyn / (1.7 * rf)) * dbb
    ld_str_q = if(dbq ≤ 19.1; fyn / (2.1 * rf); fyn / (1.7 * rf)) * dbq
    ld_hook_b = max(fyn / (4.2 * rf) * dbb; max(8 * dbb; 150))
    ld_hook_q = max(fyn / (4.2 * rf) * dbq; max(8 * dbq; 150))
    ld_b = if(hook_mode ≡ 1; ld_hook_b; ld_str_b)
    ld_q = if(hook_mode ≡ 1; ld_hook_q; ld_str_q)
    Lav_b = min(x1l; Lm - x2r) * 1000 - cvr
    Lav_q = min(ct1; ct2) - cvr
    UC_ld = max(ld_b / max(Lav_b; 1); ld_q / max(Lav_q; 1))
    phiPn_1 = phiPn1 * kN
    phiPn_2 = phiPn2 * kN
    ld_b_d = ld_b * mm
    Lav_b_d = Lav_b * mm
    ld_q_d = ld_q * mm
    Lav_q_d = Lav_q * mm
    #show

    phiPn_1 to kN', 柱 1 底設計支承強度 ϕPn = 0.65·0.85·f'c·A1（保守取 √(A2/A1) = 1）<span class="kolom-2"></span>'
    phiPn_2 to kN', 柱 2 底設計支承強度<span class="kolom-2"></span>'
    UC_bear_col', 柱底承壓檢核比<span class="kolom-2"></span>'
    ld_b_d to mm', 縱向底筋所需伸展長度（'if(hook_mode ≡ 1; "90° 標準彎鉤 ldh"; "直鋼筋 ld")'）<span class="kolom-2"></span>'
    Lav_b_d to mm', 外側柱面至基腳端可用長度（扣保護層）<span class="kolom-2"></span>'
    ld_q_d to mm', 橫向鋼筋所需伸展長度<span class="kolom-2"></span>'
    Lav_q_d to mm', 橫向柱面至基腳側邊可用長度（扣保護層）<span class="kolom-2"></span>'
    UC_ld', 錨定伸展檢核比（取縱向與橫向較大者）<span class="kolom-2"></span>'
    '柱底承壓檢核：UC = <b>'ru(UC_bear_col)'</b> <b>'oordeel(UC_bear_col)'</b>；錨定伸展 UC = <b>'ru(UC_ld)'</b> <b>'oordeel(UC_ld)'</b><span class="alleen-scherm"></span>

    # 13. 檢核彙整與控制 UC

    #hide
    UC_g1 = max(UC_bearing; max(UC_slide; max(UC_vone; max(UC_punch; max(UC_flex_b; UC_flex_t)))))
    UC_g2 = max(UC_rho_b; max(UC_rho_t; max(UC_space_b; max(UC_space_t; max(UC_clear_b; UC_clear_t)))))
    UC_g3 = max(UC_tq; max(UC_rho_q; max(UC_tv; max(UC_space_q; max(UC_clear_q; max(UC_bear_col; max(UC_ld; UC_ecc)))))))
    UC_load = max(UC_g1; max(UC_g2; UC_g3))
    UC_max_raw = if(bool(is_uplift ≡ 0); UC_load; max(UC_load; 1.05))
    UC_max = ru(UC_max_raw)
    ok_all = bool(is_uplift ≡ 0) * bool(UC_load ≤ 1.0)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">地盤支承力 q_max ≤ qa</td><td style="padding:2px 8px;">found112 §4.3</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_bearing)'">'ru(UC_bearing)'</td><td style="padding:2px 8px; color:'kleur(UC_bearing)'">'oordeel(UC_bearing)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">基底偏心（無揚起）</td><td style="padding:2px 8px;">found112 §4.1.1</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_ecc)'">'ru(UC_ecc)'</td><td style="padding:2px 8px; color:'kleur(UC_ecc)'">'oordeel(UC_ecc)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">基底抗滑 FS ≥ 1.5</td><td style="padding:2px 8px;">found112 §4.6</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_slide)'">'ru(UC_slide)'</td><td style="padding:2px 8px; color:'kleur(UC_slide)'">'oordeel(UC_slide)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">單向剪力 Vu ≤ ϕVc</td><td style="padding:2px 8px;">rc112 §13.3.6.1.1</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_vone)'">'ru(UC_vone)'</td><td style="padding:2px 8px; color:'kleur(UC_vone)'">'oordeel(UC_vone)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">雙向沖剪（兩柱）</td><td style="padding:2px 8px;">rc112 表 22.6.5.2</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_punch)'">'ru(UC_punch)'</td><td style="padding:2px 8px; color:'kleur(UC_punch)'">'oordeel(UC_punch)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">縱向底層抗彎 M⁺ ≤ ϕMn</td><td style="padding:2px 8px;">rc112 §13.2.7</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_flex_b)'">'ru(UC_flex_b)'</td><td style="padding:2px 8px; color:'kleur(UC_flex_b)'">'oordeel(UC_flex_b)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">縱向頂層抗彎 |M⁻| ≤ ϕMn</td><td style="padding:2px 8px;">rc112 §13.2.7</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_flex_t)'">'ru(UC_flex_t)'</td><td style="padding:2px 8px; color:'kleur(UC_flex_t)'">'oordeel(UC_flex_t)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">橫向帶抗彎</td><td style="padding:2px 8px;">rc112 §13.2.7</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_tq)'">'ru(UC_tq)'</td><td style="padding:2px 8px; color:'kleur(UC_tq)'">'oordeel(UC_tq)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">橫向剪力</td><td style="padding:2px 8px;">rc112 §13.3.6.1.1</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_tv)'">'ru(UC_tv)'</td><td style="padding:2px 8px; color:'kleur(UC_tv)'">'oordeel(UC_tv)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">最小鋼筋與間距（縱橫向）</td><td style="padding:2px 8px;">rc112 §24.4.3</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_g2)'">'ru(max(UC_g2; max(UC_rho_q; UC_space_q)))'</td><td style="padding:2px 8px; color:'kleur(UC_g2)'">'oordeel(max(UC_g2; max(UC_rho_q; UC_space_q)))'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱底承壓</td><td style="padding:2px 8px;">rc112 §22.8</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_bear_col)'">'ru(UC_bear_col)'</td><td style="padding:2px 8px; color:'kleur(UC_bear_col)'">'oordeel(UC_bear_col)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">錨定伸展</td><td style="padding:2px 8px;">rc112 第 25 章</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_ld)'">'ru(UC_ld)'</td><td style="padding:2px 8px; color:'kleur(UC_ld)'">'oordeel(UC_ld)'</td></tr>
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>聯合基腳檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>聯合基腳檢核不合格</b>
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。材料強度、基腳或柱幾何、載重、鋼筋配置、柱臨界周長（需為內柱）、兩柱面淨距（需 ≥ 2d）或因數化載重偏心（需 ≤ L/6）無效或超出本模組適用範圍。
#end if
`;
