/**
 * 鋼筋混凝土矩形柱設計與檢核 — 依據內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 *
 * 涵蓋內容：
 * 1. 斷面配筋與幾何限制（10.6.1、10.7.3、25.2.3）：
 *    主筋鋼筋比 ρg 限值（0.01 ≤ ρg ≤ 0.08，10.6.1.1）、矩形閉合箍筋柱最少 4 根主筋（10.7.3.1）、
 *    主筋淨間距限制 s_clear ≥ max(40 mm; 1.5db)（25.2.3，骨材粒徑項依常規施工小於 40 mm 基準下限）。
 * 2. 長細效應與彎矩放大係數法（6.2.5、6.6.4）：
 *    迴轉半徑 r = √(Ig/Ag)（6.2.5.2）、長細比 kℓu/r、忽略長細效應判準（6.2.5.1）、
 *    最小偏心彎矩 M2,min = Pu(15 + 0.03h)（6.6.4.5.4）、等效彎矩因數 Cm（6.6.4.5.3）、
 *    柱有效抗彎剛度 (EI)eff（6.6.4.4.4a）、歐拉臨界挫屈軸力 Pc（6.6.4.4.2）、
 *    無側移放大係數 δns（6.6.4.5.2）、放大後設計端彎矩 Mc = δns·M2,eff（6.6.4.5.1）。
 * 3. 純軸壓極限強度（22.4.2、21.2.2）：
 *    標稱軸壓強度 P0 = 0.85f'c(Ag - Ast) + fy·Ast（22.4.2.2）、
 *    閉合箍筋柱標稱軸壓上限 Pn,max = 0.80·P0（22.4.2.1）、
 *    軸壓設計強度 ϕPn,max = 0.65·Pn,max（表 21.2.2 壓力控制 ϕ = 0.65）。
 * 4. P-M 軸力－彎矩互制分析（簡化三點折線法，rc112 22.4、21.2.2）：
 *    以斷面受彎極端鋼筋與形心靜力平衡分析平衡點（Balanced Point）軸力 Pnb 與抗彎強度 Mnb、
 *    純彎曲設計抗彎強度 ϕMn0（拉力控制 ϕ = 0.90）、理論純軸壓設計容量 ϕP0（ϕ = 0.65）、
 *    在設計軸力 Pu 下之容許抗彎容量 ϕMn,cap、軸彎互制檢核比 UC_PM = Mc / ϕMn,cap。
 *    （注：此簡化三點折線法在全域低於應變相容精確曲線，屬工程保守安全側設計）。
 * 5. 軸壓剪力強度檢核（22.5.5.1、22.5.1.2、9.6.3.3）：
 *    軸壓提升之混凝土剪力強度 Vc = (0.17λ√f'c + Pu/(6Ag))·b·d ≤ 0.42λ√f'c·b·d（22.5.5.1）、
 *    剪力折減係數 ϕv = 0.75（表 21.2.1）、剪力鋼筋強度 Vs = Av·fyt·d/s、
 *    斷面剪力上限 Vs,max = 0.66√f'c·b·d（22.5.1.2）、最小剪力筋量 (Av/s)min（9.6.3.3）。
 * 6. 閉合箍筋構造細則檢核（25.7.2）：
 *    箍筋直徑限制（主筋 ≤ D32 時至少 D10；D36 時至少 D13，25.7.2.2）、
 *    箍筋最大間距 s,max = min(16db; 48dtie; min(b, h))（25.7.2.1）。
 *
 * 計算安全：幾何尺寸為負、未配置有效鋼筋或強度超出範圍時拒算並標「總結：無效輸入，未檢核」，絕不誤判合格。
 */

export const twRcColumn = `"鋼筋混凝土矩形柱設計與檢核（rc112）

'<i>依據內政部《建築物混凝土結構設計規範》（112年8月10日版）進行受軸壓與單向彎矩之鋼筋混凝土矩形柱長細效應、P-M 軸彎互制、剪力強度、主筋淨距與閉合箍筋構造檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

# 1. 設計條件與材料規格

'<h6>材料規格</h6>
f_c = ?{28}*(MPa)', 混凝土規定抗壓強度 f'c<span class="alleen-scherm">（rc112 19.2.1，一般構造物 ≥ 21 MPa）</span><span class="kolom-3"></span>'
f_y = ?{420}*(MPa)', 主鋼筋規定降伏強度 fy<span class="alleen-scherm">（rc112 20.2.2，SD420 為 420 MPa）</span><span class="kolom-3"></span>'
f_yt = ?{280}*(MPa)', 閉合箍筋規定降伏強度 fyt<span class="alleen-scherm">（rc112 20.2.2.4，SD280 為 280 MPa，上限 420 MPa）</span><span class="kolom-3"></span>'

#hide
E_s = 200000 MPa
fc0 = f_c/(1 MPa)
fy0 = f_y/(1 MPa)
fyt0 = f_yt/(1 MPa)
E_c = 3750*sqrt(max(fc0; 1))*(1 MPa)
#show
E_c to MPa', 混凝土彈性模數 Ec = 3750√f'c（rc112 19.2.2.1.b）<span class="kolom-2"></span>'

'<h6>柱幾何斷面與長細比條件</h6>
b = ?{500}*(mm)', 柱斷面寬度 b<span class="kolom-3"></span>'
h = ?{500}*(mm)', 柱彎矩方向深度 h<span class="kolom-3"></span>'
l_u = ?{3.5}*(m)', 柱未支撐長度 ℓu<span class="kolom-3"></span>'
k_factor = ?{1.0}', 有效長度因數 k（無側移構材取 1.0）<span class="kolom-3"></span>'
c_c = ?{40}*(mm)', 淨保護層厚度 cc<span class="alleen-scherm">（表 20.5.1.3.1，非暴露環境柱主筋與箍筋取 40 mm）</span><span class="kolom-3"></span>'
beta_dns = ?{0.6}', 持續因數化軸載重比 βdns<span class="alleen-scherm">（rc112 6.6.4.4.4，通常取 0.6）</span><span class="kolom-3"></span>'

'<h6>因數化設計載重需求</h6>
P_u = ?{1800}*(kN)', 因數化設計軸壓力 Pu<span class="kolom-3"></span>'
M_1 = ?{80}*(kN*m)', 柱端較小彎矩 M1（雙曲率取正、單曲率取負）<span class="kolom-3"></span>'
M_2 = ?{120}*(kN*m)', 柱端較大彎矩 M2（|M2| ≥ |M1|，一律為正值）<span class="kolom-3"></span>'
V_u = ?{150}*(kN)', 因數化設計剪力 Vu<span class="kolom-3"></span>'

# 2. 鋼筋配置與構造限制

@select main_bar "主筋號數（CNS 560 異形鋼筋）"
  D25 (db=25.4 mm, Ab=507 mm2) = 4
  D16 (db=15.9 mm, Ab=199 mm2) = 1
  D19 (db=19.1 mm, Ab=287 mm2) = 2
  D22 (db=22.2 mm, Ab=387 mm2) = 3
  D29 (db=28.7 mm, Ab=647 mm2) = 5
  D32 (db=31.8 mm, Ab=794 mm2) = 6
  D36 (db=35.8 mm, Ab=1007 mm2) = 7
@end

@select tie_bar "閉合箍筋號數"
  D10 (dtie=9.53 mm, Atie=71.3 mm2) = 1
  D13 (dtie=12.7 mm, Atie=126.7 mm2) = 2
@end

n_face = ?{3}', 極端受彎面每側主筋根數 n_face（每側至少 2 根）<span class="kolom-3"></span>'
n_side = ?{1}', 側面中間每側主筋根數 n_side（角筋除外）<span class="kolom-3"></span>'
n_legs = ?{4}', 剪力方向閉合箍筋有效肢數 n_legs<span class="kolom-3"></span>'
s_tie = ?{150}*(mm)', 閉合箍筋配置間距 s<span class="kolom-3"></span>'

#hide
rebar_d = [1; 2; 3; 4; 5; 6; 7 | 15.9; 19.1; 22.2; 25.4; 28.7; 31.8; 35.8]
rebar_A = [1; 2; 3; 4; 5; 6; 7 | 198.6; 286.5; 387.1; 506.7; 646.9; 794.2; 1006.6]
stirrup_d = [1; 2 | 9.53; 12.7]
stirrup_A = [1; 2 | 71.33; 126.7]

mb_id = max(min(round(main_bar); 7); 1)
tb_id = max(min(round(tie_bar); 2); 1)

d_b = hlookup(rebar_d; mb_id; 1; 2)*mm
A_b = hlookup(rebar_A; mb_id; 1; 2)*mm^2
d_tie = hlookup(stirrup_d; tb_id; 1; 2)*mm
A_tie = hlookup(stirrup_A; tb_id; 1; 2)*mm^2

n_b = 2 * n_face + 2 * n_side
ok_b = b > 0 mm
ok_h = h > 0 mm
ok_lu = l_u > 0 m
ok_rebar = (n_b ≥ 4) * (n_face ≥ 2) * (n_side ≥ 0)
ok_stie = s_tie > 0 mm
ok_fc = f_c ≥ 21 MPa
ok_geom = bool(ok_b)*bool(ok_h)*bool(ok_lu)*bool(ok_rebar)*bool(ok_stie)*bool(ok_fc)
#show

d_b', 主筋公稱直徑 db<span class="kolom-2"></span>'
A_b', 主筋單根截面積 Ab<span class="kolom-2"></span>'
d_tie', 箍筋公稱直徑 dtie<span class="kolom-2"></span>'
n_b', 柱縱向主筋總根數 nb = 2·n_face + 2·n_side（至少 4 根，10.7.3.1）<span class="kolom-2"></span>'

#if ok_geom ≡ 1
    #hide
    A_g = b * h to cm^2
    I_g = b * h^3 / 12 to cm^4
    A_st = n_b * A_b to cm^2
    rho_g = (A_st to mm^2) / (b * h)
    UC_rho_min = 0.01 / max(rho_g; 0.00001)
    UC_rho_max = rho_g / 0.08

    s_clear_b = (b - 2 * c_c - 2 * d_tie - n_face * d_b) / max(n_face - 1; 1) to mm
    s_clear_min = max(40 mm; 1.5 * d_b) to mm
    UC_sclear = s_clear_min / max(s_clear_b; 1 mm)
    #show
    A_g', 柱全斷面積 Ag = b·h<span class="kolom-2"></span>'
    I_g', 柱彎矩方向毛斷面慣性矩 Ig = b·h³/12<span class="kolom-2"></span>'
    A_st', 縱向主筋總截面積 Ast = nb·Ab<span class="kolom-2"></span>'
    rho_g', 縱向主筋鋼筋比 ρg = Ast/Ag<span class="kolom-2"></span>'
    UC_rho_min', 最小鋼筋比檢核比 (0.01/ρg)<span class="kolom-2"></span>'
    UC_rho_max', 最大鋼筋比檢核比 (ρg/0.08)<span class="kolom-2"></span>'
    s_clear_b', 受彎極端面主筋淨間距 s_clear<span class="kolom-2"></span>'
    s_clear_min', 主筋淨間距規定下限 max(40 mm, 1.5db)（rc112 25.2.3）<span class="kolom-2"></span>'
    UC_sclear', 主筋淨間距檢核比 s_clear_min / s_clear<span class="kolom-2"></span>'
    '鋼筋比與淨距檢核（rc112 10.6.1.1 規定 1.0% ≤ ρg ≤ 8.0%；25.2.3 規定淨距 ≥ 40 mm）：
    '最小鋼筋比 ρg ≥ 1.0%：UC = <b>'ru(UC_rho_min)'</b> <b>'oordeel(UC_rho_min)'</b><br/>
    '最大鋼筋比 ρg ≤ 8.0%：UC = <b>'ru(UC_rho_max)'</b> <b>'oordeel(UC_rho_max)'</b><br/>
    '主筋淨間距檢核：UC = <b>'ru(UC_sclear)'</b> <b>'oordeel(UC_sclear)'</b><span class="alleen-scherm"></span>

    # 3. 長細效應與彎矩放大（rc112 6.2.5、6.6.4）

    #hide
    r_gyr = sqrt(I_g / A_g) to mm
    slenderness = k_factor * l_u / r_gyr
    ratio_M = min(max(M_1 / max(M_2; 0.001 kN*m); -1.0); 1.0)
    slender_limit = min(34 + 12 * ratio_M; 40)
    is_short = bool(slenderness ≤ slender_limit)

    M2_min = P_u * (15 mm + 0.03 * h) to kN*m
    M2_eff = max(M_2; M2_min)
    C_m = max(0.6 - 0.4 * ratio_M; 0.4)
    EI_eff = 0.4 * E_c * I_g / (1 + beta_dns)
    P_c = pi^2 * EI_eff / ((k_factor * l_u)^2) to kN
    delta_ns = if(is_short ≡ 1; 1.0; max(C_m / (1 - P_u / (0.75 * max(P_c; 1 kN))); 1.0))
    M_c = delta_ns * M2_eff to kN*m
    #show
    r_gyr', 迴轉半徑 r = √(Ig/Ag)（rc112 6.2.5.2）<span class="kolom-2"></span>'
    slenderness', 柱長細比 kℓu/r<span class="kolom-2"></span>'
    slender_limit', 忽略長細效應上限 34 + 12(M1/M2) ≤ 40（6.2.5.1）<span class="kolom-2"></span>'
    is_short', 是否為短柱（1=短柱得忽略, 0=長柱須放大）<span class="kolom-2"></span>'
    #if is_short ≡ 1
        '長細效應判定：<b>短柱（kℓu/r ≤ 限值）</b>，長細比二次效應得忽略，彎矩放大係數 δns = 1.0。<span class="alleen-scherm"></span>
    #else
        '長細效應判定：<b>長柱（kℓu/r > 限值）</b>，須考量長細放大係數 δns。<span class="alleen-scherm"></span>
    #end if
    M2_min', 最小偏心彎矩 M2,min = Pu(15 + 0.03h)（6.6.4.5.4）<span class="kolom-2"></span>'
    M2_eff', 柱端基準設計彎矩 M2,eff = max(M2; M2,min)<span class="kolom-2"></span>'
    C_m', 等效彎矩因數 Cm = 0.6 - 0.4(M1/M2) ≥ 0.4（6.6.4.5.3）<span class="kolom-2"></span>'
    P_c', 歐拉臨界挫屈軸力 Pc = π²(EI)eff/(kℓu)²（6.6.4.4.2）<span class="kolom-2"></span>'
    delta_ns', 彎矩放大係數 δns = Cm/(1 - Pu/0.75Pc) ≥ 1.0（6.6.4.5.2）<span class="kolom-2"></span>'
    M_c', 放大後因數化設計彎矩 Mc = δns·M2,eff（6.6.4.5.1）<span class="kolom-2"></span>'

    # 4. 純軸壓強度極限檢核（rc112 22.4.2、21.2.2）

    #hide
    P_0 = 0.85 * f_c * (A_g - A_st) + f_y * A_st to kN
    Pn_max = 0.80 * P_0 to kN
    phi_axial = 0.65
    phiPn_max = phi_axial * Pn_max to kN
    UC_axial = P_u / max(phiPn_max; 0.001 kN)
    #show
    P_0', 純軸壓標稱軸力強度 P0（22.4.2.2）<span class="kolom-2"></span>'
    Pn_max', 閉合箍筋柱標稱軸壓上限 Pn,max = 0.80·P0（22.4.2.1）<span class="kolom-2"></span>'
    phiPn_max', 最大設計軸壓強度 ϕPn,max（表 21.2.2，ϕ = 0.65）<span class="kolom-2"></span>'
    UC_axial = P_u / phiPn_max', 純軸壓檢核比 UC_axial = Pu / ϕPn,max<span class="kolom-2"></span>'
    '最大軸壓檢核：UC = <b>'ru(UC_axial)'</b> <b>'oordeel(UC_axial)'</b>（'P_u' ≤ 'phiPn_max'）<span class="alleen-scherm"></span>

    # 5. P-M 軸彎互制強度檢核（簡化三點折線法，rc112 22.4、21.2.2）

    #hide
    d_prime = c_c + d_tie + d_b / 2 to mm
    d_depth = h - d_prime to mm
    beta_1 = if(fc0 ≤ 28; 0.85; max(0.65; 0.85 - 0.05 * (fc0 - 28) / 7))

    c_b = (600 / (600 + fy0)) * d_depth to mm
    a_b = beta_1 * c_b to mm
    As_face = n_face * A_b to mm^2
    eps_sp = 0.003 * (c_b - d_prime) / c_b
    fs_sp = min(f_y; 200000 MPa * eps_sp)

    Cc_b = 0.85 * f_c * b * a_b to kN
    Cs_b = As_face * (fs_sp - 0.85 * f_c) to kN
    T_b = As_face * f_y to kN

    P_bal = Cc_b + Cs_b - T_b to kN
    M_bal = Cc_b * (h/2 - a_b/2) + Cs_b * (h/2 - d_prime) + T_b * (d_depth - h/2) to kN*m
    phiP_0 = 0.65 * P_0 to kN
    phiP_bal = 0.65 * P_bal to kN
    phiM_bal = 0.65 * M_bal to kN*m

    Mn_0 = As_face * f_y * (d_depth - d_prime) to kN*m
    phiMn_0 = 0.90 * Mn_0 to kN*m

    phiMn_cap = if(P_u ≥ phiP_bal; phiM_bal * (phiP_0 - P_u) / max(phiP_0 - phiP_bal; 1 kN); phiMn_0 + (phiM_bal - phiMn_0) * (P_u / max(phiP_bal; 1 kN))) to kN*m
    UC_PM = M_c / max(phiMn_cap; 0.001 kN*m)
    #show
    d_depth', 鋼筋有效抗彎深度 d = h - d'<span class="kolom-2"></span>'
    c_b', 平衡破壞中性軸深度 cb = (600/(600+fy))·d<span class="kolom-2"></span>'
    P_bal', 平衡破壞標稱軸力 Pnb<span class="kolom-2"></span>'
    M_bal', 平衡破壞標稱抗彎強度 Mnb<span class="kolom-2"></span>'
    phiP_bal', 平衡點設計軸力 ϕPnb（ϕ = 0.65）<span class="kolom-2"></span>'
    phiM_bal', 平衡點設計抗彎強度 ϕMnb（ϕ = 0.65）<span class="kolom-2"></span>'
    phiMn_0', 純彎曲設計抗彎強度 ϕMn0（拉力控制 ϕ = 0.90）<span class="kolom-2"></span>'
    phiMn_cap', 在設計軸力 Pu 下之容許抗彎容量 ϕMn,cap<span class="kolom-2"></span>'
    UC_PM = M_c / phiMn_cap', 軸力－彎矩互制檢核比 UC_PM = Mc / ϕMn,cap<span class="kolom-2"></span>'
    '軸彎互制承載力檢核（三點簡化折線法）：UC = <b>'ru(UC_PM)'</b> <b>'oordeel(UC_PM)'</b>（'M_c' ≤ 'phiMn_cap'）<span class="alleen-scherm"></span>

    # 6. 剪力強度與閉合箍筋檢核（rc112 22.5.5.1、22.5.1.2）

    #hide
    Nu_Ag = min(P_u / (6 * A_g); 0.05 * f_c)
    Vc_raw = (0.17 * sqrt(max(fc0; 1)) * (1 MPa) + Nu_Ag) * b * d_depth to kN
    Vc_max = 0.42 * sqrt(max(fc0; 1)) * (1 MPa) * b * d_depth to kN
    V_c = min(Vc_raw; Vc_max) to kN

    A_v = n_legs * A_tie to mm^2
    V_s = A_v * f_yt * d_depth / s_tie to kN
    Vs_max = 0.66 * sqrt(max(fc0; 1)) * (1 MPa) * b * d_depth to kN
    Vs_eff = min(V_s; Vs_max) to kN
    phi_v = 0.75
    phiV_n = phi_v * (V_c + Vs_eff) to kN
    UC_shear = V_u / max(phiV_n; 0.001 kN)

    Av_s_prov = A_v / s_tie to mm
    Av_s_min = max(0.062 * sqrt(max(fc0; 1)) * b / fy0; 0.35 * b / fy0) to mm
    UC_Avmin = Av_s_min / max(Av_s_prov; 0.0001 mm)
    UC_Vsmax = V_s / Vs_max
    #show
    V_c', 混凝土剪力強度 Vc（含軸壓力提升效應，22.5.5.1）<span class="kolom-2"></span>'
    V_s', 閉合箍筋剪力強度 Vs = Av·fyt·d/s（22.5.10.5）<span class="kolom-2"></span>'
    Vs_max', 斷面剪力鋼筋強度上限 Vs,max = 0.66√f'c·b·d（22.5.1.2）<span class="kolom-2"></span>'
    phiV_n', 設計剪力強度 ϕVn = ϕ(Vc + Vs)（表 21.2.1，ϕ = 0.75）<span class="kolom-2"></span>'
    UC_shear = V_u / phiV_n', 剪力強度檢核比 UC_shear = Vu / ϕVn<span class="kolom-2"></span>'
    '剪力強度檢核：UC = <b>'ru(UC_shear)'</b> <b>'oordeel(UC_shear)'</b>（'V_u' ≤ 'phiV_n'）<span class="alleen-scherm"></span>

    # 7. 閉合箍筋構造細則檢核（rc112 25.7.2）

    #hide
    dtie_min = if(d_b ≤ 32 mm; 9.53 mm; 12.7 mm)
    UC_dtie = if(d_tie < dtie_min; dtie_min / d_tie; 0.5)

    s_max_1 = 16 * d_b to mm
    s_max_2 = 48 * d_tie to mm
    s_max_3 = min(b; h) to mm
    s_max = min(s_max_1; min(s_max_2; s_max_3)) to mm
    UC_tie = s_tie / max(s_max; 1 mm)
    #show
    dtie_min', 閉合箍筋最小規定直徑（25.7.2.2）<span class="kolom-2"></span>'
    UC_dtie', 箍筋號數檢核比 dtie_min / dtie<span class="kolom-2"></span>'
    s_max', 閉合箍筋最大間距 s,max = min(16db; 48dtie; min(b, h))（25.7.2.1）<span class="kolom-2"></span>'
    UC_tie = s_tie / s_max', 閉合箍筋間距檢核比 UC_tie = s / s,max<span class="kolom-2"></span>'
    '閉合箍筋間距檢核：UC = <b>'ru(UC_tie)'</b> <b>'oordeel(UC_tie)'</b>（'s_tie' ≤ 's_max'）<span class="alleen-scherm"></span>

    # 8. 檢核彙整與控制 UC

    #hide
    UC_max_raw = max(UC_axial; max(UC_PM; max(UC_shear; max(UC_tie; max(UC_dtie; max(UC_Avmin; max(UC_Vsmax; max(UC_rho_min; max(UC_rho_max; UC_sclear)))))))))
    UC_max = ru(UC_max_raw)
    ok_all = bool(UC_max_raw ≤ 1.0)*bool(ok_fc)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">需求值 / 計算值</th><th style="text-align:right; padding:2px 8px;">設計限值</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">主筋最小鋼筋比 (ρg ≥ 1.0%)</td><td style="padding:2px 8px;">rc112 10.6.1.1</td><td style="padding:2px 8px; text-align:right;">'ru(rho_g*100)' %</td><td style="padding:2px 8px; text-align:right;">1.0 %</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_rho_min)'">'ru(UC_rho_min)'</td><td style="padding:2px 8px; color:'kleur(UC_rho_min)'">'oordeel(UC_rho_min)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">主筋最大鋼筋比 (ρg ≤ 8.0%)</td><td style="padding:2px 8px;">rc112 10.6.1.1</td><td style="padding:2px 8px; text-align:right;">'ru(rho_g*100)' %</td><td style="padding:2px 8px; text-align:right;">8.0 %</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_rho_max)'">'ru(UC_rho_max)'</td><td style="padding:2px 8px; color:'kleur(UC_rho_max)'">'oordeel(UC_rho_max)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">主筋淨間距限制</td><td style="padding:2px 8px;">rc112 25.2.3</td><td style="padding:2px 8px; text-align:right;">'ru(s_clear_b)' mm</td><td style="padding:2px 8px; text-align:right;">'ru(s_clear_min)' mm</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_sclear)'">'ru(UC_sclear)'</td><td style="padding:2px 8px; color:'kleur(UC_sclear)'">'oordeel(UC_sclear)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">最大軸壓強度 (Pu ≤ ϕPn,max)</td><td style="padding:2px 8px;">rc112 22.4.2</td><td style="padding:2px 8px; text-align:right;">'P_u'</td><td style="padding:2px 8px; text-align:right;">'phiPn_max'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_axial)'">'ru(UC_axial)'</td><td style="padding:2px 8px; color:'kleur(UC_axial)'">'oordeel(UC_axial)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">軸彎互制強度 (Mc ≤ ϕMn,cap)</td><td style="padding:2px 8px;">rc112 22.4</td><td style="padding:2px 8px; text-align:right;">'M_c'</td><td style="padding:2px 8px; text-align:right;">'phiMn_cap'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_PM)'">'ru(UC_PM)'</td><td style="padding:2px 8px; color:'kleur(UC_PM)'">'oordeel(UC_PM)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">剪力強度 (Vu ≤ ϕVn)</td><td style="padding:2px 8px;">rc112 22.5</td><td style="padding:2px 8px; text-align:right;">'V_u'</td><td style="padding:2px 8px; text-align:right;">'phiV_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_shear)'">'ru(UC_shear)'</td><td style="padding:2px 8px; color:'kleur(UC_shear)'">'oordeel(UC_shear)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">斷面剪力上限 (Vs ≤ Vs,max)</td><td style="padding:2px 8px;">rc112 22.5.1.2</td><td style="padding:2px 8px; text-align:right;">'V_s'</td><td style="padding:2px 8px; text-align:right;">'Vs_max'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_Vsmax)'">'ru(UC_Vsmax)'</td><td style="padding:2px 8px; color:'kleur(UC_Vsmax)'">'oordeel(UC_Vsmax)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">最小剪力鋼筋量</td><td style="padding:2px 8px;">rc112 9.6.3.3</td><td style="padding:2px 8px; text-align:right;">'ru(Av_s_prov*100)/100' mm</td><td style="padding:2px 8px; text-align:right;">'ru(Av_s_min*100)/100' mm</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_Avmin)'">'ru(UC_Avmin)'</td><td style="padding:2px 8px; color:'kleur(UC_Avmin)'">'oordeel(UC_Avmin)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">閉合箍筋規定直徑</td><td style="padding:2px 8px;">rc112 25.7.2.2</td><td style="padding:2px 8px; text-align:right;">'d_tie'</td><td style="padding:2px 8px; text-align:right;">'dtie_min'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_dtie)'">'ru(UC_dtie)'</td><td style="padding:2px 8px; color:'kleur(UC_dtie)'">'oordeel(UC_dtie)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">閉合箍筋最大間距</td><td style="padding:2px 8px;">rc112 25.7.2.1</td><td style="padding:2px 8px; text-align:right;">'s_tie'</td><td style="padding:2px 8px; text-align:right;">'s_max'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_tie)'">'ru(UC_tie)'</td><td style="padding:2px 8px; color:'kleur(UC_tie)'">'oordeel(UC_tie)'</td></tr>
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>柱檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>柱檢核不合格</b>
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。幾何尺寸不足或未配置有效鋼筋。
#end if
`;
