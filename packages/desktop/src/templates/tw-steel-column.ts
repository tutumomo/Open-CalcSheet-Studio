/**
 * 鋼結構熱軋 H 型鋼柱與柱腳設計 — 依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版，steel99）
 * 第（二）篇鋼結構極限設計法（LRFD）。
 *
 * 規範條文與來源（A 級：已驗證庫；本檔數值常數逐項可追溯）：
 * 1. 材料常數（steel99 1.7）：E = 2040 tf/cm²、G = 810 tf/cm²；以 1 tf/cm² = 98.0665 MPa 換算為 SI。
 *    熱軋型鋼殘留應力 Fr = 0.7 tf/cm²（表 4.5-1 註 [b]）；FL = Fy − Fr。
 *    Fy 由使用者依 CNS 鋼種輸入（範圍 2.0～4.55 tf/cm²）；基板鋼材 Fy_bp 由使用者輸入。
 *    基礎混凝土 f'c 由使用者輸入（範圍 140～560 kgf/cm²）。
 * 2. 局部挫屈／斷面分類（表 4.5-1，已驗證表 steel99_wide_thickness_T451，Fy：tf/cm²）：
 *    受壓 I 型翼板（未加勁）：λp = 16/√Fy、λr = 25/√Fy；受壓腹板（加勁）：λp = 50/√Fy、λr = 100/√Fy。
 *    非細長肢材（λ ≤ λr）即可適用第 6 章軸壓設計；細長肢材須依附錄 1 進行 Qs 折減，超限者判為不合格。
 * 3. 鋼柱長細比與軸壓強度（4.4、6.2；已驗證公式 steel99_Fcr_lrfd）：
 *    受壓構材長細比限制 KL/r ≤ 200（§4.4）；λc = (KL/πr)·√(Fy/E)；
 *    λc ≤ 1.5：Fcr = exp(−0.419·λc²)·Fy；λc > 1.5：Fcr = (0.877/λc²)·Fy。
 *    設計軸壓強度 ϕc·Pn，ϕc = 0.85。
 * 4. 梁柱構材撓曲強度與梁柱互制（7.2、8.2；已驗證公式 steel99_solid_weak_axis_Mn、steel99_PnM_interaction）：
 *    強軸撓曲強度考慮 LTB（7.2.2）；弱軸撓曲強度 ϕb·Mny = ϕb·min(Zy·Fy, 1.5·Sy·Fy)（7.2.6，式 7.2-4，ϕb = 0.90）。
 *    互制檢核：若 Pu/(ϕcPn) ≥ 0.2，Pu/(ϕcPn) + (8/9)[Mux/(ϕbMnx) + Muy/(ϕbMny)] ≤ 1.0（式 8.2-1a）；
 *    若 Pu/(ϕcPn) < 0.2，Pu/(2ϕcPn) + [Mux/(ϕbMnx) + Muy/(ϕbMny)] ≤ 1.0（式 8.2-1b）。
 * 5. 柱腳混凝土承壓（10.9；已驗證公式 steel99_concrete_bearing_Pp）：
 *    ϕc·Pp = 0.60·0.85·f'c·A1·min(√(A2/A1), 2.0)，ϕc = 0.60；A1 為基板面積、A2 為墩座頂面同心最大面積。
 * 6. 柱腳基板厚度（AISC Design Guide 1 簡化懸臂法，工程常規，非我國規範明文公式）：
 *    全板角隅接觸壓力 q_max = Pu/(Bp·Np) + |Mux|/Spx + |Muy|/Spy；雙向外伸懸臂彎矩 m = max(my, mx)；
 *    所需厚度 tp,req = √(6m / (0.90·Fy_bp))。
 * 7. 錨栓鋼材拉力與混凝土應力錐抗拔（10.3、10.10.2；已驗證表 steel99_bolt_strength_T1032）：
 *    彈性錨栓群法求解單支最大拉力 T_bolt = max(Mux/(2by) + Muy/(2bx) − Pu/4, 0)；
 *    設計拉力強度 ϕRn = 0.75·Fnt·Ab（表 10.3-2）；
 *    混凝土 45° 應力錐群組聯集抗拉拔強度 ϕTc = 0.75·(1.06√f'c)·Acn（10.10.2 解說）。
 * 8. 柱腳水平剪力與拉剪互制（10.10.2、表 10.3-3）：
 *    摩擦剪力傳遞 ϕVn = 0.75·0.9·Pu（灌漿埋入接觸面）；或錨栓承壓剪力 ϕVn = 4·0.75·Fnv·Ab。
 *
 * 9. 容許應力設計法（ASD，第（一）篇；選單 design_method = 2）：僅檢核鋼柱構材之純軸壓。
 *    Fa（6.3，已驗證 steel99_Fa_asd）：Cc = √(2π²E/Fy)；KL/r < Cc：Fa = [1 − (KL/r)²/(2Cc²)]Fy / [5/3 + 3/8·(KL/r)/Cc − 1/8·((KL/r)/Cc)³]；
 *    KL/r ≥ Cc：Fa = 12π²E/[23(KL/r)²]；fa = P/A ≤ Fa。E 取 steel99 1.7 之 2040 tf/cm²。
 *    ASD 梁柱互制（8.2-1～8.2-3）未入已驗證庫，Mx 或 My 不為零即拒算；柱腳（基板、錨栓）為 LRFD 專屬，ASD 下不檢核並於結尾註明。
 *    寬厚比沿用表 4.5-1（steel99_wide_thickness_T451），ASD 6.3 要求結實或半結實斷面，即 λ ≤ λr。
 *
 * 結尾行：「控制 UC = … → 鋼柱與柱腳檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twSteelColumn = `"鋼結構熱軋 H 型鋼柱與柱腳設計（steel99 LRFD／ASD）

'<i>依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版）第（二）篇極限設計法（LRFD）進行 H 型鋼柱構材之軸壓、長細比、梁柱互制，以及露出式柱腳之混凝土承壓、基板厚度（AISC DG1 懸臂法）與錨栓抗拉／抗剪檢核。選 ASD（第（一）篇）時僅檢核純軸壓柱構材（式 6.3-1、6.3-2），柱腳不檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

# 1. 設計條件與材料性質

@select design_method "設計法（全案擇一，不可混用）"
  極限設計法 LRFD（steel99 第（二）篇） = 1
  容許應力設計法 ASD（steel99 第（一）篇，僅純軸壓柱構材） = 2
@end

'<h6>材料規格與係數（steel99 1.7、10.3、10.9）</h6>
f_y_in = ?{325}*(MPa)', 鋼柱鋼材標稱降伏強度 Fy<span class="alleen-scherm">（常用 SN490 / SM490 為 325 MPa，範圍 2.0～4.55 tf/cm²）</span><span class="kolom-3"></span>'
f_y_bp_in = ?{325}*(MPa)', 柱腳基板鋼材標稱降伏強度 Fy_bp<span class="alleen-scherm">（基板材質常用 SM490 或 SN490）</span><span class="kolom-3"></span>'
fc_in = ?{280}*(kgf/cm^2)', 基礎混凝土規定抗壓強度 f'c<span class="alleen-scherm">（一般基礎常用 210～350 kgf/cm²）</span><span class="kolom-3"></span>'

@select anchor_grade "錨栓鋼材規格（表 10.3-2）"
  A307 螺栓（Fnt = 3.15, Fnv = 1.68 tf/cm²，φ = 0.75） = 1
  F10T 高強度螺栓（Fnt = 7.50, Fnv = 4.00 tf/cm²，φ = 0.75） = 2
  螺牙桿件（Fu = 400 MPa，Fnt = 0.75Fu，Fnv = 0.40Fu，φ = 0.75） = 3
@end

@select shear_mode "柱腳剪力傳遞途徑（§10.10.2）"
  接觸面摩擦力傳遞（μ = 0.9，埋置於灌漿內） = 1
  4 支錨栓承壓式直接抗剪 = 2
@end

#hide
E_t = 2040
G_t = 810
tf_cm2 = 98.0665 MPa
E_s = E_t * tf_cm2
G_s = G_t * tf_cm2
F_r = 0.7 * tf_cm2

f_y = f_y_in
f_y_bp = f_y_bp_in
Fy_t = f_y / tf_cm2
Fy_bp_t = f_y_bp / tf_cm2
FL_t = Fy_t - 0.7
F_L = FL_t * tf_cm2
fc_kgf = fc_in / (1 kgf/cm^2)

ok_fy = bool(Fy_t ≥ 2.0) * bool(Fy_t ≤ 4.55)
ok_fy_bp = bool(Fy_bp_t ≥ 2.0) * bool(Fy_bp_t ≤ 4.55)
ok_fc = bool(fc_kgf ≥ 140) * bool(fc_kgf ≤ 560)
#show

f_y', 鋼柱鋼材降伏強度 Fy<span class="kolom-2"></span>'
f_y_bp', 基板鋼材降伏強度 Fy_bp<span class="kolom-2"></span>'
fc_in', 基礎混凝土強度 f'c<span class="kolom-2"></span>'
E_s', 鋼材彈性模數 E = 2040 tf/cm²（steel99 1.7）<span class="kolom-2"></span>'
G_s', 鋼材剪力彈性模數 G = 810 tf/cm²（steel99 1.7）<span class="kolom-2"></span>'

'<h6>柱長度、有效長度係數與側撐條件</h6>
L_col = ?{4.0}*(m)', 鋼柱未支撐長度 L（樓層淨高）<span class="kolom-3"></span>'
K_x = ?{1.0}', 強軸有效長度係數 Kx<span class="alleen-scherm">（依 §4.8，側移構架不得任意取 1.0）</span><span class="kolom-3"></span>'
K_y = ?{1.0}', 弱軸有效長度係數 Ky<span class="alleen-scherm">（依構架穩定性與柱端束制填入）</span><span class="kolom-3"></span>'
L_b = ?{4.0}*(m)', 側向無支撐長度 Lb（弱軸側撐間距）<span class="kolom-3"></span>'
C_b = ?{1.0}', 側向扭轉挫屈彎矩梯度修正因數 Cb（均勻彎矩取 1.0）<span class="kolom-3"></span>'

'<h6>設計載重需求（LRFD 取因數化載重；ASD 取服務載重組合，steel99 2.2）</h6>
P_u = ?{700}*(kN)', 設計軸壓力 Pu（受壓為正；ASD 時為服務載重軸力 P）<span class="kolom-3"></span>'
M_ux = ?{120}*(kN*m)', 強軸因數化設計彎矩 Mux<span class="kolom-3"></span>'
M_uy = ?{20}*(kN*m)', 弱軸因數化設計彎矩 Muy<span class="kolom-3"></span>'
V_u = ?{80}*(kN)', 柱腳因數化設計水平剪力 Vu<span class="kolom-3"></span>'

'<h6>柱腳基板、墩座與錨栓配置</h6>
B_p = ?{500}*(mm)', 基板寬度 Bp（平行於柱強軸／腹板向）<span class="kolom-3"></span>'
N_p = ?{500}*(mm)', 基板長度 Np（平行於柱弱軸／翼板向）<span class="kolom-3"></span>'
t_p = ?{32}*(mm)', 基板厚度 tp<span class="kolom-3"></span>'
B_ped = ?{700}*(mm)', 基礎墩座頂面寬度 Bped<span class="kolom-3"></span>'
N_ped = ?{700}*(mm)', 基礎墩座頂面長度 Nped<span class="kolom-3"></span>'
d_b = ?{30}*(mm)', 錨栓公稱直徑 db<span class="kolom-3"></span>'
b_x = ?{350}*(mm)', 錨栓 X 向中心間距 bx<span class="kolom-3"></span>'
b_y = ?{350}*(mm)', 錨栓 Y 向中心間距 by<span class="kolom-3"></span>'
h_ef = ?{450}*(mm)', 錨栓有效埋深 hef<span class="kolom-3"></span>'

# 2. 熱軋 H 型鋼斷面選取與幾何力學性質

@select section_id "CNS 1490 熱軋 H 型鋼規格"
  RH 300x300x10x15 (h=300, b=300, tw=10, tf=15 mm, W=94.0 kg/m) = 7
  RH 200x200x8x12 (h=200, b=200, tw=8, tf=12 mm, W=49.9 kg/m) = 5
  RH 250x250x9x14 (h=250, b=250, tw=9, tf=14 mm, W=72.4 kg/m) = 6
  RH 350x350x12x19 (h=350, b=350, tw=12, tf=19 mm, W=137.0 kg/m) = 8
  RH 400x400x13x21 (h=400, b=400, tw=13, tf=21 mm, W=172.0 kg/m) = 9
  RH 400x200x8x13 (h=400, b=200, tw=8, tf=13 mm, W=66.0 kg/m) = 14
  RH 200x100x5.5x8 (h=200, b=100, tw=5.5, tf=8 mm, W=21.3 kg/m) = 10
  RH 250x125x6x9 (h=250, b=125, tw=6, tf=9 mm, W=29.6 kg/m) = 11
  RH 300x150x6.5x9 (h=300, b=150, tw=6.5, tf=9 mm, W=36.7 kg/m) = 12
  RH 350x175x7x11 (h=350, b=175, tw=7, tf=11 mm, W=49.6 kg/m) = 13
  RH 450x200x9x14 (h=450, b=200, tw=9, tf=14 mm, W=76.0 kg/m) = 15
  RH 500x200x10x16 (h=500, b=200, tw=10, tf=16 mm, W=89.6 kg/m) = 16
  RH 600x200x11x17 (h=600, b=200, tw=11, tf=17 mm, W=106.0 kg/m) = 17
  RH 700x300x13x24 (h=700, b=300, tw=13, tf=24 mm, W=185.0 kg/m) = 18
  RH 800x300x14x26 (h=800, b=300, tw=14, tf=26 mm, W=210.0 kg/m) = 19
  RH 900x300x16x28 (h=900, b=300, tw=16, tf=28 mm, W=243.0 kg/m) = 20
  RH 100x100x6x8 (h=100, b=100, tw=6, tf=8 mm, W=17.2 kg/m) = 1
  RH 125x125x6.5x9 (h=125, b=125, tw=6.5, tf=9 mm, W=23.8 kg/m) = 2
  RH 150x150x7x10 (h=150, b=150, tw=7, tf=10 mm, W=31.5 kg/m) = 3
  RH 175x175x7.5x11 (h=175, b=175, tw=7.5, tf=11 mm, W=40.2 kg/m) = 4
@end

#hide
sec_id = max(min(round(section_id); 20); 1)
'台灣常用H型鋼斷面表（CNS 1490）: id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)
tw_h_sections = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12; 13; 14; 15; 16; 17; 18; 19; 20 |100; 125; 150; 175; 200; 250; 300; 350; 400; 200; 250; 300; 350; 400; 450; 500; 600; 700; 800; 900 |100; 125; 150; 175; 200; 250; 300; 350; 400; 100; 125; 150; 175; 200; 200; 200; 200; 300; 300; 300 |6; 6.5; 7; 7.5; 8; 9; 10; 12; 13; 5.5; 6; 6.5; 7; 8; 9; 10; 11; 13; 14; 16 |8; 9; 10; 11; 12; 14; 15; 19; 21; 8; 9; 9; 11; 13; 14; 16; 17; 24; 26; 28 |21.9; 30.3; 40.1; 51.2; 63.5; 92.2; 119.8; 173.9; 218.7; 27.2; 37.7; 46.8; 63.1; 84.1; 96.8; 114.2; 134.4; 235.5; 267.4; 309.8 |383; 847; 1640; 2880; 4720; 10800; 20400; 40300; 66600; 1840; 4050; 7210; 13600; 23700; 33500; 47800; 77600; 201000; 292000; 411000 |76.5; 136; 219; 330; 472; 864; 1360; 2300; 3330; 184; 324; 481; 777; 1190; 1490; 1910; 2590; 5760; 7290; 9140 |85.5; 152; 245; 368; 524; 963; 1510; 2580; 3730; 209; 368; 544; 876; 1330; 1680; 2170; 2980; 6490; 8260; 10500 |4.18; 5.29; 6.39; 7.5; 8.62; 10.8; 13.1; 15.2; 17.5; 8.23; 10.4; 12.4; 14.7; 16.8; 18.6; 20.5; 24; 29.3; 33; 36.4 |134; 293; 563; 984; 1600; 3650; 6750; 13600; 22400; 134; 294; 508; 984; 1740; 1870; 2140; 2280; 10800; 11700; 12600 |26.7; 46.9; 75.1; 112; 160; 292; 450; 776; 1120; 26.8; 47; 67.7; 112; 174; 187; 214; 228; 722; 781; 843 |40.6; 71.5; 115; 171; 244; 445; 686; 1180; 1710; 41.4; 72.6; 105; 174; 269; 290; 334; 359; 1120; 1220; 1330 |2.47; 3.11; 3.75; 4.38; 5.02; 6.29; 7.51; 8.84; 10.1; 2.22; 2.79; 3.29; 3.95; 4.54; 4.4; 4.33; 4.12; 6.79; 6.62; 6.39 |17.2; 23.8; 31.5; 40.2; 49.9; 72.4; 94; 137; 172; 21.3; 29.6; 36.7; 49.6; 66; 76; 89.6; 106; 185; 210; 243]
h = hlookup(tw_h_sections; sec_id; 1; 2)*mm
b = hlookup(tw_h_sections; sec_id; 1; 3)*mm
t_w = hlookup(tw_h_sections; sec_id; 1; 4)*mm
t_f = hlookup(tw_h_sections; sec_id; 1; 5)*mm
A = hlookup(tw_h_sections; sec_id; 1; 6)*cm^2
I_x = hlookup(tw_h_sections; sec_id; 1; 7)*cm^4
W_x = hlookup(tw_h_sections; sec_id; 1; 8)*cm^3
Z_x = hlookup(tw_h_sections; sec_id; 1; 9)*cm^3
i_x = hlookup(tw_h_sections; sec_id; 1; 10)*cm
I_y = hlookup(tw_h_sections; sec_id; 1; 11)*cm^4
W_y = hlookup(tw_h_sections; sec_id; 1; 12)*cm^3
Z_y = hlookup(tw_h_sections; sec_id; 1; 13)*cm^3
i_y = hlookup(tw_h_sections; sec_id; 1; 14)*cm
w = hlookup(tw_h_sections; sec_id; 1; 15)*(kg/m)

h = hlookup(tw_h_sections; sec_id; 1; 2)*mm
b = hlookup(tw_h_sections; sec_id; 1; 3)*mm
t_w = hlookup(tw_h_sections; sec_id; 1; 4)*mm
t_f = hlookup(tw_h_sections; sec_id; 1; 5)*mm
A = hlookup(tw_h_sections; sec_id; 1; 6)*cm^2
I_x = hlookup(tw_h_sections; sec_id; 1; 7)*cm^4
W_x = hlookup(tw_h_sections; sec_id; 1; 8)*cm^3
Z_x = hlookup(tw_h_sections; sec_id; 1; 9)*cm^3
i_x = hlookup(tw_h_sections; sec_id; 1; 10)*cm
I_y = hlookup(tw_h_sections; sec_id; 1; 11)*cm^4
W_y = hlookup(tw_h_sections; sec_id; 1; 12)*cm^3
Z_y = hlookup(tw_h_sections; sec_id; 1; 13)*cm^3
i_y = hlookup(tw_h_sections; sec_id; 1; 14)*cm
w = hlookup(tw_h_sections; sec_id; 1; 15)*(kg/m)

h_w = h - 2 * t_f
hmm = h / (1 mm)
bmm = b / (1 mm)
twmm = t_w / (1 mm)
tfmm = t_f / (1 mm)
J_n = (2 * bmm * tfmm^3 + (hmm - 2 * tfmm) * twmm^3) / 3
Cw_n = tfmm * bmm^3 * (hmm - tfmm)^2 / 24
J = J_n * mm^4 to cm^4
C_w = Cw_n * mm^6 to cm^6

ok_h = h > 0 mm
ok_b = b > 0 mm
ok_tw = t_w > 0 mm
ok_tf = t_f > 0 mm
ok_col_L = L_col > 0 m
ok_kx = K_x > 0
ok_ky = K_y > 0
ok_plate = bool(B_p > b) * bool(N_p > h) * bool(t_p > 0 mm)
ok_ped = bool(B_ped ≥ B_p) * bool(N_ped ≥ N_p)
ok_bolt = bool(b_x > 0 mm) * bool(b_y > 0 mm) * bool(d_b ≥ 16 mm) * bool(h_ef > 0 mm)
ok_asd = if(design_method ≡ 2; bool(abs(M_ux) < 0.001 kN*m) * bool(abs(M_uy) < 0.001 kN*m); 1)
ok_meth = bool(design_method ≡ 1) + bool(design_method ≡ 2)
ok_foot = if(design_method ≡ 2; 1; bool(ok_fy_bp)*bool(ok_fc)*bool(ok_plate)*bool(ok_ped)*bool(ok_bolt))
ok_geom = bool(ok_asd)*bool(ok_meth)*bool(ok_fy)*bool(ok_h)*bool(ok_b)*bool(ok_tw)*bool(ok_tf)*bool(ok_col_L)*bool(ok_kx)*bool(ok_ky)*bool(ok_foot)
#show

h', 斷面高度 h<span class="kolom-2"></span>'
b', 翼板寬度 b<span class="kolom-2"></span>'
t_w', 腹板厚度 tw<span class="kolom-2"></span>'
t_f', 翼板厚度 tf<span class="kolom-2"></span>'
A', 斷面積 A<span class="kolom-2"></span>'
I_x', 強軸慣性矩 Ix<span class="kolom-2"></span>'
W_x', 強軸彈性斷面模數 Wx (Sx)<span class="kolom-2"></span>'
Z_x', 強軸塑性斷面模數 Zx<span class="kolom-2"></span>'
i_x', 強軸迴轉半徑 rx<span class="kolom-2"></span>'
I_y', 弱軸慣性矩 Iy<span class="kolom-2"></span>'
W_y', 弱軸彈性斷面模數 Wy (Sy)<span class="kolom-2"></span>'
Z_y', 弱軸塑性斷面模數 Zy<span class="kolom-2"></span>'
i_y', 弱軸迴轉半徑 ry<span class="kolom-2"></span>'
J', 扭曲常數 J（薄壁開口斷面閉合式，略去圓角偏安全）<span class="kolom-2"></span>'
C_w', 翹曲常數 Cw（雙對稱 I 型閉合式）<span class="kolom-2"></span>'

#if ok_geom ≡ 1
    # 3. 柱斷面寬厚比檢核（局部挫屈，表 4.5-1）

    #hide
    lambda_f = (b / 2) / t_f
    lambda_pf = 16 / sqrt(Fy_t)
    lambda_rf = 25 / sqrt(Fy_t)
    lambda_w = h_w / t_w
    lambda_pw = 50 / sqrt(Fy_t)
    lambda_rw = 100 / sqrt(Fy_t)

    UC_lambda_f = lambda_f / lambda_rf
    UC_lambda_w = lambda_w / lambda_rw
    is_compact = bool(lambda_f ≤ lambda_pf) * bool(lambda_w ≤ lambda_pw)
    is_nonslender = bool(lambda_f ≤ lambda_rf) * bool(lambda_w ≤ lambda_rw)
    #show

    lambda_f', 翼板寬厚比 λf = (b/2) / tf<span class="kolom-2"></span>'
    lambda_pf', 軸壓翼板結實限值 λpf = 16 / √Fy（表 4.5-1）<span class="kolom-2"></span>'
    lambda_rf', 軸壓翼板細長限值 λrf = 25 / √Fy（表 4.5-1，檢核依此）<span class="kolom-2"></span>'
    lambda_w', 腹板深厚比 λw = hw / tw<span class="kolom-2"></span>'
    lambda_pw', 軸壓腹板結實限值 λpw = 50 / √Fy（表 4.5-1）<span class="kolom-2"></span>'
    lambda_rw', 軸壓腹板細長限值 λrw = 100 / √Fy（表 4.5-1，檢核依此）<span class="kolom-2"></span>'
    is_nonslender', 非細長斷面判定（1 為非細長，0 為細長肢材；細長者須依附錄 1 之 Qs 折減，超限判不合格）<span class="kolom-2"></span>'

    #if design_method ≡ 1
    # 4. 鋼柱長細比與軸壓設計強度（steel99 第 6 章 LRFD）

    #hide
    KLr_x = (K_x * L_col) / i_x
    KLr_y = (K_y * L_col) / i_y
    KLr_max = max(KLr_x; KLr_y)
    UC_klr = KLr_max / 200
    ok_klr = bool(KLr_max ≤ 200)

    lambda_c = (KLr_max / pi) * sqrt(Fy_t / E_t)
    Fcr_t = if(lambda_c ≤ 1.5; exp(-0.419 * lambda_c^2) * Fy_t; (0.877 / lambda_c^2) * Fy_t)
    F_cr = Fcr_t * tf_cm2
    Ac = A / (1 cm^2)
    phi_c = 0.85
    Pn_t = phi_c * Ac * Fcr_t
    phiP_n = Pn_t * (9.80665 kN)
    UC_P = P_u / max(phiP_n; 0.001 kN)
    #show

    KLr_x', 強軸長細比 (KL/r)x = Kx·L / rx<span class="kolom-2"></span>'
    KLr_y', 弱軸長細比 (KL/r)y = Ky·L / ry<span class="kolom-2"></span>'
    KLr_max', 控制長細比 KL/r = max((KL/r)x, (KL/r)y)<span class="kolom-2"></span>'
    lambda_c', 柱挫屈參數 λc = (KL/πr)·√(Fy/E)（式 6.2-2）<span class="kolom-2"></span>'
    F_cr to MPa', 標稱臨界壓應力 Fcr（式 6.2-3／6.2-4，依 λc ≤ 1.5 分段）<span class="kolom-2"></span>'
    phiP_n', 設計軸壓強度 ϕc·Pn（ϕc = 0.85）<span class="kolom-2"></span>'
    UC_P = P_u / phiP_n', 軸壓檢核比 UC_P = Pu / (ϕc·Pn)<span class="kolom-2"></span>'
    '柱軸壓檢核：UC = <b>'ru(UC_P)'</b> <b>'oordeel(UC_P)'</b>（'P_u' ≤ 'phiP_n'）<span class="alleen-scherm"></span>

    # 5. 梁柱互制檢核（steel99 第 8 章 LRFD）

    #hide
    # 強軸彎矩容量（7.2.2／7.2.3）
    Zx_c = Z_x / (1 cm^3)
    Sx_c = W_x / (1 cm^3)
    Zy_c = Z_y / (1 cm^3)
    Sy_c = W_y / (1 cm^3)
    Iy_c = I_y / (1 cm^4)
    ry_c = i_y / (1 cm)
    J_c = J / (1 cm^4)
    Cw_c = C_w / (1 cm^6)

    Mp_t = Fy_t * Zx_c
    Mr_t = FL_t * Sx_c
    Lp_c = 80 * ry_c / sqrt(Fy_t)
    X_1 = (pi / Sx_c) * sqrt(E_t * G_t * J_c * Ac / 2)
    X_2 = 4 * (Cw_c / Iy_c) * (Sx_c / (G_t * J_c))^2
    Lr_c = ry_c * X_1 / FL_t * sqrt(1 + sqrt(1 + X_2 * FL_t^2))

    L_p = Lp_c * cm to m
    L_r = Lr_c * cm to m

    Lb_c = max(L_b / (1 cm); 1)
    is_zone1 = bool(Lb_c ≤ Lp_c)
    is_zone2 = bool(Lb_c > Lp_c) * bool(Lb_c ≤ Lr_c)

    Mn2_t = min(Mp_t; C_b * (Mp_t - (Mp_t - Mr_t) * (Lb_c - Lp_c) / max(Lr_c - Lp_c; 0.001)))
    Mcr_t = (C_b * pi / Lb_c) * sqrt(E_t * Iy_c * G_t * J_c + (pi * E_t / Lb_c)^2 * Iy_c * Cw_c)
    Mn3_t = min(Mp_t; Mcr_t)
    Mnx_t = if(is_zone1 ≡ 1; Mp_t; if(is_zone2 ≡ 1; Mn2_t; Mn3_t))
    Mn_x = Mnx_t * (0.0980665 kN*m)
    phiM_nx = 0.90 * Mn_x

    # 弱軸彎矩容量（式 7.2-4，已驗證公式 steel99_solid_weak_axis_Mn）
    Mny_t = min(Fy_t * Zy_c; 1.5 * Fy_t * Sy_c)
    Mn_y = Mny_t * (0.0980665 kN*m)
    phiM_ny = 0.90 * Mn_y

    ratio_p = P_u / max(phiP_n; 0.001 kN)
    term_m = (M_ux / max(phiM_nx; 0.001 kN*m) + M_uy / max(phiM_ny; 0.001 kN*m))
    UC_col = if(ratio_p ≥ 0.2; ratio_p + (8/9) * term_m; ratio_p / 2 + term_m)
    #show

    L_p', 塑性彎矩未支撐長度限值 Lp = 80·ry/√Fy（7.2.2）<span class="kolom-2"></span>'
    L_r', 扭轉挫屈極限未支撐長度 Lr（7.2.2）<span class="kolom-2"></span>'
    #if is_zone1 ≡ 1
        '強軸側向支撐區段：<b>Lb ≤ Lp</b>，Mn = Mp，無側向扭轉挫屈。<span class="alleen-scherm"></span>
    #else if is_zone2 ≡ 1
        '強軸側向支撐區段：<b>Lp < Lb ≤ Lr</b>，非彈性側向扭轉挫屈（7.2.3）。<span class="alleen-scherm"></span>
    #else
        '強軸側向支撐區段：<b>Lb > Lr</b>，彈性側向扭轉挫屈，Mn = Mcr ≤ Mp（7.2.3）。<span class="alleen-scherm"></span>
    #end if
    phiM_nx', 強軸設計抗彎強度 ϕb·Mnx（ϕb = 0.90）<span class="kolom-2"></span>'
    phiM_ny', 弱軸設計抗彎強度 ϕb·Mny = ϕb·min(Zy·Fy, 1.5·Sy·Fy)（式 7.2-4）<span class="kolom-2"></span>'
    UC_col', 梁柱互制比（式 8.2-1a／8.2-1b，Pu/(ϕPn) = 'ru(ratio_p)'）<span class="kolom-2"></span>'
    '梁柱互制檢核：UC = <b>'ru(UC_col)'</b> <b>'oordeel(UC_col)'</b>（式 8.2-1a／1b ≤ 1.0）<span class="alleen-scherm"></span>

    # 6. 柱腳基板混凝土承壓檢核（steel99 §10.9 LRFD）

    #hide
    A1 = B_p * N_p
    A2 = min(B_ped * N_ped; 4 * A1)
    ratio_A = min(sqrt(A2 / A1); 2.0)
    A1_cm2 = A1 / (1 cm^2)
    Pp_kgf = 0.60 * 0.85 * fc_kgf * A1_cm2 * ratio_A
    phiP_p = Pp_kgf * (0.00980665 kN)
    UC_bearing = P_u / max(phiP_p; 0.001 kN)

    # 接觸壓力分佈（全板線性雙向彎曲疊加）
    S_px = B_p * N_p^2 / 6
    S_py = N_p * B_p^2 / 6
    q_mean = P_u / (B_p * N_p) to MPa
    q_mom_x = abs(M_ux) / S_px to MPa
    q_mom_y = abs(M_uy) / S_py to MPa
    q_max = q_mean + q_mom_x + q_mom_y
    q_min = q_mean - q_mom_x - q_mom_y
    is_uplift = bool(q_min < 0 MPa)
    #show

    A1 to cm^2', 基板承壓面積 A1 = Bp·Np<span class="kolom-2"></span>'
    A2 to cm^2', 墩座頂面同心最大面積 A2（受 A2/A1 ≤ 4 限制）<span class="kolom-2"></span>'
    ratio_A', 承壓圍束放大係數 √(A2/A1) ≤ 2.0（式 10.9-2）<span class="kolom-2"></span>'
    phiP_p', 混凝土設計承壓強度 ϕc·Pp = 0.60·0.85·f'c·A1·√(A2/A1)<span class="kolom-2"></span>'
    UC_bearing = P_u / phiP_p', 混凝土承壓檢核比 UC_bearing = Pu / (ϕc·Pp)<span class="kolom-2"></span>'
    q_max', 基板角隅最大接觸壓力 q_max = P/A + |Mx|/Sx + |My|/Sy<span class="kolom-2"></span>'
    q_min', 基板角隅最小接觸壓力 q_min = P/A − |Mx|/Sx − |My|/Sy（小於 0 顯示柱腳受拉揚起）<span class="kolom-2"></span>'
    '混凝土承壓檢核：UC = <b>'ru(UC_bearing)'</b> <b>'oordeel(UC_bearing)'</b>（'P_u' ≤ 'phiP_p'）<span class="alleen-scherm"></span>

    # 7. 基板厚度檢核（AISC DG1 簡化懸臂法，工程常規）

    #hide
    # 翼板外伸懸臂（抵抗強軸彎矩 Mx，壓力沿 Np 方向）
    l_flange = max(N_p - h; 0 mm) / 2
    q_cant_y = q_mean + q_mom_x
    m_cant_y = q_cant_y * l_flange^2 / 2

    # 腹板外伸懸臂（抵抗弱軸彎矩 My，壓力沿 Bp 方向）
    l_web = max(B_p - b; 0 mm) / 2
    q_cant_x = q_mean + q_mom_y
    m_cant_x = q_cant_x * l_web^2 / 2

    l_cant = max(l_flange; l_web)
    m_pl = max(m_cant_y; m_cant_x)
    tp_req = sqrt(6 * m_pl / (0.90 * f_y_bp)) to mm
    UC_tp = tp_req / max(t_p; 0.1 mm)
    #show

    l_flange', 翼板外伸懸臂長度 l_y = (Np − d)/2<span class="kolom-2"></span>'
    l_web', 腹板外伸懸臂長度 l_x = (Bp − b)/2<span class="kolom-2"></span>'
    l_cant', 控制懸臂長度 l = max(l_x, l_y)<span class="kolom-2"></span>'
    m_pl', 控制懸臂根部單位寬度彎矩 m = max(m_x, m_y)<span class="kolom-2"></span>'
    tp_req', 依懸臂法所需基板厚度 tp,req = √(6m / (0.90·Fy_bp))<span class="kolom-2"></span>'
    t_p', 實際配置基板厚度 tp<span class="kolom-2"></span>'
    UC_tp = tp_req / t_p', 基板厚度檢核比 UC_tp = tp,req / tp<span class="kolom-2"></span>'
    '基板厚度檢核（AISC DG1 懸臂法）：UC = <b>'ru(UC_tp)'</b> <b>'oordeel(UC_tp)'</b>（'t_p' ≥ 'tp_req'）<span class="alleen-scherm"></span>

    # 8. 錨栓鋼材拉力檢核（彈性錨栓群法，steel99 10.3、表 10.3-2）

    #hide
    T_bolt_raw = M_ux / (2 * b_y) + M_uy / (2 * b_x) - P_u / 4 to kN
    T_bolt = max(T_bolt_raw; 0 kN)
    Ab = pi * d_b^2 / 4 to cm^2
    Ab_c = Ab / (1 cm^2)
    Fnt = if(anchor_grade ≡ 1; 3.15; if(anchor_grade ≡ 2; 7.50; 0.75 * 4.0788))
    phiRn_t = 0.75 * Fnt * Ab_c * (9.80665 kN)
    UC_anchor_t = T_bolt / max(phiRn_t; 0.001 kN)
    #show

    Ab', 單支錨栓公稱斷面積 Ab = π·db²/4<span class="kolom-2"></span>'
    T_bolt', 彈性錨栓群法單支最大拉力 T_bolt = max(Mx/2by + My/2bx − Pu/4, 0)<span class="kolom-2"></span>'
    phiRn_t', 錨栓鋼材設計拉力強度 ϕRn = 0.75·Fnt·Ab（表 10.3-2）<span class="kolom-2"></span>'
    UC_anchor_t = T_bolt / phiRn_t', 錨栓拉力檢核比 UC_anchor_t = T_bolt / ϕRn<span class="kolom-2"></span>'
    '錨栓鋼材拉力檢核：UC = <b>'ru(UC_anchor_t)'</b> <b>'oordeel(UC_anchor_t)'</b>（'T_bolt' ≤ 'phiRn_t'）<span class="alleen-scherm"></span>

    # 9. 混凝土錐體抗拉拔檢核（steel99 §10.10.2 解說 45° 應力錐）

    #hide
    T_group = 2 * T_bolt
    bx_c = b_x / (1 mm)
    hef_c = h_ef / (1 mm)
    theta_c = acos(min(bx_c / (2 * hef_c); 1.0))
    Acn_mm2 = if(b_x ≥ 2 * h_ef; 2 * pi * hef_c^2; (2 * pi - 2 * theta_c + sin(2 * theta_c)) * hef_c^2)
    Acn_cm2 = Acn_mm2 / 100
    A_cone = Acn_cm2 * cm^2
    Tc_kgf = 1.06 * sqrt(fc_kgf) * Acn_cm2
    phiTc = 0.75 * Tc_kgf * (0.00980665 kN)
    UC_cone = T_group / max(phiTc; 0.001 kN)
    #show

    T_group', 拉力側 2 支錨栓總拉力需求 T_group = 2·T_bolt<span class="kolom-2"></span>'
    A_cone to cm^2', 45° 應力錐群組聯集有效投影面積 Acn（計入間距重疊扣除）<span class="kolom-2"></span>'
    phiTc', 混凝土應力錐設計抗拉拔強度 ϕTc = 0.75·(1.06√f'c)·Acn<span class="kolom-2"></span>'
    UC_cone = T_group / phiTc', 混凝土錐體拉拔檢核比 UC_cone = T_group / ϕTc<span class="kolom-2"></span>'
    '混凝土錐體抗拉拔檢核：UC = <b>'ru(UC_cone)'</b> <b>'oordeel(UC_cone)'</b>（'T_group' ≤ 'phiTc'）<span class="alleen-scherm"></span>

    # 10. 柱腳水平剪力與拉剪互制檢核（§10.10.2、表 10.3-2、表 10.3-3）

    #hide
    phiVn_fric = if(P_u > 0 kN; 0.75 * 0.9 * P_u; 0 kN)
    Fnv = if(anchor_grade ≡ 1; 1.68; if(anchor_grade ≡ 2; 4.00; 0.40 * 4.0788))
    phiVn_bolt = 4 * 0.75 * Fnv * Ab_c * (9.80665 kN)
    phiV_n = if(shear_mode ≡ 1; phiVn_fric; phiVn_bolt)
    UC_V = V_u / max(phiV_n; 0.001 kN)

    # 錨栓單支剪力與橢圓互制
    V_bolt = V_u / 4
    phiRn_v = 0.75 * Fnv * Ab_c * (9.80665 kN)
    UC_inter = if(shear_mode ≡ 2; sqrt((T_bolt / max(phiRn_t; 0.001 kN))^2 + (V_bolt / max(phiRn_v; 0.001 kN))^2); 0)
    #show

    phiV_n', 柱腳水平剪力設計容量 ϕVn（'if(shear_mode ≡ 1; "接觸面摩擦力 μ=0.9"; "4 支錨栓承壓直接抗剪")'）<span class="kolom-2"></span>'
    UC_V = V_u / phiV_n', 水平剪力檢核比 UC_V = Vu / ϕVn<span class="kolom-2"></span>'
    '水平剪力檢核：UC = <b>'ru(UC_V)'</b> <b>'oordeel(UC_V)'</b>（'V_u' ≤ 'phiV_n'）<span class="alleen-scherm"></span>

    #if shear_mode ≡ 2
        UC_inter', 錨栓拉剪複合橢圓互制比 √((T/ϕRn,t)² + (V/ϕRn,v)²)<span class="kolom-2"></span>'
        '錨栓拉剪互制檢核：UC = <b>'ru(UC_inter)'</b> <b>'oordeel(UC_inter)'</b>（橢圓互制 ≤ 1.0）<span class="alleen-scherm"></span>
    #end if

    # 11. 檢核彙整與控制 UC

    #hide
    UC_load = max(UC_P; max(UC_col; max(UC_bearing; max(UC_tp; max(UC_anchor_t; max(UC_cone; max(UC_V; UC_inter)))))))
    UC_max_raw = if(bool(is_nonslender ≡ 1)*bool(ok_klr); UC_load; max(UC_load; 1.05))
    UC_max = ru(UC_max_raw)
    ok_all = bool(is_nonslender ≡ 1) * bool(ok_klr) * bool(UC_load ≤ 1.0)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">需求值 / 計算值</th><th style="text-align:right; padding:2px 8px;">設計限值</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">翼板寬厚比非細長限值 (λf ≤ λr)</td><td style="padding:2px 8px;">steel99 表 4.5-1</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_f)'</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_rf)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_lambda_f)'">'ru(UC_lambda_f)'</td><td style="padding:2px 8px; color:'kleur(UC_lambda_f)'">'oordeel(UC_lambda_f)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">腹板深厚比非細長限值 (λw ≤ λr)</td><td style="padding:2px 8px;">steel99 表 4.5-1</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_w)'</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_rw)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_lambda_w)'">'ru(UC_lambda_w)'</td><td style="padding:2px 8px; color:'kleur(UC_lambda_w)'">'oordeel(UC_lambda_w)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱長細比限值 (KL/r ≤ 200)</td><td style="padding:2px 8px;">steel99 §4.4</td><td style="padding:2px 8px; text-align:right;">'ru(KLr_max)'</td><td style="padding:2px 8px; text-align:right;">200</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_klr)'">'ru(UC_klr)'</td><td style="padding:2px 8px; color:'kleur(UC_klr)'">'oordeel(UC_klr)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱軸壓強度 (Pu ≤ ϕc·Pn)</td><td style="padding:2px 8px;">steel99 第 6 章</td><td style="padding:2px 8px; text-align:right;">'P_u'</td><td style="padding:2px 8px; text-align:right;">'phiP_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_P)'">'ru(UC_P)'</td><td style="padding:2px 8px; color:'kleur(UC_P)'">'oordeel(UC_P)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">梁柱構材互制 (式 8.2-1a／1b)</td><td style="padding:2px 8px;">steel99 §8.2</td><td style="padding:2px 8px; text-align:right;">'ru(UC_col)'</td><td style="padding:2px 8px; text-align:right;">1.00</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_col)'">'ru(UC_col)'</td><td style="padding:2px 8px; color:'kleur(UC_col)'">'oordeel(UC_col)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱腳混凝土承壓 (Pu ≤ ϕc·Pp)</td><td style="padding:2px 8px;">steel99 §10.9</td><td style="padding:2px 8px; text-align:right;">'P_u'</td><td style="padding:2px 8px; text-align:right;">'phiP_p'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_bearing)'">'ru(UC_bearing)'</td><td style="padding:2px 8px; color:'kleur(UC_bearing)'">'oordeel(UC_bearing)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">基板厚度懸臂法 (tp ≥ tp,req)</td><td style="padding:2px 8px;">AISC DG1 懸臂法</td><td style="padding:2px 8px; text-align:right;">'tp_req'</td><td style="padding:2px 8px; text-align:right;">'t_p'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_tp)'">'ru(UC_tp)'</td><td style="padding:2px 8px; color:'kleur(UC_tp)'">'oordeel(UC_tp)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">錨栓鋼材拉力 (T_bolt ≤ ϕRn)</td><td style="padding:2px 8px;">steel99 表 10.3-2</td><td style="padding:2px 8px; text-align:right;">'T_bolt'</td><td style="padding:2px 8px; text-align:right;">'phiRn_t'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_anchor_t)'">'ru(UC_anchor_t)'</td><td style="padding:2px 8px; color:'kleur(UC_anchor_t)'">'oordeel(UC_anchor_t)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">混凝土錐體抗拉拔 (T_group ≤ ϕTc)</td><td style="padding:2px 8px;">steel99 §10.10.2 解說</td><td style="padding:2px 8px; text-align:right;">'T_group'</td><td style="padding:2px 8px; text-align:right;">'phiTc'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_cone)'">'ru(UC_cone)'</td><td style="padding:2px 8px; color:'kleur(UC_cone)'">'oordeel(UC_cone)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">柱腳水平剪力 (Vu ≤ ϕVn)</td><td style="padding:2px 8px;">steel99 §10.10.2</td><td style="padding:2px 8px; text-align:right;">'V_u'</td><td style="padding:2px 8px; text-align:right;">'phiV_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_V)'">'ru(UC_V)'</td><td style="padding:2px 8px; color:'kleur(UC_V)'">'oordeel(UC_V)'</td></tr>
    #if shear_mode ≡ 2
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">錨栓拉剪複合互制</td><td style="padding:2px 8px;">steel99 表 10.3-3 橢圓</td><td style="padding:2px 8px; text-align:right;">'ru(UC_inter)'</td><td style="padding:2px 8px; text-align:right;">1.00</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_inter)'">'ru(UC_inter)'</td><td style="padding:2px 8px; color:'kleur(UC_inter)'">'oordeel(UC_inter)'</td></tr>
    #end if
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>鋼柱與柱腳檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>鋼柱與柱腳檢核不合格</b>
    #end if
    #else
    # 4. 鋼柱長細比與容許壓應力（steel99 第（一）篇 6.3，ASD）

    #hide
    KLr_x = (K_x * L_col) / i_x
    KLr_y = (K_y * L_col) / i_y
    KLr_max = max(KLr_x; KLr_y)
    UC_klr = KLr_max / 200
    ok_klr = bool(KLr_max ≤ 200)
    C_c = sqrt(2 * pi^2 * E_t / Fy_t)
    rat_c = KLr_max / C_c
    Fa_t = if(KLr_max < C_c; (1 - KLr_max^2 / (2 * C_c^2)) * Fy_t / (5/3 + 3/8 * rat_c - 1/8 * rat_c^3); 12 * pi^2 * E_t / (23 * KLr_max^2))
    F_a = Fa_t * tf_cm2
    f_a = P_u / A to MPa
    P_allow = Fa_t * (A / (1 cm^2)) * (9.80665 kN)
    UC_P = f_a / F_a
    UC_load = UC_P
    UC_max_raw = if(bool(is_nonslender ≡ 1)*bool(ok_klr); UC_load; max(UC_load; 1.05))
    UC_max = ru(UC_max_raw)
    ok_all = bool(is_nonslender ≡ 1) * bool(ok_klr) * bool(UC_load ≤ 1.0)
    #show

    KLr_x', 強軸長細比 (KL/r)x = Kx·L / rx<span class="kolom-2"></span>'
    KLr_y', 弱軸長細比 (KL/r)y = Ky·L / ry<span class="kolom-2"></span>'
    KLr_max', 控制長細比 KL/r（≤ 200，§4.4）<span class="kolom-2"></span>'
    C_c', 彈性與非彈性挫屈分界長細比 Cc = √(2π²E/Fy)（6.3）<span class="kolom-2"></span>'
    F_a', 容許壓應力 Fa（式 6.3-1／6.3-2，依 KL/r 與 Cc 分段）<span class="kolom-2"></span>'
    f_a', 計算軸壓應力 fa = P / A<span class="kolom-2"></span>'
    P_allow', 容許軸壓力 Pallow = Fa·A<span class="kolom-2"></span>'
    UC_P = f_a / F_a', 軸壓應力檢核比 UC_P = fa / Fa<span class="kolom-2"></span>'
    '柱軸壓檢核（ASD）：UC = <b>'ru(UC_P)'</b> <b>'oordeel(UC_P)'</b>（'f_a' ≤ 'F_a'）<span class="alleen-scherm"></span>
    '柱腳（混凝土承壓、基板、錨栓）為 LRFD 專屬檢核，ASD 下未檢核，須另行設計。<span class="alleen-scherm"></span>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>鋼柱構材檢核合格（ASD；柱腳未檢核）</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>鋼柱構材檢核不合格（ASD）</b>
    #end if
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。鋼材降伏強度、混凝土抗壓強度、柱長細比、基板尺寸或錨栓配置無效或超出範圍；ASD 僅支援純軸壓（Mx = My = 0，ASD 互制式未入已驗證庫）。
#end if
`;
