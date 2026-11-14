/**
 * 鋼結構熱軋 H 型鋼梁設計與檢核 — 依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版，steel99）
 * 第（二）篇鋼結構極限設計法（LRFD）。
 *
 * 規範條文與來源（A 級：已驗證庫；本檔數值常數逐項可追溯）：
 * 1. 材料常數（steel99 1.7）：E = 2040 tf/cm²、G = 810 tf/cm²；以 1 tf/cm² = 98.0665 MPa 換算為 SI。
 *    熱軋型鋼殘留應力 Fr = 0.7 tf/cm²（表 4.5-1 註 [b]）；FL = Fy − Fr。
 *    Fy 由使用者依 CNS 鋼種與板厚之規定值輸入（規範未列各鋼種 Fy 表，故不內建下拉；範圍 2.0～4.55 tf/cm²）。
 * 2. 局部挫屈／斷面分類（表 4.5-1，已驗證表 steel99_wide_thickness_T451，Fy：tf/cm²）：
 *    熱軋 I 梁翼板 b/t：λp = 17/√Fy、λr = 37/√(Fy−Fr)；受撓曲腹板 h/tw：λp = 170/√Fy、λr = 260/√Fy。
 *    本模組僅處理結實斷面（λ ≤ λp）；半結實與細長肢材須依附錄 3，超限一律判為不合格，不得誤判合格。
 * 3. 側向扭轉挫屈與撓曲強度（7.2.2、7.2.3；已驗證公式 steel99_Lp_I、steel99_Lr_I、steel99_Mn_lateral、steel99_Cb）：
 *    Mp = Fy·Zx、Mr = FL·Sx；Lp = 80·ry/√Fyf；Lr = ry·X1/FL·√(1+√(1+X2·FL²))，
 *    X1 = π/Sx·√(EGJA/2)、X2 = 4·(Cw/Iy)·(Sx/GJ)²；
 *    Lb ≤ Lp：Mn = Mp；Lp < Lb ≤ Lr：Mn = Cb[Mp − (Mp − Mr)(Lb − Lp)/(Lr − Lp)] ≤ Mp；
 *    Lb > Lr：Mn = Mcr = Cb·π/Lb·√(E·Iy·G·J + (πE/Lb)²·Iy·Cw) ≤ Mp。設計強度 ϕb·Mn，ϕb = 0.90。
 * 4. 剪力（7.3.1、7.3.2）：Aw = d·tw；ϕv = 0.90；kv = 5（未加勁）；
 *    h/tw ≤ 50√(kv/Fyw)：Vn = 0.6·Fyw·Aw（7.3-1）；
 *    50√(kv/Fyw) < h/tw ≤ 62√(kv/Fyw)：Vn = 0.6·Fyw·Aw·50√(kv/Fyw)/(h/tw)（7.3-2）；
 *    62√(kv/Fyw) < h/tw ≤ 260：Vn = 1860·kv·Aw/(h/tw)²（7.3-3）。
 * 5. 服務載重撓度：簡支均布活載重 Δ = 5wL⁴/(384EIx) ≤ L/n_delta（撓度比由使用者設定，非規範取值）。
 *
 * 斷面性質（h、b、tw、tf、A、Ix、Wx、Zx、ix、Iy、Wy、Zy、iy、單位質量）取自 components/calc/twProfielen.ts（CNS 1490）。
 * 扭曲常數 J 與翹曲常數 Cw 不在該表內，改由幾何以薄壁開口斷面閉合式推算（J 略去角隅圓角，偏安全；
 * Cw = tf·b³·(h−tf)²/24），並在 scripts/check-tw-steel-beam.mjs 以獨立程式核對。
 * 腹板淨高 hw 取 h − 2tf（略去角隅半徑，使 h/tw 偏大，偏安全）。
 *
 * 6. 容許應力設計法（ASD，第（一）篇；選單 design_method = 2）：
 *    Lb ≤ Lc：Fb = 0.66Fy（7.2.1，已驗證 steel99_Fb_compact），限結實斷面；
 *    Lc = min(20·bf/√Fy, 1400/((d/Af)·Fy))（cm，已驗證 steel99_Lc）。
 *    Lb > Lc（7.2.3，已驗證 steel99_Fb_ltb_asd_723）：拉力外緣 0.60Fy（式 7.2-5）；壓力外緣
 *    L/rT ≤ √(35800Cb/Fy)：Fb1 = [2/3 − Fy(L/rT)²/(107600Cb)]Fy（式 7.2-6），否則 Fb1 = 12000Cb/(L/rT)²（式 7.2-7）；
 *    Fb3 = 840Cb/(Ld/Af)（式 7.2-8，熱軋 H 壓力翼板為實心矩形且等於拉力翼板，適用）；Fb = min(max(Fb1, Fb3), 0.6Fy)。
 *    rT：壓力翼板加 1/3 受壓腹板（hw·tw/6）對腹板軸之迴轉半徑，由名義尺寸推算（略去圓角）。雙對稱斷面 fb 兩外緣相同，
 *    壓力外緣 Fb ≤ 0.6Fy 控制。
 *    Fv（7.5，已驗證 steel99_web_shear_Fv_75）：(h/tw)√Fy ≤ 100 時 Fv = 0.40Fy、Aw = d·tw；
 *    否則 Fv = Fy·Cv/2.89 ≤ 0.40Fy、Aw = h·tw，未加勁 Kv = 5.34（a/h → ∞）。
 *    需求以服務載重組合（2.2，已驗證 steel99_load_combos_ASD）輸入；fb = M/Sx、fv = V/Aw。
 *
 * 結尾行：「控制 UC = … → 鋼梁檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twSteelBeam = `"鋼結構熱軋 H 型鋼梁設計與檢核（steel99 LRFD／ASD）

'<i>依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版）第（二）篇極限設計法（LRFD）或第（一）篇容許應力設計法（ASD）進行受強軸彎曲與剪力之熱軋 H 型鋼梁局部挫屈、側向扭轉挫屈（LTB）、剪力強度與服務載重撓度檢核。ASD 僅適用結實斷面：Lb ≤ Lc 取 Fb = 0.66Fy（7.2.1），Lb > Lc 依 7.2.3 式 7.2-6～7.2-8。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

# 1. 設計條件與鋼材性質

@select design_method "設計法（全案擇一，不可混用）"
  極限設計法 LRFD（steel99 第（二）篇） = 1
  容許應力設計法 ASD（steel99 第（一）篇） = 2
@end

'<h6>鋼材規定降伏強度</h6>
f_y_in = ?{325}*(MPa)', 鋼材標稱降伏強度 Fy（依鋼種與板厚取 CNS 規定值或鋼廠證明書，例：SN490B 板厚 12～40 mm 取 325 MPa）<span class="kolom-3"></span>'

#hide
tf_cm2 = 98.0665 MPa
E_s = 2040 * tf_cm2
G_s = 810 * tf_cm2
F_r = 0.7 * tf_cm2
f_y = f_y_in
Fy_t = f_y / tf_cm2
FL_t = Fy_t - 0.7
F_L = FL_t * tf_cm2
ok_fy = bool(Fy_t ≥ 2.0) * bool(Fy_t ≤ 4.55)
#show

f_y', 鋼材標稱降伏強度 Fy<span class="kolom-2"></span>'
E_s', 鋼材彈性模數 E = 2040 tf/cm²（steel99 1.7）<span class="kolom-2"></span>'
G_s', 鋼材剪力彈性模數 G = 810 tf/cm²（steel99 1.7）<span class="kolom-2"></span>'
F_L', 側向扭轉挫屈有效應力 FL = Fy − Fr（熱軋型鋼殘留應力 Fr = 0.7 tf/cm²，表 4.5-1 註）<span class="kolom-2"></span>'

'<h6>梁跨度與側向支撐條件</h6>
L_span = ?{6.0}*(m)', 鋼梁跨度 L<span class="kolom-3"></span>'
L_b = ?{3.0}*(m)', 受壓翼板側向無支撐長度 Lb<span class="kolom-3"></span>'
C_b = ?{1.0}', 側向扭轉挫屈彎矩梯度修正因數 Cb（均勻彎矩取 1.0，上限 2.3，依 7.2.2 計算後填入）<span class="kolom-3"></span>'
n_delta = ?{360}', 服務載重容許活載撓度比限值分母 n_delta（L/360）<span class="kolom-3"></span>'

'<h6>設計載重（LRFD 取因數化載重；ASD 取服務載重組合，steel99 2.2）</h6>
M_u = ?{220}*(kN*m)', 設計彎矩需求 Mu（ASD 時為服務載重彎矩 M）<span class="kolom-3"></span>'
V_u = ?{150}*(kN)', 設計剪力需求 Vu（ASD 時為服務載重剪力 V）<span class="kolom-3"></span>'
w_L = ?{15}*(kN/m)', 服務載重均布活載重 wL（供撓度檢核）<span class="kolom-3"></span>'

# 2. 熱軋 H 型鋼斷面選取與幾何力學性質

@select section_id "CNS 1490 熱軋 H 型鋼規格"
  RH 400x200x8x13 (h=400, b=200, tw=8, tf=13 mm, W=65.4 kg/m) = 14
  RH 200x100x5.5x8 (h=200, b=100, tw=5.5, tf=8 mm, W=20.9 kg/m) = 10
  RH 250x125x6x9 (h=250, b=125, tw=6, tf=9 mm, W=29.0 kg/m) = 11
  RH 300x150x6.5x9 (h=300, b=150, tw=6.5, tf=9 mm, W=36.7 kg/m) = 12
  RH 350x175x7x11 (h=350, b=175, tw=7, tf=11 mm, W=49.4 kg/m) = 13
  RH 450x200x9x14 (h=450, b=200, tw=9, tf=14 mm, W=74.9 kg/m) = 15
  RH 500x200x10x16 (h=500, b=200, tw=10, tf=16 mm, W=88.2 kg/m) = 16
  RH 600x200x11x17 (h=600, b=200, tw=11, tf=17 mm, W=103.0 kg/m) = 17
  RH 700x300x13x24 (h=700, b=300, tw=13, tf=24 mm, W=182.0 kg/m) = 18
  RH 800x300x14x26 (h=800, b=300, tw=14, tf=26 mm, W=207.0 kg/m) = 19
  RH 900x300x16x28 (h=900, b=300, tw=16, tf=28 mm, W=243.0 kg/m) = 20
  RH 200x200x8x12 (h=200, b=200, tw=8, tf=12 mm, W=49.9 kg/m) = 5
  RH 250x250x9x14 (h=250, b=250, tw=9, tf=14 mm, W=71.8 kg/m) = 6
  RH 300x300x10x15 (h=300, b=300, tw=10, tf=15 mm, W=93.0 kg/m) = 7
  RH 350x350x12x19 (h=350, b=350, tw=12, tf=19 mm, W=135.0 kg/m) = 8
  RH 400x400x13x21 (h=400, b=400, tw=13, tf=21 mm, W=171.7 kg/m) = 9
@end

#hide
sec_id = max(min(round(section_id); 20); 1)
'台灣常用H型鋼斷面表（CNS 1490）: id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)
tw_h_sections = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12; 13; 14; 15; 16; 17; 18; 19; 20 |100; 125; 150; 175; 200; 250; 300; 350; 400; 200; 250; 300; 350; 400; 450; 500; 600; 700; 800; 900 |100; 125; 150; 175; 200; 250; 300; 350; 400; 100; 125; 150; 175; 200; 200; 200; 200; 300; 300; 300 |6; 6.5; 7; 7.5; 8; 9; 10; 12; 13; 5.5; 6; 6.5; 7; 8; 9; 10; 11; 13; 14; 16 |8; 9; 10; 11; 12; 14; 15; 19; 21; 8; 9; 9; 11; 13; 14; 16; 17; 24; 26; 28 |21.59; 30; 39.65; 51.43; 63.53; 91.43; 118.45; 171.89; 218.69; 26.67; 36.97; 46.78; 62.91; 83.37; 95.43; 112.25; 131.71; 231.54; 263.5; 309.8 |378; 839; 1620; 2900; 4720; 10700; 20200; 39800; 66600; 1810; 3960; 7210; 13500; 23500; 32900; 46800; 75600; 197000; 286000; 411000 |75.6; 134; 216; 331; 472; 860; 1350; 2280; 3330; 181; 317; 481; 771; 1170; 1460; 1870; 2520; 5640; 7160; 9140 |86.4; 152; 243; 370; 525; 953; 1480; 2520; 3670; 205; 358; 542; 864; 1310; 1650; 2130; 2900; 6340; 8100; 10500 |4.18; 5.29; 6.4; 7.5; 8.62; 10.8; 13.1; 15.2; 17.5; 8.23; 10.4; 12.4; 14.6; 16.8; 18.6; 20.4; 24; 29.2; 33; 36.4 |134; 293; 563; 984; 1600; 3650; 6750; 13600; 22400; 134; 294; 508; 984; 1740; 1870; 2140; 2270; 10800; 11700; 12600 |26.7; 46.9; 75.1; 112; 160; 292; 450; 776; 1120; 26.7; 47; 67.7; 112; 174; 187; 214; 227; 721; 781; 843 |41; 71.7; 114; 172; 244; 443; 683; 1180; 1700; 41.6; 72.7; 105; 173; 267; 290; 333; 358; 1110; 1210; 1330 |2.49; 3.13; 3.77; 4.37; 5.02; 6.32; 7.55; 8.89; 10.1; 2.24; 2.82; 3.29; 3.96; 4.56; 4.43; 4.36; 4.16; 6.83; 6.67; 6.39 |16.9; 23.6; 31.1; 40.4; 49.9; 71.8; 93; 135; 171.7; 20.9; 29; 36.7; 49.4; 65.4; 74.9; 88.2; 103; 182; 207; 243]
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
ok_span = L_span > 0 m
ok_lb = bool(L_b ≥ 0 m) * bool(L_b ≤ L_span)
ok_cb = bool(C_b ≥ 1.0) * bool(C_b ≤ 2.3)
ok_htw = bool(h_w / t_w ≤ 260)
Lc_a = 20 * (bmm / 10) / sqrt(Fy_t)
Lc_b = 1400 / (((hmm / 10) / ((bmm / 10) * (tfmm / 10))) * Fy_t)
Lc_cm = min(Lc_a; Lc_b)
L_c = Lc_cm * cm to m
ok_meth = bool(design_method ≡ 1) + bool(design_method ≡ 2)
ok_geom = bool(ok_fy)*bool(ok_h)*bool(ok_b)*bool(ok_tw)*bool(ok_tf)*bool(ok_span)*bool(ok_lb)*bool(ok_cb)*bool(ok_htw)*bool(ok_meth)
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
J', 扭曲常數 J = (2·b·tf³ + hw·tw³)/3（薄壁開口斷面閉合式，略去角隅圓角，偏安全）<span class="kolom-2"></span>'
C_w', 翹曲常數 Cw = tf·b³·(h−tf)²/24（雙對稱 I 型薄壁閉合式）<span class="kolom-2"></span>'
w', 單位長度質量<span class="kolom-2"></span>'

#if ok_geom ≡ 1
    # 3. 斷面結實性檢核（局部挫屈，steel99 表 4.5-1）

    #hide
    lambda_f = b / (2 * t_f)
    lambda_pf = 17 / sqrt(Fy_t)
    lambda_rf = 37 / sqrt(FL_t)
    UC_lambda_f = lambda_f / lambda_pf
    is_flange_compact = bool(lambda_f ≤ lambda_pf)

    lambda_w = h_w / t_w
    lambda_pw = 170 / sqrt(Fy_t)
    lambda_rw = 260 / sqrt(Fy_t)
    UC_lambda_w = lambda_w / lambda_pw
    is_web_compact = bool(lambda_w ≤ lambda_pw)

    is_compact = bool(is_flange_compact) * bool(is_web_compact)
    #show

    lambda_f', 翼板寬厚比 λf = b / (2tf)<span class="kolom-2"></span>'
    lambda_pf', 翼板結實斷面限值 λp = 17/√Fy（表 4.5-1 熱軋 I 型梁翼板，Fy：tf/cm²）<span class="kolom-2"></span>'
    lambda_rf', 翼板半結實斷面限值 λr = 37/√(Fy−Fr)（表 4.5-1）<span class="kolom-2"></span>'
    UC_lambda_f', 翼板結實檢核比 λf / λp<span class="kolom-2"></span>'

    lambda_w', 腹板深厚比 λw = hw / tw（hw 略去角隅半徑，偏安全）<span class="kolom-2"></span>'
    lambda_pw', 腹板結實斷面限值 λp = 170/√Fy（表 4.5-1 受撓曲壓應力之腹板）<span class="kolom-2"></span>'
    lambda_rw', 腹板半結實斷面限值 λr = 260/√Fy（表 4.5-1）<span class="kolom-2"></span>'
    UC_lambda_w', 腹板結實檢核比 λw / λp<span class="kolom-2"></span>'
    is_compact', 斷面結實性（1: 結實斷面；0: 非結實斷面）<span class="kolom-2"></span>'

    #if is_compact ≡ 1
        '斷面分類判定：<b>結實斷面</b>，翼板與腹板均不超過 λp，可依 7.2.2／7.2.3 發展 Mp 及側向扭轉挫屈強度。<span class="alleen-scherm"></span>
    #else
        '斷面分類判定：<b>非結實斷面</b>，超出本模組適用範圍（半結實及細長肢材須依附錄 3 另行檢核），本檢核判為不合格。<span class="alleen-scherm"></span>
    #end if

    #if design_method ≡ 1
    # 4. 側向扭轉挫屈（LTB）與強軸抗彎強度檢核（steel99 7.2.2、7.2.3）

    #hide
    Sx_c = W_x / (1 cm^3)
    Zx_c = Z_x / (1 cm^3)
    Iy_c = I_y / (1 cm^4)
    ry_c = i_y / (1 cm)
    A_c = A / (1 cm^2)
    J_c = J / (1 cm^4)
    Cw_c = C_w / (1 cm^6)
    E_t = 2040
    G_t = 810

    Mp_t = Fy_t * Zx_c
    Mr_t = FL_t * Sx_c
    Lp_c = 80 * ry_c / sqrt(Fy_t)
    X_1 = (pi / Sx_c) * sqrt(E_t * G_t * J_c * A_c / 2)
    X_2 = 4 * (Cw_c / Iy_c) * (Sx_c / (G_t * J_c))^2
    Lr_c = ry_c * X_1 / FL_t * sqrt(1 + sqrt(1 + X_2 * FL_t^2))

    L_p = Lp_c * cm to m
    L_r = Lr_c * cm to m
    M_p = Mp_t * (0.0980665 kN*m)
    M_r = Mr_t * (0.0980665 kN*m)

    Lb_c = max(L_b / (1 cm); 1)
    is_zone1 = bool(Lb_c ≤ Lp_c)
    is_zone2 = bool(Lb_c > Lp_c) * bool(Lb_c ≤ Lr_c)

    Mn2_t = min(Mp_t; C_b * (Mp_t - (Mp_t - Mr_t) * (Lb_c - Lp_c) / max(Lr_c - Lp_c; 0.001)))
    Mcr_t = (C_b * pi / Lb_c) * sqrt(E_t * Iy_c * G_t * J_c + (pi * E_t / Lb_c)^2 * Iy_c * Cw_c)
    Mn3_t = min(Mp_t; Mcr_t)
    Mn_t = if(is_zone1 ≡ 1; Mp_t; if(is_zone2 ≡ 1; Mn2_t; Mn3_t))

    M_n = Mn_t * (0.0980665 kN*m)
    phi_b = 0.90
    phiM_n = phi_b * M_n
    UC_M = M_u / max(phiM_n; 0.001 kN*m)
    #show

    M_p', 塑性彎矩 Mp = Fy·Zx<span class="kolom-2"></span>'
    M_r', 降伏界限彎矩 Mr = FL·Sx<span class="kolom-2"></span>'
    L_p', 塑性側向無支撐長度界限 Lp = 80·ry/√Fyf（7.2.2，Fyf：tf/cm²）<span class="kolom-2"></span>'
    L_r', 側向扭轉挫屈界限長度 Lr = ry·X1/FL·√(1+√(1+X2·FL²))（7.2.2）<span class="kolom-2"></span>'
    L_b', 受壓翼板側向無支撐長度 Lb<span class="kolom-2"></span>'

    #if is_zone1 ≡ 1
        '側向支撐區段判定：<b>Lb ≤ Lp</b>，Mn = Mp，無側向扭轉挫屈。<span class="alleen-scherm"></span>
    #else if is_zone2 ≡ 1
        '側向支撐區段判定：<b>Lp < Lb ≤ Lr</b>，非彈性側向扭轉挫屈，Mn = Cb[Mp − (Mp − Mr)(Lb − Lp)/(Lr − Lp)] ≤ Mp。<span class="alleen-scherm"></span>
    #else
        '側向支撐區段判定：<b>Lb > Lr</b>，彈性側向扭轉挫屈，Mn = Mcr ≤ Mp（7.2.3）。<span class="alleen-scherm"></span>
    #end if

    M_n', 標稱抗彎強度 Mn<span class="kolom-2"></span>'
    phiM_n', 設計抗彎強度 ϕb·Mn（ϕb = 0.90）<span class="kolom-2"></span>'
    UC_M = M_u / phiM_n', 強軸抗彎強度檢核比 UC_M = Mu / (ϕb·Mn)<span class="kolom-2"></span>'
    '強軸彎矩檢核：UC = <b>'ru(UC_M)'</b> <b>'oordeel(UC_M)'</b>（'M_u' ≤ 'phiM_n'）<span class="alleen-scherm"></span>

    # 5. 強軸剪力強度檢核（steel99 7.3.1、7.3.2）

    #hide
    A_w = h * t_w to cm^2
    Aw_c = A_w / (1 cm^2)
    htw_ratio = h_w / t_w
    kv = 5
    lim_v1 = 50 * sqrt(kv / Fy_t)
    lim_v2 = 62 * sqrt(kv / Fy_t)
    Vn_t = if(htw_ratio ≤ lim_v1; 0.6 * Fy_t * Aw_c; if(htw_ratio ≤ lim_v2; 0.6 * Fy_t * Aw_c * lim_v1 / htw_ratio; 1860 * kv * Aw_c / htw_ratio^2))
    V_n = Vn_t * (9.80665 kN)
    phi_v = 0.90
    phiV_n = phi_v * V_n
    UC_V = V_u / max(phiV_n; 0.001 kN)
    #show

    A_w', 腹板面積 Aw = d·tw（7.3.1）<span class="kolom-2"></span>'
    htw_ratio', 腹板深厚比 h / tw（h 略去角隅半徑，偏安全）<span class="kolom-2"></span>'
    lim_v1', 剪力降伏控制限值 50√(kv/Fyw)，kv = 5（7.3.2）<span class="kolom-2"></span>'
    lim_v2', 非彈性剪力挫屈上限 62√(kv/Fyw)（7.3.2）<span class="kolom-2"></span>'
    V_n', 標稱剪力強度 Vn（式 7.3-1／7.3-2／7.3-3 依 h/tw 分段）<span class="kolom-2"></span>'
    phiV_n', 設計剪力強度 ϕv·Vn（ϕv = 0.90）<span class="kolom-2"></span>'
    UC_V = V_u / phiV_n', 強軸剪力強度檢核比 UC_V = Vu / (ϕv·Vn)<span class="kolom-2"></span>'
    '強軸剪力檢核：UC = <b>'ru(UC_V)'</b> <b>'oordeel(UC_V)'</b>（'V_u' ≤ 'phiV_n'）<span class="alleen-scherm"></span>

    #else
    # 4. 容許撓曲應力檢核（steel99 第（一）篇 7.2.1、7.2.3，ASD）

    #hide
    Sx_c = W_x / (1 cm^3)
    is_lc = bool(L_b ≤ L_c)
    Lb_cm = max(L_b / (1 cm); 1)
    Af_c = (bmm / 10) * (tfmm / 10)
    AwT_c = ((hmm - 2 * tfmm) / 10) * (twmm / 10) / 6
    IT_c = (tfmm / 10) * (bmm / 10)^3 / 12 + ((hmm - 2 * tfmm) / 60) * (twmm / 10)^3 / 12
    rT_c = sqrt(IT_c / (Af_c + AwT_c))
    r_T = rT_c * cm
    lr_T = Lb_cm / rT_c
    lim_T = sqrt(35800 * C_b / Fy_t)
    Fb1_t = if(lr_T ≤ lim_T; (2/3 - Fy_t * lr_T^2 / (107600 * C_b)) * Fy_t; 12000 * C_b / lr_T^2)
    Fb3_t = 840 * C_b * Af_c / (Lb_cm * (hmm / 10))
    Fbl_t = min(max(Fb1_t; Fb3_t); 0.6 * Fy_t)
    Fb_t = if(is_lc ≡ 1; 0.66 * Fy_t; Fbl_t)
    F_b1 = Fb1_t * tf_cm2
    F_b3 = Fb3_t * tf_cm2
    F_b = Fb_t * tf_cm2
    f_b = M_u / W_x to MPa
    phiM_n = Fb_t * Sx_c * (0.0980665 kN*m)
    UC_M = f_b / F_b
    #show

    L_c', 側向未支撐間距上限 Lc = min(20·bf/√Fy, 1400/((d/Af)·Fy))（7.2.1(3)，Lb ≤ Lc 方得 Fb = 0.66Fy）<span class="kolom-2"></span>'
    L_b', 受壓翼板側向無支撐長度 Lb<span class="kolom-2"></span>'
    #if is_lc ≡ 1
        '側向支撐判定：<b>Lb ≤ Lc</b>，結實斷面取 Fb = 0.66Fy（7.2.1）。<span class="alleen-scherm"></span>
        F_b', 容許撓曲應力 Fb = 0.66Fy（7.2.1，結實斷面）<span class="kolom-2"></span>'
    #else
        '側向支撐判定：<b>Lb > Lc</b>，依 7.2.3：拉力外緣 0.60Fy，壓力外緣取式 7.2-6／7.2-7 與 7.2-8 較大者且 ≤ 0.6Fy。<span class="alleen-scherm"></span>
        r_T', 壓力翼板加 1/3 受壓腹板對腹板軸之迴轉半徑 rT（名義尺寸，略去圓角）<span class="kolom-2"></span>'
        lr_T', 長細比 L/rT<span class="kolom-2"></span>'
        lim_T', 式 7.2-6／7.2-7 分界 √(35800·Cb/Fy)<span class="kolom-2"></span>'
        F_b1', 式 7.2-6（L/rT ≤ 分界）或式 7.2-7（L/rT > 分界）之 Fb1<span class="kolom-2"></span>'
        F_b3', 式 7.2-8 Fb3 = 840·Cb/(L·d/Af)<span class="kolom-2"></span>'
        F_b', 容許撓曲應力 Fb = min(max(Fb1, Fb3), 0.6Fy)（7.2.3）<span class="kolom-2"></span>'
    #end if
    f_b', 計算撓曲應力 fb = M / Sx<span class="kolom-2"></span>'
    phiM_n', 容許彎矩 Mallow = Fb·Sx<span class="kolom-2"></span>'
    UC_M = f_b / F_b', 撓曲應力檢核比 UC_M = fb / Fb<span class="kolom-2"></span>'
    '強軸撓曲應力檢核（ASD）：UC = <b>'ru(UC_M)'</b> <b>'oordeel(UC_M)'</b>（'f_b' ≤ 'F_b'）<span class="alleen-scherm"></span>

    # 5. 容許剪應力檢核（steel99 第（一）篇 7.5，ASD）

    #hide
    htw_ratio = h_w / t_w
    Kv_a = 5.34
    Cv_e = 3100 * Kv_a / (Fy_t * htw_ratio^2)
    Cv_a = if(Cv_e ≤ 0.8; Cv_e; 50 * sqrt(Kv_a / Fy_t) / htw_ratio)
    is_v1 = bool(htw_ratio * sqrt(Fy_t) ≤ 100)
    Fv_t = if(is_v1 ≡ 1; 0.40 * Fy_t; min(Fy_t * Cv_a / 2.89; 0.40 * Fy_t))
    F_v = Fv_t * tf_cm2
    A_w = if(is_v1 ≡ 1; h * t_w; h_w * t_w) to cm^2
    f_v = V_u / A_w to MPa
    phiV_n = Fv_t * (A_w / (1 cm^2)) * (9.80665 kN)
    UC_V = f_v / F_v
    #show

    htw_ratio', 腹板深厚比 h / tw（h 略去角隅半徑，偏安全）<span class="kolom-2"></span>'
    A_w', 受剪面積 Aw（(h/tw)√Fy ≤ 100 取 d·tw，否則取 h·tw；7.5）<span class="kolom-2"></span>'
    F_v', 容許剪應力 Fv（式 7.5-1／7.5-2，未加勁 Kv = 5.34）<span class="kolom-2"></span>'
    f_v', 計算剪應力 fv = V / Aw<span class="kolom-2"></span>'
    phiV_n', 容許剪力 Vallow = Fv·Aw<span class="kolom-2"></span>'
    UC_V = f_v / F_v', 剪應力檢核比 UC_V = fv / Fv<span class="kolom-2"></span>'
    '強軸剪應力檢核（ASD）：UC = <b>'ru(UC_V)'</b> <b>'oordeel(UC_V)'</b>（'f_v' ≤ 'F_v'）<span class="alleen-scherm"></span>

    #end if

    # 6. 服務載重撓度檢核

    #hide
    wL_n = w_L / (1 N/mm)
    L_n = L_span / (1 mm)
    Ix_n = I_x / (1 mm^4)
    En = E_s / (1 MPa)
    Delta_val = (5 * wL_n * L_n^4) / (384 * En * Ix_n)
    Delta = Delta_val * mm
    Delta_lim = (L_span to mm) / max(n_delta; 1)
    UC_delta = Delta / max(Delta_lim; 0.1 mm)
    #show

    Delta', 服務均布活載重簡支中央最大撓度 Δ = 5wL⁴/(384EIx)<span class="kolom-2"></span>'
    Delta_lim', 容許活載撓度限值 Δallow = L / 'n_delta'<span class="kolom-2"></span>'
    UC_delta = Delta / Delta_lim', 活載撓度檢核比 UC_delta = Δ / Δallow<span class="kolom-2"></span>'
    '活載撓度檢核：UC = <b>'ru(UC_delta)'</b> <b>'oordeel(UC_delta)'</b>（'Delta' ≤ 'Delta_lim'）<span class="alleen-scherm"></span>

    # 7. 檢核彙整與控制 UC

    #hide
    UC_load = max(UC_M; max(UC_V; UC_delta))
    UC_max_raw = if(is_compact ≡ 1; UC_load; max(UC_load; 1.05))
    UC_max = ru(UC_max_raw)
    ok_all = bool(is_compact ≡ 1) * bool(UC_load ≤ 1.0)
    #show

    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.2;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">檢核項目</th><th style="text-align:left; padding:2px 8px;">規範依據</th><th style="text-align:right; padding:2px 8px;">需求值 / 計算值</th><th style="text-align:right; padding:2px 8px;">設計限值</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">判定</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">翼板寬厚比結實限值 (λf ≤ λp)</td><td style="padding:2px 8px;">steel99 表 4.5-1</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_f)'</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_pf)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_lambda_f)'">'ru(UC_lambda_f)'</td><td style="padding:2px 8px; color:'kleur(UC_lambda_f)'">'oordeel(UC_lambda_f)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">腹板深厚比結實限值 (λw ≤ λp)</td><td style="padding:2px 8px;">steel99 表 4.5-1</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_w)'</td><td style="padding:2px 8px; text-align:right;">'ru(lambda_pw)'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_lambda_w)'">'ru(UC_lambda_w)'</td><td style="padding:2px 8px; color:'kleur(UC_lambda_w)'">'oordeel(UC_lambda_w)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">強軸撓曲 (需求 ≤ 設計／容許彎矩)</td><td style="padding:2px 8px;">steel99 7.2</td><td style="padding:2px 8px; text-align:right;">'M_u'</td><td style="padding:2px 8px; text-align:right;">'phiM_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_M)'">'ru(UC_M)'</td><td style="padding:2px 8px; color:'kleur(UC_M)'">'oordeel(UC_M)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">強軸剪力 (需求 ≤ 設計／容許剪力)</td><td style="padding:2px 8px;">steel99 7.3／7.5</td><td style="padding:2px 8px; text-align:right;">'V_u'</td><td style="padding:2px 8px; text-align:right;">'phiV_n'</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_V)'">'ru(UC_V)'</td><td style="padding:2px 8px; color:'kleur(UC_V)'">'oordeel(UC_V)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:2px 8px;">服務活載撓度 (Δ ≤ Δallow)</td><td style="padding:2px 8px;">使用者設定撓度比</td><td style="padding:2px 8px; text-align:right;">'ru(Delta)' mm</td><td style="padding:2px 8px; text-align:right;">'ru(Delta_lim)' mm</td><td style="padding:2px 8px; text-align:right; font-weight:700; color:'kleur(UC_delta)'">'ru(UC_delta)'</td><td style="padding:2px 8px; color:'kleur(UC_delta)'">'oordeel(UC_delta)'</td></tr>
    '</table>

    UC_max'<span class="alleen-afdruk"></span>'
    #if ok_all ≡ 1
        '<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>鋼梁檢核合格</b>
    #else
        '<b>控制 UC = 'UC_max'</b> > 1.0 → <b>鋼梁檢核不合格</b>
    #end if
#else
    '<b>總結：無效輸入，未檢核</b>。鋼材降伏強度、斷面幾何、跨度或側撐條件無效或超出範圍；ASD 與 LRFD 共用相同輸入範圍。
#end if
`;
