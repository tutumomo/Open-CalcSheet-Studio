/**
 * 鋼筋混凝土矩形梁設計與檢核 — 依據內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 *
 * 涵蓋內容：
 * 1. 撓曲強度（22.2、21.2）：β1 係數、中性軸求解（單筋/雙筋）、最外層鋼筋拉應變 εt、
 *    強度折減係數 ϕ（拉力控制 0.90 / 壓力控制 0.65 / 過渡區線性插值）、標稱抗彎強度 Mn、
 *    設計抗彎強度 ϕMn、最小受拉鋼筋量 As,min（9.6.1.2）、最大鋼筋延展性檢核（9.3.3.1 εt ≥ εty+0.003）。
 * 2. 剪力強度（22.5、9.6.3、9.7.6）：混凝土剪力強度 Vc（22.5.5.1 詳細法 (a) 0.17λ√f'c·bw·d）、
 *    剪力箍筋強度 Vs（22.5.10.5 Av·fyt·d/s，fyt 上限 420 MPa）、斷面剪力強度上限 Vs,max（22.5.1.2 0.66√f'c·bw·d）、
 *    剪力強度折減係數 ϕv = 0.75、最小剪力筋量 (Av/s)min（9.6.3.3）、箍筋最大間距 s,max（表 9.7.6.2.2 雙分支）。
 * 3. 裂縫控制（24.3.2）：最接近拉力表面之受拉鋼筋最大中心間距 s ≤ min(380·(280/fs) - 2.5cc; 300·(280/fs))，
 *    依 24.3.2.1 准許取 fs = (2/3)fy。
 * 4. 梁撓度檢核（9.3.1.1、24.2）：免算撓度之最小梁深 h,min（表 9.3.1.1 含鋼筋強度修正係數 0.4 + fy/690）、
 *    破裂模數 fr（19.2.3.1 0.62λ√f'c）、開裂彎矩 Mcr、毛斷面慣性矩 Ig、開裂斷面慣性矩 Icr、
 *    Bischoff 有效慣性矩 Ie（24.2.3.5）、簡支均布載重即時撓度 ΔD 與 ΔL、長期撓度乘數 λΔ（24.2.4.1.1）、
 *    長期總撓度 Δtotal，對照表 24.2.2 限值（L/360、L/240）。
 *
 * 雙筋梁公式標註：「非規範逐字，依 22.2 靜力平衡推導」。
 *
 * 計算安全：幾何或輸入不足時拒算並標「總結：無效輸入或幾何尺寸不足，未檢核」，絕不誤判合格。
 */

export const twRcBeam = `"鋼筋混凝土矩形梁設計與檢核（rc112）

'<i>依據內政部《建築物混凝土結構設計規範》（112年8月10日版）進行單筋或雙筋矩形梁之撓曲強度、剪力強度、裂縫控制與撓度檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

# 1. 設計條件與材料規格

'<h6>材料規格</h6>
f_c = ?{28}*(MPa)', 混凝土規定抗壓強度 f'c<span class="alleen-scherm">（rc112 19.2.1，一般構造物 ≥ 21 MPa）</span><span class="kolom-3"></span>'
f_y = ?{420}*(MPa)', 主鋼筋規定降伏強度 fy<span class="alleen-scherm">（rc112 20.2.2，SD420 為 420 MPa）</span><span class="kolom-3"></span>'
f_yt = ?{420}*(MPa)', 剪力箍筋規定降伏強度 fyt<span class="alleen-scherm">（rc112 20.2.2.4，不得大於 420 MPa）</span><span class="kolom-3"></span>'

#hide
E_s = 200000 MPa
fc0 = f_c/(1 MPa)
fy0 = f_y/(1 MPa)
fyt0 = f_yt/(1 MPa)
E_c = 3750*sqrt(max(fc0; 1))*(1 MPa)
f_r = 0.62*1.0*sqrt(max(fc0; 1))*(1 MPa)
n_mod = round(E_s/E_c)
#show
E_c to MPa', 混凝土彈性模數 Ec = 3750√f'c（19.2.2.1）<span class="kolom-2"></span>'
f_r to MPa', 混凝土破裂模數 fr = 0.62λ√f'c（19.2.3.1）<span class="kolom-2"></span>'

'<h6>梁幾何斷面</h6>
b = ?{300}*(mm)', 梁寬 b<span class="kolom-3"></span>'
h = ?{600}*(mm)', 梁深 h<span class="kolom-3"></span>'
L = ?{6.0}*(m)', 梁計算跨度 L<span class="kolom-3"></span>'
c_c = ?{40}*(mm)', 淨保護層厚度 cc<span class="alleen-scherm">（表 20.5.1.3.1，梁暴露環境 40～50 mm）</span><span class="kolom-3"></span>'

@select support_type "支承條件（表 9.3.1.1 撓度控制最小梁深）"
  簡支梁（L/16） = 1
  一端連續（L/18.5） = 2
  兩端連續（L/21） = 3
  懸臂梁（L/8） = 4
@end

'<h6>主受拉鋼筋配置（底層）</h6>
@select bar_t "主受拉鋼筋規格"
  D16（直徑 15.9 mm，單根 198.6 mm²） = 1
  D19（直徑 19.1 mm，單根 286.5 mm²） = 2
  D22（直徑 22.2 mm，單根 387.1 mm²） = 3
  D25（直徑 25.4 mm，單根 506.7 mm²） = 4
  D29（直徑 28.7 mm，單根 646.9 mm²） = 5
  D32（直徑 32.2 mm，單根 814.3 mm²） = 6
  D36（直徑 35.8 mm，單根 1007.0 mm²） = 7
@end
n_t = ?{4}', 主拉力鋼筋根數<span class="kolom-3"></span>'
@select rebar_layers "鋼筋排數"
  單排配置 = 1
  雙排配置 = 2
@end

'<h6>受壓鋼筋配置（頂層，雙筋梁選配）</h6>
@select has_top "是否配置受壓鋼筋（雙筋梁）"
  無受壓筋（單筋矩形梁） = 1
  配置受壓筋（雙筋矩形梁） = 2
@end
@select bar_c "受壓鋼筋規格"
  D16（直徑 15.9 mm） = 1
  D19（直徑 19.1 mm） = 2
  D22（直徑 22.2 mm） = 3
  D25（直徑 25.4 mm） = 4
  D29（直徑 28.7 mm） = 5
@end
n_c = ?{0}', 受壓鋼筋根數<span class="alleen-scherm">（單筋梁填 0）</span><span class="kolom-3"></span>'

'<h6>剪力箍筋配置</h6>
@select bar_v "箍筋規格"
  D10（直徑 9.53 mm，單肢 71.33 mm²） = 1
  D13（直徑 12.7 mm，單肢 126.7 mm²） = 2
  D16（直徑 15.9 mm，單肢 198.6 mm²） = 3
@end
n_legs = ?{2}', 箍筋肢數<span class="alleen-scherm">（標準雙肢箍填 2）</span><span class="kolom-3"></span>'
s_v = ?{150}*(mm)', 箍筋沿梁長之間距 s<span class="kolom-3"></span>'

'<h6>設計與服務載重</h6>
M_u = ?{200}*(kN*m)', 臨界斷面之設計彎矩 Mu<span class="kolom-3"></span>'
V_u = ?{120}*(kN)', 臨界斷面（距支承面 d 處）之設計剪力 Vu<span class="kolom-3"></span>'
M_D = ?{60}*(kN*m)', 服務載重：靜載重彎矩 MD<span class="kolom-3"></span>'
M_L = ?{40}*(kN*m)', 服務載重：活載重彎矩 ML<span class="kolom-3"></span>'
q_sus = ?{0.2}', 持續活載重比例<span class="alleen-scherm">（長期撓度計算，通常取 0.2～0.3）</span><span class="kolom-3"></span>'

#hide
rebar_d = [1; 2; 3; 4; 5; 6; 7 | 15.9; 19.1; 22.2; 25.4; 28.7; 32.2; 35.8]
rebar_A = [1; 2; 3; 4; 5; 6; 7 | 198.6; 286.5; 387.1; 506.7; 646.9; 814.3; 1007.0]
stirrup_d = [1; 2; 3 | 9.53; 12.7; 15.9]
stirrup_A = [1; 2; 3 | 71.33; 126.7; 198.6]

d_bt = hlookup(rebar_d; bar_t; 1; 2)*mm
A_bt1 = hlookup(rebar_A; bar_t; 1; 2)*mm^2
d_bc = hlookup(rebar_d; bar_c; 1; 2)*mm
A_bc1 = hlookup(rebar_A; bar_c; 1; 2)*mm^2
d_v = hlookup(stirrup_d; bar_v; 1; 2)*mm
A_v1 = hlookup(stirrup_A; bar_v; 1; 2)*mm^2

A_s = max(n_t; 0) * A_bt1
A_sp = if(has_top ≡ 2; max(n_c; 0) * A_bc1; 0 mm^2)
A_v = max(n_legs; 0) * A_v1

s_vert = max(25 mm; d_bt)
d_t = h - c_c - d_v - d_bt/2
d = if(rebar_layers ≡ 1; d_t; h - c_c - d_v - d_bt - s_vert/2)
d_prime = c_c + d_v + d_bc/2

ok_b = b > 0 mm
ok_h = h > 0 mm
ok_L = L > 0 m
ok_As = A_s > 0 mm^2
ok_fc = f_c ≥ 21 MPa
ok_geom = bool(d > 50 mm)*bool(ok_b)*bool(ok_h)*bool(ok_L)*bool(ok_As)
#show

# 2. 幾何性質與鋼筋配置核算

A_s to mm^2', 受拉鋼筋總面積 As<span class="kolom-2"></span>'
A_sp to mm^2', 受壓鋼筋總面積 A's<span class="kolom-2"></span>'
A_v to mm^2', 剪力箍筋面積 Av<span class="kolom-2"></span>'
d to mm', 有效深度 d<span class="kolom-2"></span>'
d_t to mm', 極外層受拉鋼筋深度 dt<span class="kolom-2"></span>'

#hide
b0 = max(b/(1 mm); 1)
d0 = max(d/(1 mm); 1)
dt0 = max(d_t/(1 mm); 1)
dp0 = max(d_prime/(1 mm); 1)
As0 = A_s/(1 mm^2)
Asp0 = A_sp/(1 mm^2)
beta1 = if(fc0 ≤ 28; 0.85; if(fc0 ≥ 56; 0.65; 0.85 - 0.05*(fc0 - 28)/7))
ety = fy0 / 200000

// 單筋或雙筋中性軸求解（非規範逐字，依 22.2 靜力平衡推導）
c_single = (As0 * fy0) / (0.85 * fc0 * beta1 * b0)
c_yield = (As0 * fy0 - Asp0 * (fy0 - 0.85 * fc0)) / (0.85 * fc0 * beta1 * b0)
eps_sp_yield = if(c_yield > dp0; 0.003 * (c_yield - dp0) / max(c_yield; 0.001); 0)
Aq = 0.85 * fc0 * beta1 * b0
Bq = Asp0 * (600 - 0.85 * fc0) - As0 * fy0
Cq = -600 * Asp0 * dp0
c_quad = (-Bq + sqrt(max(Bq^2 - 4 * Aq * Cq; 0))) / (2 * Aq)
c_double = if(eps_sp_yield ≥ ety; c_yield; c_quad)
c_num = if(has_top ≡ 2; if(Asp0 > 0; c_double; c_single); c_single)
#show

#if ok_geom ≡ 1
    # 3. 撓曲強度計算與檢核（rc112 22.2、21.2）

    #hide
    c0 = max(c_num; 0.001)
    c = c0 * mm
    a = beta1 * c
    epsilon_t = 0.003 * (dt0 - c0) / c0
    phi_m = if(epsilon_t ≥ ety + 0.003; 0.90; if(epsilon_t ≤ ety; 0.65; 0.65 + 0.25*(epsilon_t - ety)/0.003))

    // 雙筋應力與標稱彎矩（非規範逐字，依 22.2 靜力平衡推導）
    fsp0 = if(has_top ≡ 2; min(fy0; max(0; 200000*0.003*(c0 - dp0)/c0)); 0)
    Mn0 = if(has_top ≡ 2; 0.85*fc0*beta1*c0*b0*(d0 - beta1*c0/2) + Asp0*(fsp0 - 0.85*fc0)*(d0 - dp0); As0*fy0*(d0 - beta1*c0/2))
    #show

    β_1 = beta1', 壓力應力塊係數 β1（rc112 22.2.2.4.3）<span class="kolom-2"></span>'
    c to mm', 中性軸深度 c<span class="kolom-2"></span>'
    a to mm', 等效矩形應力塊深度 a = β1·c<span class="kolom-2"></span>'
    ε_t = epsilon_t', 最外層鋼筋拉應變 εt = 0.003·(dt - c)/c<span class="kolom-2"></span>'
    ε_ty = ety', 鋼筋降伏應變 εty = fy/Es<span class="kolom-2"></span>'
    ϕ_m = phi_m', 撓曲強度折減係數 ϕ（rc112 21.2.2）<span class="kolom-2"></span>'
    M_n = Mn0/1000000 * (1 kN*m)', 標稱抗彎強度 Mn<span class="kolom-2"></span>'
    ϕM_n = ϕ_m * M_n to kN*m', 設計抗彎強度 ϕMn<span class="kolom-2"></span>'

    UC_M = M_u / ϕM_n', 彎矩強度檢核（Mu ≤ ϕMn）<span class="kolom-2"></span>'
    'UC_M <b>'oordeel(UC_M)'</b>（'M_u' ≤ 'ϕM_n'）<span class="alleen-scherm"></span>

    #hide
    As_min1 = 0.25*sqrt(max(fc0; 1))/fy0 * b0 * d0 * (1 mm^2)
    As_min2 = 1.4/fy0 * b0 * d0 * (1 mm^2)
    #show
    A_smin = max(As_min1; As_min2) to mm^2', 最小受拉鋼筋量 As,min（rc112 9.6.1.2）<span class="kolom-2"></span>'
    UC_Asmin = A_smin / A_s', 最小鋼筋量檢核（As ≥ As,min）<span class="kolom-2"></span>'
    'UC_Asmin <b>'oordeel(UC_Asmin)'</b>（'A_s' ≥ 'A_smin'）<span class="alleen-scherm"></span>

    UC_et = (ety + 0.003) / max(epsilon_t; 0.0001)', 鋼筋延展性檢核（εt ≥ εty + 0.003，9.3.3.1）<span class="kolom-2"></span>'
    'UC_et <b>'oordeel(UC_et)'</b>（'ε_t' ≥ 'ety + 0.003'）<span class="alleen-scherm"></span>

    # 4. 剪力強度與剪力筋檢核（rc112 22.5、9.6.3、9.7.6）

    #hide
    Vc0 = 0.17 * sqrt(max(fc0; 1)) * b0 * d0 / 1000
    Vs0 = (A_v/(1 mm^2)) * fyt0 * d0 / max(s_v/(1 mm); 1) / 1000
    Vs_max0 = 0.66 * sqrt(max(fc0; 1)) * b0 * d0 / 1000
    phi_v = 0.75
    #show

    V_c = Vc0 * (1 kN)', 混凝土剪力強度 Vc = 0.17λ√f'c·bw·d（22.5.5.1）<span class="kolom-2"></span>'
    V_s = Vs0 * (1 kN)', 剪力鋼筋剪力強度 Vs = Av·fyt·d/s（22.5.10.5）<span class="kolom-2"></span>'
    V_smax = Vs_max0 * (1 kN)', 斷面最大容許剪力 Vs,max = 0.66√f'c·bw·d（22.5.1.2）<span class="kolom-2"></span>'
    UC_Vsmax = V_s / V_smax', 斷面尺寸上限檢核（Vs ≤ Vs,max）<span class="kolom-2"></span>'
    'UC_Vsmax <b>'oordeel(UC_Vsmax)'</b>（'V_s' ≤ 'V_smax'）<span class="alleen-scherm"></span>

    ϕV_n = phi_v * (V_c + min(V_s; V_smax)) to kN', 設計剪力強度 ϕVn = ϕ(Vc + Vs)<span class="kolom-2"></span>'
    UC_V = V_u / ϕV_n', 剪力強度檢核（Vu ≤ ϕVn）<span class="kolom-2"></span>'
    'UC_V <b>'oordeel(UC_V)'</b>（'V_u' ≤ 'ϕV_n'）<span class="alleen-scherm"></span>

    #hide
    Av_s_req1 = 0.062 * sqrt(max(fc0; 1)) * b0 / fyt0 * (1 mm)
    Av_s_req2 = 0.35 * b0 / fyt0 * (1 mm)
    Av_s_min = max(Av_s_req1; Av_s_req2)
    Av_s_prov = A_v / max(s_v; 1 mm)
    need_Avmin = V_u > 0.5 * phi_v * V_c
    #show
    A_vs_prov = Av_s_prov to mm', 實配箍筋量 Av/s<span class="kolom-2"></span>'
    A_vs_min = Av_s_min to mm', 最小箍筋量規定 (Av/s)min（rc112 9.6.3.3）<span class="kolom-2"></span>'
    UC_Avmin = if(need_Avmin; Av_s_min / Av_s_prov; 0)', 最小剪力筋檢核<span class="kolom-2"></span>'
    'UC_Avmin <b>'oordeel(UC_Avmin)'</b><span class="alleen-scherm"></span>

    #hide
    Vs_limit = 0.33 * sqrt(max(fc0; 1)) * b0 * d0 / 1000 * (1 kN)
    s_limit1 = if(V_s ≤ Vs_limit; min(d/2; 600 mm); min(d/4; 300 mm))
    #show
    s_max = s_limit1 to mm', 箍筋最大間距 s,max（rc112 表 9.7.6.2.2）<span class="kolom-2"></span>'
    UC_s = s_v / s_max', 箍筋間距檢核（s ≤ s,max）<span class="kolom-2"></span>'
    'UC_s <b>'oordeel(UC_s)'</b>（'s_v' ≤ 's_max'）<span class="alleen-scherm"></span>

    # 5. 裂縫控制 — 鋼筋最大間距檢核（rc112 24.3.2）

    #hide
    fs0 = 2/3 * fy0
    cc0 = c_c / (1 mm)
    s_crack1 = (380 * (280 / fs0) - 2.5 * cc0) * (1 mm)
    s_crack2 = (300 * (280 / fs0)) * (1 mm)
    s_crack_max = min(s_crack1; s_crack2)
    s_bar_prov = if(n_t > 1; (b - 2*c_c - 2*d_v - d_bt) / (n_t - 1); b)
    #show
    s_bar = s_bar_prov to mm', 主拉力鋼筋中心間距 s_bar<span class="kolom-2"></span>'
    s_crack_lim = s_crack_max to mm', 裂縫控制最大容許間距（rc112 24.3.2）<span class="kolom-2"></span>'
    UC_crack = s_bar / s_crack_lim', 裂縫控制鋼筋間距檢核（s_bar ≤ s_crack）<span class="kolom-2"></span>'
    'UC_crack <b>'oordeel(UC_crack)'</b>（'s_bar' ≤ 's_crack_lim'）<span class="alleen-scherm"></span>

    # 6. 梁撓度檢核（rc112 9.3.1.1、24.2）

    #hide
    h_min_table = if(support_type ≡ 1; L/16; if(support_type ≡ 2; L/18.5; if(support_type ≡ 3; L/21; L/8)))
    fy_factor = 0.4 + fy0/690
    h_min_req = h_min_table * fy_factor
    #show
    h_min = h_min_req to mm', 撓度控制之最小梁深 h,min（rc112 表 9.3.1.1）<span class="kolom-2"></span>'
    UC_hmin = h_min / h', 梁厚下限檢核（h ≥ h,min）<span class="kolom-2"></span>'
    'UC_hmin <b>'oordeel(UC_hmin)'</b>（'h' ≥ 'h_min'）<span class="alleen-scherm"></span>

    #hide
    Ig0 = b0 * (h/(1 mm))^3 / 12
    I_g = Ig0 * (1 mm^4)
    yt = h / 2
    M_cr = f_r * I_g / yt to kN*m
    rho_w = As0 / (b0 * d0)
    rho_prime = Asp0 / (b0 * d0)
    k_elast = sqrt((rho_w * n_mod)^2 + 2 * rho_w * n_mod) - rho_w * n_mod
    kd0 = k_elast * d0
    Icr0 = b0 * kd0^3 / 3 + n_mod * As0 * (d0 - kd0)^2 + if(has_top ≡ 2; (n_mod - 1) * Asp0 * (kd0 - dp0)^2; 0)
    I_cr = Icr0 * (1 mm^4)

    M_a = M_D + M_L
    Mcr0 = M_cr / (1 kN*m)
    Ma0 = max(M_a / (1 kN*m); 0.001)
    ratio_cr = min(Mcr0 / Ma0; 1.0)
    Ie0 = if(Ma0 ≤ Mcr0; Ig0; Icr0 / (1 - ratio_cr^2 * (1 - Icr0 / Ig0)))
    I_e = min(Ie0; Ig0) * (1 mm^4)

    Ec0 = E_c / (1 MPa)
    L_mm = L / (1 mm)
    delta_imm(M_kNm) = 5 * (M_kNm * 1e6) * (L_mm^2) / (48 * Ec0 * Ie0) * (1 mm)
    Δ_D = delta_imm(M_D / (1 kN*m)) to mm
    Δ_L = delta_imm(M_L / (1 kN*m)) to mm

    xi_time = 2.0
    lambda_delta = xi_time / (1 + 50 * rho_prime)
    Δ_lt = Δ_L + lambda_delta * (Δ_D + q_sus * Δ_L) to mm

    Δ_L_lim = L / 360 to mm
    Δ_lt_lim = L / 240 to mm
    #show
    M_cr', 開裂彎矩 Mcr<span class="kolom-2"></span>'
    M_a', 服務載重總彎矩 Ma = MD + ML<span class="kolom-2"></span>'
    I_g to mm^4', 毛斷面慣性矩 Ig<span class="kolom-2"></span>'
    I_cr to mm^4', 開裂斷面慣性矩 Icr<span class="kolom-2"></span>'
    I_e to mm^4', Bischoff 有效斷面慣性矩 Ie（rc112 24.2.3.5）<span class="kolom-2"></span>'
    Δ_L', 活載重即時撓度 ΔL<span class="kolom-2"></span>'
    Δ_L_lim', 活載重撓度限值 L/360（表 24.2.2）<span class="kolom-2"></span>'
    UC_def_L = Δ_L / Δ_L_lim', 活載重即時撓度檢核<span class="kolom-2"></span>'
    'UC_def_L <b>'oordeel(UC_def_L)'</b>（'Δ_L' ≤ 'Δ_L_lim'）<span class="alleen-scherm"></span>

    Δ_lt', 長期總撓度 Δtotal（考慮收縮與潛變）<span class="kolom-2"></span>'
    Δ_lt_lim', 長期總撓度限值 L/240（表 24.2.2）<span class="kolom-2"></span>'
    UC_def_tot = Δ_lt / Δ_lt_lim', 長期總撓度檢核<span class="kolom-2"></span>'
    'UC_def_tot <b>'oordeel(UC_def_tot)'</b>（'Δ_lt' ≤ 'Δ_lt_lim'）<span class="alleen-scherm"></span>

    # 7. 檢核彙整與控制 UC

    #hide
    UC_max_raw = max(UC_M; UC_Asmin; UC_et; UC_V; UC_Vsmax; UC_Avmin; UC_s; UC_crack; UC_hmin; UC_def_L; UC_def_tot)
    UC_max = ru(UC_max_raw)
    ok_all = bool(UC_max_raw ≤ 1.0)*bool(ok_fc)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">需求值 / 計算值</th><th style="text-align:right; padding:2px 8px;">設計限值</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">正彎矩強度 (Mu ≤ ϕMn)</td><td style="padding:2px 8px;">rc112 22.2</td><td style="padding:2px 8px; text-align:right;">'M_u'</td><td style="padding:2px 8px; text-align:right;">'ϕM_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_M)'">'ru(UC_M)'</td><td style="padding:2px 8px; color:'kleur(UC_M)'">'oordeel(UC_M)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">最小受拉鋼筋量</td><td style="padding:2px 8px;">rc112 9.6.1.2</td><td style="padding:2px 8px; text-align:right;">'A_s'</td><td style="padding:2px 8px; text-align:right;">'A_smin'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_Asmin)'">'ru(UC_Asmin)'</td><td style="padding:2px 8px; color:'kleur(UC_Asmin)'">'oordeel(UC_Asmin)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">拉力鋼筋延展性 (εt)</td><td style="padding:2px 8px;">rc112 9.3.3.1</td><td style="padding:2px 8px; text-align:right;">'ε_t'</td><td style="padding:2px 8px; text-align:right;">'ety + 0.003'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_et)'">'ru(UC_et)'</td><td style="padding:2px 8px; color:'kleur(UC_et)'">'oordeel(UC_et)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">剪力強度 (Vu ≤ ϕVn)</td><td style="padding:2px 8px;">rc112 22.5</td><td style="padding:2px 8px; text-align:right;">'V_u'</td><td style="padding:2px 8px; text-align:right;">'ϕV_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_V)'">'ru(UC_V)'</td><td style="padding:2px 8px; color:'kleur(UC_V)'">'oordeel(UC_V)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">斷面剪力強度上限</td><td style="padding:2px 8px;">rc112 22.5.1.2</td><td style="padding:2px 8px; text-align:right;">'V_s'</td><td style="padding:2px 8px; text-align:right;">'V_smax'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_Vsmax)'">'ru(UC_Vsmax)'</td><td style="padding:2px 8px; color:'kleur(UC_Vsmax)'">'oordeel(UC_Vsmax)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">最小剪力鋼筋量</td><td style="padding:2px 8px;">rc112 9.6.3.3</td><td style="padding:2px 8px; text-align:right;">'Av_s_prov'</td><td style="padding:2px 8px; text-align:right;">'Av_s_min'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_Avmin)'">'ru(UC_Avmin)'</td><td style="padding:2px 8px; color:'kleur(UC_Avmin)'">'oordeel(UC_Avmin)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">箍筋最大間距</td><td style="padding:2px 8px;">rc112 表 9.7.6.2.2</td><td style="padding:2px 8px; text-align:right;">'s_v'</td><td style="padding:2px 8px; text-align:right;">'s_max'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_s)'">'ru(UC_s)'</td><td style="padding:2px 8px; color:'kleur(UC_s)'">'oordeel(UC_s)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">裂縫控制鋼筋間距</td><td style="padding:2px 8px;">rc112 24.3.2</td><td style="padding:2px 8px; text-align:right;">'s_bar'</td><td style="padding:2px 8px; text-align:right;">'s_crack_lim'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_crack)'">'ru(UC_crack)'</td><td style="padding:2px 8px; color:'kleur(UC_crack)'">'oordeel(UC_crack)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">梁深下限（免算撓度）</td><td style="padding:2px 8px;">rc112 表 9.3.1.1</td><td style="padding:2px 8px; text-align:right;">'h'</td><td style="padding:2px 8px; text-align:right;">'h_min'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_hmin)'">'ru(UC_hmin)'</td><td style="padding:2px 8px; color:'kleur(UC_hmin)'">'oordeel(UC_hmin)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">活載重即時撓度 (L/360)</td><td style="padding:2px 8px;">rc112 表 24.2.2</td><td style="padding:2px 8px; text-align:right;">'Δ_L'</td><td style="padding:2px 8px; text-align:right;">'Δ_L_lim'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_def_L)'">'ru(UC_def_L)'</td><td style="padding:2px 8px; color:'kleur(UC_def_L)'">'oordeel(UC_def_L)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">長期總撓度 (L/240)</td><td style="padding:2px 8px;">rc112 表 24.2.2</td><td style="padding:2px 8px; text-align:right;">'Δ_lt'</td><td style="padding:2px 8px; text-align:right;">'Δ_lt_lim'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_def_tot)'">'ru(UC_def_tot)'</td><td style="padding:2px 8px; color:'kleur(UC_def_tot)'">'oordeel(UC_def_tot)'</td></tr>
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>梁檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>梁檢核不合格</b>
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。幾何尺寸不足或未配置有效鋼筋。
#end if
`;
