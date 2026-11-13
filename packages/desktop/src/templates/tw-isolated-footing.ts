/**
 * 鋼筋混凝土獨立基腳設計與檢核 — 依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）
 * 與《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 *
 * 規範條文與來源（A 級已驗證庫優先，本檔數值常數逐項可追溯）：
 * 1. 地盤支承力與偏心檢核（found112 §4.1.1、§4.3）：
 *    - 基礎平均垂直壓力 q = (P_serv + W_f + W_s)/(B·L)（式(解4.1-1)，已驗證公式 found112_footing_pressure_q）
 *    - 最大接觸應力 q_max = P/A + |Mx|/Sx + |My|/Sy ≤ qa（容許支承力 qa 由使用者依工址鑽探報告輸入）
 *    - 核心區無揚起偏心檢核：q_min ≥ 0、ex ≤ B/6、ey ≤ L/6
 *    - 容許支承力安全係數（表 4.3-1，已驗證表 found112_FS_vertical_T435：長期載重 FS ≥ 3.0）
 * 2. 淺基礎抗滑動檢核（found112 §4.6，式 4.6-1，表 4.6-1）：
 *    - 基底極限摩擦阻力 Rf = N·tanδ（已驗證公式 found112_Rf_base_friction，μ = tanδ 由使用者輸入，通常 0.4～0.5）
 *    - 抗滑安全係數 FS_slide = Rf / H ≥ 1.5（長期載重情況，已驗證表 found112_FS_horizontal_T461）
 * 3. 單向剪力（樑剪力）檢核（rc112 §13.2.6 & §13.3.6.1.1）：
 *    - 臨界斷面位於距柱面 d 處，兩向分別檢核
 *    - 混凝土剪力強度 Vc = 0.17·λ·√f'c·bw·d（已驗證公式 rc112_footing_Vc_simple，ϕ = 0.75）
 * 4. 雙向穿孔剪力（沖剪）檢核（rc112 §13.2.6 & 表 22.6.5.2）：
 *    - 臨界斷面周長 bo 位於距柱面 d/2 處四周
 *    - 沖剪應力 vc = min(0.33λsλ√f'c, 0.17(1+2/β)λsλ√f'c, 0.083(2+αsd/bo)λsλ√f'c)（已驗證公式 rc112_punching_vc）
 *    - 尺寸效應係數 λs = min(1, √(2/(1+d/250)))（112年版新規範新增）
 *    - 內柱 αs = 40，ϕ = 0.75，設計沖剪強度 ϕVp = ϕ·vc·bo·d
 * 5. 柱邊抗彎撓曲與配筋檢核（rc112 §13.2.7 & §13.3.3.3）：
 *    - 臨界斷面位於柱面（懸臂板彎矩 Mu = qu·b·a²/2）
 *    - 矩形斷面閉合解抗彎容量 ϕMn，ϕ = 0.90（受拉控制）
 *    - 最小受拉鋼筋比 ρmin = 0.0018（SD420，§13.3.3.3 & §24.4.3.2）
 *    - 鋼筋最大間距 s_max = min(3h, 450 mm)（§13.3.3.4 & §24.4.3.3）
 * 6. 長方形基腳短向帶狀分配（rc112 §13.3.3.3）：
 *    - 若 L > B，短向中央帶（寬度 B）分配 γs = 2/(βL+1) 之鋼筋量，其餘均勻配置於外側
 * 7. 柱底傳力承壓檢核（rc112 §16.5.3 & §22.8）：
 *    - 柱承壓強度 ϕPn = 0.65·0.85·f'c·A1·min(√(A2/A1), 2.0)
 * 8. 鋼筋伸展長度檢核（rc112 第 25 章）：
 *    - 柱面至基腳外緣淨長度 L_avail ≥ 伸展長度 ld（直筋表 25.4.2.2 或 90° 標準彎鉤 ldh 式 25.4.3.1）
 *
 * 結尾行：「控制 UC = … → 獨立基腳檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twIsolatedFooting = `"鋼筋混凝土獨立基腳設計與檢核（found112 / rc112）

'<i>依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）與《建築物混凝土結構設計規範》（112年8月10日版，rc112）提供受雙向偏心軸力與剪力作用之矩形或正方形鋼筋混凝土獨立擴展基腳之完整安全性與結構細部檢核。涵蓋地盤容許支承力、偏心揚起、基底抗滑、雙向單向剪力（樑剪力）、雙向穿孔剪力（沖剪，含 112 年版尺寸效應 λs）、柱面抗彎撓曲容量、最小鋼筋比、柱底傳力承壓與鋼筋錨定伸展長度。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 材料性質與設計參數</h5>

fc_in = ?{28}*(MPa)', 混凝土規定抗壓強度 f'c<span class="alleen-scherm">（17～70 MPa，found112／rc112）</span><span class="kolom-3"></span>'
fy_in = ?{420}*(MPa)', 鋼筋規定降伏強度 fy<span class="alleen-scherm">（SD420 為 420 MPa、SD280 為 280 MPa）</span><span class="kolom-3"></span>'
gamma_c = ?{24}*(kN/m^3)', 鋼筋混凝土單位體積重量 γc<span class="alleen-scherm">（建築構造編第 11 條）</span><span class="kolom-3"></span>'
gamma_s = ?{18}*(kN/m^3)', 覆土土壤單位體積重量 γs<span class="kolom-3"></span>'
cover = ?{75}*(mm)', 底層鋼筋淨保護層厚度<span class="alleen-scherm">（rc112 表 20.6.1.3.1 地下澆置接觸地盤最少 75 mm）</span><span class="kolom-3"></span>'

<h5>2. 幾何尺寸與覆土深度</h5>

B_f = ?{2500}*(mm)', 基腳 X 向寬度 Bf<span class="kolom-3"></span>'
L_f = ?{2500}*(mm)', 基腳 Y 向長度 Lf<span class="kolom-3"></span>'
h_f = ?{600}*(mm)', 基腳全厚度 hf<span class="alleen-scherm">（rc112 13.3.1.2 鋼筋上方厚度不得小於 150 mm）</span><span class="kolom-3"></span>'
D_f = ?{1000}*(mm)', 基腳頂面至地表覆土深度 Df<span class="kolom-3"></span>'
c_1 = ?{500}*(mm)', 支承柱 X 向寬度 c1<span class="kolom-3"></span>'
c_2 = ?{500}*(mm)', 支承柱 Y 向寬度 c2<span class="kolom-3"></span>'

<h5>3. 載重條件</h5>

'<h6>服務載重（使用載重，D + L；檢核地盤支承力、偏心與抗滑）</h6>
P_serv = ?{1200}*(kN)', 柱傳來服務垂直軸力 P_serv<span class="kolom-3"></span>'
Mx_serv = ?{80}*(kN*m)', 繞 X 軸服務彎矩 Mx,serv<span class="kolom-3"></span>'
My_serv = ?{40}*(kN*m)', 繞 Y 軸服務彎矩 My,serv<span class="kolom-3"></span>'
Hx_serv = ?{60}*(kN)', 服務水平剪力 Hx,serv<span class="kolom-3"></span>'
Hy_serv = ?{30}*(kN)', 服務水平剪力 Hy,serv<span class="kolom-3"></span>'

'<h6>極限設計載重（因數化載重，1.2D + 1.6L 等；檢核結構剪力、沖剪、抗彎與承壓）</h6>
P_u = ?{1680}*(kN)', 因數化柱軸力 Pu<span class="kolom-3"></span>'
M_ux = ?{112}*(kN*m)', 因數化繞 X 軸彎矩 Mux<span class="kolom-3"></span>'
M_uy = ?{56}*(kN*m)', 因數化繞 Y 軸彎矩 Muy<span class="kolom-3"></span>'

<h5>4. 地盤地質與土壤參數（found112 §4.3、§4.6）</h5>
<p class="calc-uitleg">依據工作計畫與設計規範邊界要求，工址土壤參數屬「會改變合格與否之重要假設」，須由設計者依據現場地質鑽探報告填入，不可預設為安全數值。</p>

q_a_in = ?{300}*(kPa)', 容許地盤支承力 qa<span class="alleen-scherm">（依工址鑽探報告輸入，found112 4.3）</span><span class="kolom-3"></span>'
mu_base = ?{0.50}', 基底摩擦係數 μ = tanδ<span class="alleen-scherm">（found112 4.6.2，混凝土澆置於地層通常取 0.40～0.50）</span><span class="kolom-3"></span>'

<h5>5. 底層受拉鋼筋配置</h5>

'<h6>X 向主筋配置（抵抗繞 Y 軸彎矩，沿基腳長度 Lf 分佈）</h6>
@select bar_x_id "X 向主筋規格"
  D25（直徑 25.4 mm，單根 506.7 mm²） = 1
  D16（直徑 15.9 mm，單根 198.6 mm²） = 2
  D19（直徑 19.1 mm，單根 286.5 mm²） = 3
  D22（直徑 22.2 mm，單根 387.1 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
@end
n_bx = ?{11}', X 向配筋總根數 nbx<span class="kolom-3"></span>'

'<h6>Y 向主筋配置（抵抗繞 X 軸彎矩，沿基腳寬度 Bf 分佈）</h6>
@select bar_y_id "Y 向主筋規格"
  D25（直徑 25.4 mm，單根 506.7 mm²） = 1
  D16（直徑 15.9 mm，單根 198.6 mm²） = 2
  D19（直徑 19.1 mm，單根 286.5 mm²） = 3
  D22（直徑 22.2 mm，單根 387.1 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
@end
n_by = ?{11}', Y 向配筋總根數 nby<span class="kolom-3"></span>'

@select hook_mode "鋼筋端部錨定型式"
  90° 標準彎鉤（端部設置彎鉤） = 1
  直鋼筋伸展（無端部彎鉤） = 2
@end

#hide
# 鋼筋規格查詢陣列（CNS 560 規範數值，1:D25, 2:D16, 3:D19, 4:D22, 5:D29, 6:D32）
rebar_d_arr = [1; 2; 3; 4; 5; 6 | 25.4; 15.9; 19.1; 22.2; 28.7; 32.2]
rebar_A_arr = [1; 2; 3; 4; 5; 6 | 506.7; 198.6; 286.5; 387.1; 646.9; 814.3]

db_x = hlookup(rebar_d_arr; bar_x_id; 1; 2) * mm
Ab_x1 = hlookup(rebar_A_arr; bar_x_id; 1; 2) * mm^2
db_y = hlookup(rebar_d_arr; bar_y_id; 1; 2) * mm
Ab_y1 = hlookup(rebar_A_arr; bar_y_id; 1; 2) * mm^2

d_avg = h_f - cover - (db_x + db_y) / 2
d_eff = max(d_avg; 10 mm)

# 輸入防護與檢核條件
ok_mat = bool(fc_in ≥ 17 MPa) * bool(fc_in ≤ 70 MPa) * bool(fy_in ≥ 280 MPa) * bool(fy_in ≤ 550 MPa)
ok_geom_size = bool(B_f > c_1) * bool(L_f > c_2) * bool(h_f ≥ 200 mm) * bool(cover ≥ 50 mm)
ok_loads = bool(P_serv > 0 kN) * bool(P_u > 0 kN) * bool(q_a_in > 0 kPa)
ok_rebar = bool(n_bx ≥ 2) * bool(n_by ≥ 2) * bool(d_eff > 100 mm)
ok_all_input = bool(ok_mat) * bool(ok_geom_size) * bool(ok_loads) * bool(ok_rebar)
#show

#if ok_all_input ≡ 1
    # 6. 地盤支承力與偏心檢核（found112 §4.1.1、§4.3）

    #hide
    Area_f = B_f * L_f
    W_footing = Area_f * h_f * gamma_c
    W_soil = Area_f * D_f * gamma_s
    P_tot_serv = P_serv + W_footing + W_soil

    S_fx = B_f * L_f^2 / 6
    S_fy = L_f * B_f^2 / 6

    q_avg_serv = P_tot_serv / Area_f to kPa
    q_mom_x = abs(Mx_serv) / S_fx to kPa
    q_mom_y = abs(My_serv) / S_fy to kPa

    q_max_serv = q_avg_serv + q_mom_x + q_mom_y
    q_min_serv = q_avg_serv - q_mom_x - q_mom_y

    e_x = abs(My_serv) / P_tot_serv to mm
    e_y = abs(Mx_serv) / P_tot_serv to mm
    kern_x = B_f / 6 to mm
    kern_y = L_f / 6 to mm

    UC_bearing = q_max_serv / q_a_in
    UC_ecc_x = e_x / kern_x
    UC_ecc_y = e_y / kern_y
    UC_ecc = max(UC_ecc_x; UC_ecc_y)
    is_uplift = bool(q_min_serv < 0 kPa)
    #show

    Area_f to m^2', 基腳底面接觸面積 Af = Bf·Lf<span class="kolom-2"></span>'
    W_footing to kN', 基腳自重 W_footing = Af·hf·γc<span class="kolom-2"></span>'
    W_soil to kN', 基腳頂覆土重量 W_soil = Af·Df·γs<span class="kolom-2"></span>'
    P_tot_serv to kN', 作用於地盤之總服務垂直載重 P_total = P_serv + W_f + W_s<span class="kolom-2"></span>'
    q_avg_serv', 基底平均支承壓力 q_avg = P_total / Af<span class="kolom-2"></span>'
    q_max_serv', 考慮雙向偏心彎矩之最大接觸壓力 q_max = q_avg + |Mx|/Sx + |My|/Sy<span class="kolom-2"></span>'
    q_min_serv', 最小接觸壓力 q_min = q_avg − |Mx|/Sx − |My|/Sy（小於 0 顯示基礎底面有受拉揚起）<span class="kolom-2"></span>'
    q_a_in', 容許地盤支承力 qa（found112 §4.3，工址鑽探值）<span class="kolom-2"></span>'
    UC_bearing', 地盤支承力檢核比 UC_bearing = q_max / qa<span class="kolom-2"></span>'
    '地盤支承力檢核：UC = <b>'ru(UC_bearing)'</b> <b>'oordeel(UC_bearing)'</b>（'q_max_serv' ≤ 'q_a_in'）<span class="alleen-scherm"></span>

    e_x', X 向偏心距 ex = |My| / P_total（截面核心限值 Bf/6 = 'kern_x'）<span class="kolom-2"></span>'
    e_y', Y 向偏心距 ey = |Mx| / P_total（截面核心限值 Lf/6 = 'kern_y'）<span class="kolom-2"></span>'
    UC_ecc', 偏心控制比 UC_ecc = max(ex/(B/6), ey/(L/6))<span class="kolom-2"></span>'
    '基礎底面偏心檢核：UC = <b>'ru(UC_ecc)'</b> <b>'oordeel(UC_ecc)'</b>（'if(is_uplift ≡ 0; "基底全斷面受壓，無揚起"; "基底角隅有拉起揚起趨勢")'）<span class="alleen-scherm"></span>

    # 7. 淺基礎抗滑動安全檢核（found112 §4.6，式 4.6-1）

    #hide
    H_tot_serv = sqrt(Hx_serv^2 + Hy_serv^2)
    R_friction = mu_base * P_tot_serv
    FS_slide = R_friction / max(H_tot_serv; 0.001 kN)
    FS_slide_req = 1.5
    UC_slide = FS_slide_req / max(FS_slide; 0.001)
    #show

    H_tot_serv to kN', 作用於基礎之合水平剪力 H = √(Hx² + Hy²)<span class="kolom-2"></span>'
    R_friction to kN', 基底極限抗滑摩擦力 Rf = μ·P_total（式 4.6-1，μ = 'mu_base'）<span class="kolom-2"></span>'
    FS_slide', 抗滑動安全係數 FS_slide = Rf / H<span class="kolom-2"></span>'
    UC_slide', 抗滑動檢核比 UC_slide = 1.5 / FS_slide（表 4.6-1 長期載重 FS ≥ 1.5）<span class="kolom-2"></span>'
    '基礎抗滑動檢核：UC = <b>'ru(UC_slide)'</b> <b>'oordeel(UC_slide)'</b>（FS = 'ru(FS_slide)' ≥ 'FS_slide_req'）<span class="alleen-scherm"></span>

    # 8. 單向剪力（樑剪力）檢核（rc112 §13.2.6 & §13.3.6.1.1）
    <p class="calc-uitleg">依據 rc112 第 13.2.6 節，基腳單向剪力臨界斷面位於柱面外距有效深度 d 處。基腳受上部柱設計載重作用，以淨向上地盤反力 qu = Pu / (Bf·Lf) 進行剪力需求計算。</p>

    #hide
    qu_net = P_u / Area_f to kPa

    cant_x = (B_f - c_1) / 2
    cant_y = (L_f - c_2) / 2

    # X 向單向剪力（沿 Lf 寬度之臨界截面）
    Lx_shear = max(cant_x - d_eff; 0 mm)
    V_ux = qu_net * L_f * Lx_shear to kN
    Vc_x_nom = 0.17 * sqrt(fc_in / (1 MPa)) * L_f * d_eff * (1 MPa) to kN
    phiVc_x = 0.75 * Vc_x_nom to kN
    UC_vx = V_ux / max(phiVc_x; 0.001 kN)

    # Y 向單向剪力（沿 Bf 寬度之臨界截面）
    Ly_shear = max(cant_y - d_eff; 0 mm)
    V_uy = qu_net * B_f * Ly_shear to kN
    Vc_y_nom = 0.17 * sqrt(fc_in / (1 MPa)) * B_f * d_eff * (1 MPa) to kN
    phiVc_y = 0.75 * Vc_y_nom to kN
    UC_vy = V_uy / max(phiVc_y; 0.001 kN)
    #show

    qu_net', 柱設計軸力引起之均佈淨地壓 qu = Pu / (Bf·Lf)<span class="kolom-2"></span>'
    d_eff to mm', 基腳平均有效深度 d = hf − cover − db<span class="kolom-2"></span>'
    cant_x to mm', X 向懸臂長度 ax = (Bf − c1)/2<span class="kolom-2"></span>'
    Lx_shear to mm', X 向剪力承受長度 (ax − d)<span class="kolom-2"></span>'
    V_ux', X 向單向設計剪力需求 Vux = qu·Lf·(ax − d)<span class="kolom-2"></span>'
    phiVc_x', X 向混凝土單向設計剪力容量 ϕVcx = 0.75·0.17·√f'c·Lf·d（式 22.5.5.1）<span class="kolom-2"></span>'
    UC_vx', X 向單向剪力檢核比 UC_vx = Vux / (ϕVcx)<span class="kolom-2"></span>'
    'X 向單向剪力檢核：UC = <b>'ru(UC_vx)'</b> <b>'oordeel(UC_vx)'</b>（'V_ux' ≤ 'phiVc_x'）<span class="alleen-scherm"></span>

    cant_y to mm', Y 向懸臂長度 ay = (Lf − c2)/2<span class="kolom-2"></span>'
    Ly_shear to mm', Y 向剪力承受長度 (ay − d)<span class="kolom-2"></span>'
    V_uy', Y 向單向設計剪力需求 Vuy = qu·Bf·(ay − d)<span class="kolom-2"></span>'
    phiVc_y', Y 向混凝土單向設計剪力容量 ϕVcy = 0.75·0.17·√f'c·Bf·d<span class="kolom-2"></span>'
    UC_vy', Y 向單向剪力檢核比 UC_vy = Vuy / (ϕVcy)<span class="kolom-2"></span>'
    'Y 向單向剪力檢核：UC = <b>'ru(UC_vy)'</b> <b>'oordeel(UC_vy)'</b>（'V_uy' ≤ 'phiVc_y'）<span class="alleen-scherm"></span>

    # 9. 雙向穿孔剪力（沖剪）檢核（rc112 §13.2.6 & 表 22.6.5.2）
    <p class="calc-uitleg">雙向穿孔剪力臨界周長位於柱面周圍 d/2 處。標稱沖剪應力 vc 採 112 年版規範表 22.6.5.2 公式（已驗證公式 rc112_punching_vc），完整計入斷面尺寸效應係數 λs = min(1, √(2/(1+d/250))) 與柱長寬比 β 修正。</p>

    #hide
    bp_1 = c_1 + d_eff
    bp_2 = c_2 + d_eff
    b_o = 2 * (bp_1 + bp_2)
    Area_punch = bp_1 * bp_2
    V_up = qu_net * (Area_f - Area_punch) to kN

    beta_col = max(c_1; c_2) / min(c_1; c_2)
    d_mm = d_eff / (1 mm)
    lambda_s = min(1.0; sqrt(2.0 / (1.0 + d_mm / 250.0)))
    fc_num = fc_in / (1 MPa)
    rf_fc = sqrt(fc_num)

    # 表 22.6.5.2 三式（αs = 40，內柱）
    bo_mm = b_o / (1 mm)
    vc_1 = 0.33 * lambda_s * rf_fc
    vc_2 = 0.17 * (1.0 + 2.0 / beta_col) * lambda_s * rf_fc
    vc_3 = 0.083 * (2.0 + 40.0 * d_mm / bo_mm) * lambda_s * rf_fc
    vc_punch_MPa = min(vc_1; min(vc_2; vc_3))
    vc_punch = vc_punch_MPa * (1 MPa)

    phiV_punch = 0.75 * vc_punch * b_o * d_eff to kN
    UC_punch = V_up / max(phiV_punch; 0.001 kN)
    #show

    b_o to mm', 穿孔剪力臨界周長 bo = 2·(c1 + c2 + 2d)<span class="kolom-2"></span>'
    Area_punch to m^2', 穿孔臨界周長包絡面積 Ap = (c1+d)·(c2+d)<span class="kolom-2"></span>'
    V_up', 因數化沖剪力需求 Vup = qu·(Af − Ap)<span class="kolom-2"></span>'
    lambda_s', 構材有效深度尺寸效應修正係數 λs = min(1, √(2/(1+d/250)))（22.5.5.1.3）<span class="kolom-2"></span>'
    beta_col', 柱斷面長寬比 β = max(c1,c2)/min(c1,c2)<span class="kolom-2"></span>'
    vc_punch', 混凝土標稱雙向沖剪應力 vc（表 22.6.5.2 三式之最小值）<span class="kolom-2"></span>'
    phiV_punch', 混凝土設計雙向沖剪容量 ϕVp = 0.75·vc·bo·d<span class="kolom-2"></span>'
    UC_punch', 雙向沖剪檢核比 UC_punch = Vup / (ϕVp)<span class="kolom-2"></span>'
    '雙向穿孔剪力檢核：UC = <b>'ru(UC_punch)'</b> <b>'oordeel(UC_punch)'</b>（'V_up' ≤ 'phiV_punch'）<span class="alleen-scherm"></span>

    # 10. 基腳抗彎撓曲與主筋配置檢核（rc112 §13.2.7 & §13.3.3.3）
    <p class="calc-uitleg">基腳抗彎臨界截面位於柱面。依據 rc112 規範第 13.3.3.3 節與第 24.4.3.2 節，受拉鋼筋量不得小於溫度收縮最小鋼筋比 ρmin = 0.0018（SD420）；鋼筋最大間距不得大於 min(3h, 450 mm)。</p>

    #hide
    # X 向彎矩與配筋（抵抗懸臂 ax 之向上地壓）
    M_ux_cant = qu_net * L_f * cant_x^2 / 2 to kN*m
    As_x = max(n_bx; 0) * Ab_x1 to mm^2
    As_x_min = 0.0018 * L_f * h_f to mm^2
    a_x_block = As_x * fy_in / (0.85 * fc_in * L_f) to mm
    Mn_x_nom = As_x * fy_in * (d_eff - a_x_block / 2) to kN*m
    phiMn_x = 0.90 * Mn_x_nom to kN*m
    UC_flex_x = M_ux_cant / max(phiMn_x; 0.001 kN*m)
    UC_rhox = As_x_min / max(As_x; 0.1 mm^2)

    # Y 向彎矩與配筋（抵抗懸臂 ay 之向上地壓）
    M_uy_cant = qu_net * B_f * cant_y^2 / 2 to kN*m
    As_y = max(n_by; 0) * Ab_y1 to mm^2
    As_y_min = 0.0018 * B_f * h_f to mm^2
    a_y_block = As_y * fy_in / (0.85 * fc_in * B_f) to mm
    Mn_y_nom = As_y * fy_in * (d_eff - a_y_block / 2) to kN*m
    phiMn_y = 0.90 * Mn_y_nom to kN*m
    UC_flex_y = M_uy_cant / max(phiMn_y; 0.001 kN*m)
    UC_rhoy = As_y_min / max(As_y; 0.1 mm^2)

    # 鋼筋間距檢核
    s_x = (L_f - 2 * cover - db_x) / max(n_bx - 1; 1) to mm
    s_y = (B_f - 2 * cover - db_y) / max(n_by - 1; 1) to mm
    s_max = min(3 * h_f; 450 mm) to mm
    UC_space_x = s_x / s_max
    UC_space_y = s_y / s_max

    # 長方形基腳短向帶狀分配係數（13.3.3.3）
    beta_L = max(L_f; B_f) / min(L_f; B_f)
    gamma_band = 2.0 / (beta_L + 1.0)
    #show

    M_ux_cant', X 向柱邊設計彎矩 Mux = qu·Lf·ax²/2<span class="kolom-2"></span>'
    As_x to cm^2', X 向實配主筋面積 Asx = 'n_bx' 支 'db_x'<span class="kolom-2"></span>'
    As_x_min to cm^2', X 向最小規定主筋面積 Asx,min = 0.0018·Lf·hf（§13.3.3.3）<span class="kolom-2"></span>'
    phiMn_x', X 向設計抗彎強度 ϕMnx（ϕ = 0.90，應力塊深度 a = 'a_x_block'）<span class="kolom-2"></span>'
    UC_flex_x', X 向抗彎檢核比 UC_flex_x = Mux / (ϕMnx)<span class="kolom-2"></span>'
    'X 向抗彎強度檢核：UC = <b>'ru(UC_flex_x)'</b> <b>'oordeel(UC_flex_x)'</b>（'M_ux_cant' ≤ 'phiMn_x'）<span class="alleen-scherm"></span>

    M_uy_cant', Y 向柱邊設計彎矩 Muy = qu·Bf·ay²/2<span class="kolom-2"></span>'
    As_y to cm^2', Y 向實配主筋面積 Asy = 'n_by' 支 'db_y'<span class="kolom-2"></span>'
    As_y_min to cm^2', Y 向最小規定主筋面積 Asy,min = 0.0018·Bf·hf<span class="kolom-2"></span>'
    phiMn_y', Y 向設計抗彎強度 ϕMny（ϕ = 0.90，應力塊深度 a = 'a_y_block'）<span class="kolom-2"></span>'
    UC_flex_y', Y 向抗彎檢核比 UC_flex_y = Muy / (ϕMny)<span class="kolom-2"></span>'
    'Y 向抗彎強度檢核：UC = <b>'ru(UC_flex_y)'</b> <b>'oordeel(UC_flex_y)'</b>（'M_uy_cant' ≤ 'phiMn_y'）<span class="alleen-scherm"></span>

    s_x', X 向鋼筋平均淨間距 sx（限值 ≤ 's_max'）<span class="kolom-2"></span>'
    s_y', Y 向鋼筋平均淨間距 sy（限值 ≤ 's_max'）<span class="kolom-2"></span>'
    UC_rhox', X 向最小鋼筋比檢核比 UC_rhox = As,min / Asx<span class="kolom-2"></span>'
    UC_rhoy', Y 向最小鋼筋比檢核比 UC_rhoy = As,min / Asy<span class="kolom-2"></span>'
    UC_space_x', X 向鋼筋間距檢核比 UC_space_x = sx / s_max<span class="kolom-2"></span>'
    UC_space_y', Y 向鋼筋間距檢核比 UC_space_y = sy / s_max<span class="kolom-2"></span>'
    gamma_band', 長方形基腳短向帶狀分配係數 γs = 2/(βL+1)（§13.3.3.3，方形為 1.0）<span class="kolom-2"></span>'

    # 11. 柱底傳力承壓檢核（rc112 §16.5.3 & §22.8）

    #hide
    A1_col = c_1 * c_2
    A2_footing = min(Area_f; 4 * A1_col)
    ratio_bearing = min(sqrt(A2_footing / A1_col); 2.0)
    Pn_bearing_nom = 0.85 * fc_in * A1_col * ratio_bearing to kN
    phiPn_bearing = 0.65 * Pn_bearing_nom to kN
    UC_bearing_col = P_u / max(phiPn_bearing; 0.001 kN)
    #show

    A1_col to cm^2', 柱端承壓面積 A1 = c1·c2<span class="kolom-2"></span>'
    ratio_bearing', 承壓幾何圍束放大係數 √(A2/A1) ≤ 2.0（§22.8）<span class="kolom-2"></span>'
    phiPn_bearing', 柱底混凝土設計支承強度 ϕPn = 0.65·0.85·f'c·A1·√(A2/A1)<span class="kolom-2"></span>'
    UC_bearing_col', 柱底承壓檢核比 UC_bearing_col = Pu / (ϕPn)<span class="kolom-2"></span>'
    '柱底交界面承壓檢核：UC = <b>'ru(UC_bearing_col)'</b> <b>'oordeel(UC_bearing_col)'</b>（'P_u' ≤ 'phiPn_bearing'）<span class="alleen-scherm"></span>

    # 12. 主筋伸展錨定長度檢核（rc112 第 25 章）

    #hide
    # 柱面至基腳外緣可用淨長度
    L_avail_x = cant_x - cover to mm
    L_avail_y = cant_y - cover to mm

    # 直鋼筋伸展長度（表 25.4.2.2 簡化式）
    # D19 以下用 2.1，D22 以上用 1.7
    fy_num = fy_in / (1 MPa)
    ld_straight_x = if(db_x ≤ 19.1 mm; (fy_num / (2.1 * rf_fc)) * db_x; (fy_num / (1.7 * rf_fc)) * db_x) to mm
    ld_straight_y = if(db_y ≤ 19.1 mm; (fy_num / (2.1 * rf_fc)) * db_y; (fy_num / (1.7 * rf_fc)) * db_y) to mm

    # 90° 標準彎鉤伸展長度（式 25.4.3.1）
    ldh_hook_x = max((fy_num / (4.2 * rf_fc)) * db_x; max(8 * db_x; 150 mm)) to mm
    ldh_hook_y = max((fy_num / (4.2 * rf_fc)) * db_y; max(8 * db_y; 150 mm)) to mm

    ld_req_x = if(hook_mode ≡ 1; ldh_hook_x; ld_straight_x)
    ld_req_y = if(hook_mode ≡ 1; ldh_hook_y; ld_straight_y)

    UC_ld_x = ld_req_x / max(L_avail_x; 1 mm)
    UC_ld_y = ld_req_y / max(L_avail_y; 1 mm)
    UC_ld = max(UC_ld_x; UC_ld_y)
    #show

    L_avail_x to mm', X 向柱邊可用錨定淨長度 Lax = ax − cover<span class="kolom-2"></span>'
    ld_req_x to mm', X 向受拉鋼筋所需伸展長度（'if(hook_mode ≡ 1; "90° 標準彎鉤 ldh 式 25.4.3.1"; "直鋼筋 ld 表 25.4.2.2")'）<span class="kolom-2"></span>'
    UC_ld_x', X 向錨定伸展檢核比 UC_ldx = ld / Lax<span class="kolom-2"></span>'
    'X 向鋼筋錨定伸展檢核：UC = <b>'ru(UC_ld_x)'</b> <b>'oordeel(UC_ld_x)'</b>（'L_avail_x' ≥ 'ld_req_x'）<span class="alleen-scherm"></span>

    L_avail_y to mm', Y 向柱邊可用錨定淨長度 Lay = ay − cover<span class="kolom-2"></span>'
    ld_req_y to mm', Y 向受拉鋼筋所需伸展長度<span class="kolom-2"></span>'
    UC_ld_y', Y 向錨定伸展檢核比 UC_ldy = ld / Lay<span class="kolom-2"></span>'
    'Y 向鋼筋錨定伸展檢核：UC = <b>'ru(UC_ld_y)'</b> <b>'oordeel(UC_ld_y)'</b>（'L_avail_y' ≥ 'ld_req_y'）<span class="alleen-scherm"></span>
    UC_ld', 主筋錨定伸展控制檢核比 UC_ld = max(UC_ldx, UC_ldy)<span class="kolom-2"></span>'

    # 13. 檢核彙整與控制 UC

    #hide
    UC_load = max(UC_bearing; max(UC_slide; max(UC_vx; max(UC_vy; max(UC_punch; max(UC_flex_x; max(UC_flex_y; max(UC_rhox; max(UC_rhoy; max(UC_bearing_col; max(UC_ld; max(UC_space_x; UC_space_y))))))))))))
    UC_max_raw = if(bool(is_uplift ≡ 0); UC_load; max(UC_load; 1.05))
    UC_max = ru(UC_max_raw)
    ok_all = bool(is_uplift ≡ 0) * bool(UC_load ≤ 1.0)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">計算需求值</th><th style="text-align:right; padding:2px 8px;">設計限值 / 容量</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">地盤容許支承力 (q_max ≤ qa)</td><td style="padding:2px 8px;">found112 §4.3</td><td style="padding:2px 8px; text-align:right;">'q_max_serv'</td><td style="padding:2px 8px; text-align:right;">'q_a_in'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_bearing)'">'ru(UC_bearing)'</td><td style="padding:2px 8px; color:'kleur(UC_bearing)'">'oordeel(UC_bearing)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">底面偏心核心區（無拉起揚起）</td><td style="padding:2px 8px;">found112 §4.1.1</td><td style="padding:2px 8px; text-align:right;">'ru(UC_ecc)'</td><td style="padding:2px 8px; text-align:right;">1.00</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_ecc)'">'ru(UC_ecc)'</td><td style="padding:2px 8px; color:'kleur(UC_ecc)'">'oordeel(UC_ecc)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">基底抗滑動安全性 (FS ≥ 1.5)</td><td style="padding:2px 8px;">found112 §4.6</td><td style="padding:2px 8px; text-align:right;">'H_tot_serv'</td><td style="padding:2px 8px; text-align:right;">'ru(R_friction / 1.5)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_slide)'">'ru(UC_slide)'</td><td style="padding:2px 8px; color:'kleur(UC_slide)'">'oordeel(UC_slide)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">X 向單向剪力 (Vux ≤ ϕVcx)</td><td style="padding:2px 8px;">rc112 §13.2.6 & §13.3.6</td><td style="padding:2px 8px; text-align:right;">'V_ux'</td><td style="padding:2px 8px; text-align:right;">'phiVc_x'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_vx)'">'ru(UC_vx)'</td><td style="padding:2px 8px; color:'kleur(UC_vx)'">'oordeel(UC_vx)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">Y 向單向剪力 (Vuy ≤ ϕVcy)</td><td style="padding:2px 8px;">rc112 §13.2.6 & §13.3.6</td><td style="padding:2px 8px; text-align:right;">'V_uy'</td><td style="padding:2px 8px; text-align:right;">'phiVc_y'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_vy)'">'ru(UC_vy)'</td><td style="padding:2px 8px; color:'kleur(UC_vy)'">'oordeel(UC_vy)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">雙向穿孔沖剪 (Vup ≤ ϕVp)</td><td style="padding:2px 8px;">rc112 表 22.6.5.2</td><td style="padding:2px 8px; text-align:right;">'V_up'</td><td style="padding:2px 8px; text-align:right;">'phiV_punch'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_punch)'">'ru(UC_punch)'</td><td style="padding:2px 8px; color:'kleur(UC_punch)'">'oordeel(UC_punch)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">X 向抗彎撓曲容量 (Mux ≤ ϕMnx)</td><td style="padding:2px 8px;">rc112 §13.2.7</td><td style="padding:2px 8px; text-align:right;">'M_ux_cant'</td><td style="padding:2px 8px; text-align:right;">'phiMn_x'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_flex_x)'">'ru(UC_flex_x)'</td><td style="padding:2px 8px; color:'kleur(UC_flex_x)'">'oordeel(UC_flex_x)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">Y 向抗彎撓曲容量 (Muy ≤ ϕMny)</td><td style="padding:2px 8px;">rc112 §13.2.7</td><td style="padding:2px 8px; text-align:right;">'M_uy_cant'</td><td style="padding:2px 8px; text-align:right;">'phiMn_y'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_flex_y)'">'ru(UC_flex_y)'</td><td style="padding:2px 8px; color:'kleur(UC_flex_y)'">'oordeel(UC_flex_y)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱底交界面承壓 (Pu ≤ ϕPn)</td><td style="padding:2px 8px;">rc112 §16.5.3 & §22.8</td><td style="padding:2px 8px; text-align:right;">'P_u'</td><td style="padding:2px 8px; text-align:right;">'phiPn_bearing'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_bearing_col)'">'ru(UC_bearing_col)'</td><td style="padding:2px 8px; color:'kleur(UC_bearing_col)'">'oordeel(UC_bearing_col)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">受拉主筋錨定伸展 (ld ≤ L_avail)</td><td style="padding:2px 8px;">rc112 第 25 章</td><td style="padding:2px 8px; text-align:right;">'max(ld_req_x; ld_req_y)'</td><td style="padding:2px 8px; text-align:right;">'min(L_avail_x; L_avail_y)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_ld)'">'ru(UC_ld)'</td><td style="padding:2px 8px; color:'kleur(UC_ld)'">'oordeel(UC_ld)'</td></tr>
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>獨立基腳檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>獨立基腳檢核不合格</b>
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。材料強度、基腳幾何尺寸、柱截面、載重條件或地盤支承力無效或超出工程合理範圍。
#end if
`;
