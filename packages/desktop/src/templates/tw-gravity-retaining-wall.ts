/**
 * 重力式擋土牆（無筋混凝土／砌石）穩定與牆體應力檢核（found112 / swc_tech / rc112）。
 *
 * 斷面：背面垂直、正面斜坡之梯形牆身，水平地表、Rankine 主動土壓力（牆背摩擦角 0）、地表均布超載。
 * 外在穩定（常時）：抗傾覆 FS ≥ 2.0、抗滑動 FS ≥ 1.5（不計被動土壓力）、合力偏心（土層 B/6、岩盤 B/4）、
 *   基底最大壓力 ≤ q_a（q_a 為已含安全係數 3 之容許承載力）— found112 7.4.1～7.4.3、swc_tech 第 120 條。
 * 牆身（取 y = H 與 y = H/2 兩斷面）：
 *   無筋混凝土：rc112 14.5，φ = 0.60（表 21.2.1(j)）；拉力面 σt ≤ φ·0.42λ√f'c（式 14.5.2.1a）、
 *   壓力面 σc ≤ φ·0.85f'c（式 14.5.2.1b）、剪力 Vu ≤ φ·0.11λ√f'c·b·h（表 14.5.5.1）。
 *   載重因數：土壓 1.6、牆重 0.9（有土壓）或 1.4（無土壓）。
 *   砌石：規範未收錄容許應力，由使用者輸入容許拉應力、壓應力與平均剪應力，採使用載重（因數 1.0）。
 * 有效高度 H ≤ 4 m（swc_tech 第 118 條，為原則）列為檢核項。
 */
export const twGravityRetainingWall = `"重力式擋土牆穩定與牆體應力檢核（無筋混凝土／砌石）

'<i>依據《建築物基礎構造設計規範》（112年6月20日版）7.3.2、7.4.1～7.4.3、《水土保持技術規範》（114年5月7日版）第 118、120 條及《建築物混凝土結構設計規範》（112年8月10日版）14.5，檢核背面垂直、正面斜坡之重力式擋土牆之抗傾覆、抗滑動、合力偏心、基底壓力與牆身拉壓剪應力。水平地表、Rankine 主動土壓力，不計被動土壓力。砌石牆之容許應力須由使用者依所用材料另行輸入。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
H = 3.0'- <i>牆身高度 H（m；水保技術規範第 118 條重力式有效高以 4 m 以下為原則）</i>
t_top = 0.8'- <i>牆頂寬 t（m）</i>
B = 2.6'- <i>牆底寬 B（m；背面垂直，正面斜坡）</i>
g_w = 24'- <i>牆身單位重 γ_w（kN/m³）</i>
mat = 1'- <i>牆身材料：1 = 無筋混凝土（rc112 第 14 章）；2 = 砌石（使用者輸入容許應力）</i>
f_c = 21'- <i>混凝土規定抗壓強度 f'c（MPa；mat = 1 用）</i>
ft_a = 0'- <i>砌石容許拉應力（kN/m²；mat = 2 用，0 表示不容許受拉）</i>
fc_a = 1000'- <i>砌石容許壓應力（kN/m²；mat = 2 用）</i>
fv_a = 150'- <i>砌石容許平均剪應力（kN/m²；mat = 2 用）</i>
g_s = 18'- <i>回填土單位重 γ_s（kN/m³）</i>
phi_s = 30'- <i>回填土有效內摩擦角 φ（度）</i>
q_sur = 10'- <i>牆頂地表均布超載 q（kN/m²）</i>
mu_b = 0.5'- <i>基底與地盤摩擦係數 μ</i>
q_a = 200'- <i>地盤容許承載力 q_a（kN/m²；已含長期安全係數 ≥ 3）</i>
base = 1'- <i>基礎地盤：1 = 土層（合力在底寬中間三分之一）；2 = 岩盤（合力在底寬中間二分之一）</i>

#hide
ok_in = if(H > 0 and t_top > 0 and B ≥ t_top and g_w > 0 and (mat ≡ 1 or mat ≡ 2) and (mat ≡ 2 or (f_c ≥ 17 and f_c ≤ 70)) and ft_a ≥ 0 and fc_a > 0 and fv_a > 0 and g_s > 0 and phi_s ≥ 15 and phi_s ≤ 45 and q_sur ≥ 0 and mu_b > 0 and q_a > 0 and (base ≡ 1 or base ≡ 2); 1; 0)
#show

#if ok_in > 0.5
'<h3>二、土壓力與外在穩定（found112 7.4.1～7.4.3、swc_tech 第 120 條）</h3>
#hide
Ka = tan((45 - phi_s/2)*pi/180)^2
Pa_soil = 0.5*Ka*g_s*H^2
Pa_sur = Ka*q_sur*H
Pa = Pa_soil + Pa_sur
M_o = Pa_soil*H/3 + Pa_sur*H/2
W_1 = g_w*t_top*H
W_2 = g_w*(B - t_top)*H/2
W_t = W_1 + W_2
M_r = W_1*(B - t_top/2) + W_2*(2*(B - t_top)/3)
FS_ot = M_r/M_o
UC_ot = 2.0/FS_ot
FS_sl = mu_b*W_t/Pa
UC_sl = 1.5/FS_sl
x_R = (M_r - M_o)/W_t
e_b = B/2 - x_R
e_lim = if(base ≡ 1; B/6; B/4)
UC_ecc = abs(e_b)/e_lim
q_max = if(abs(e_b) ≤ B/6; W_t/B*(1 + 6*abs(e_b)/B); if(x_R > 0 and B/2 - abs(e_b) > 0; 2*W_t/(3*(B/2 - abs(e_b))); 99999))
UC_bear = q_max/q_a
UC_H = H/4.0
#show
Ka_out = Ka'- <i>主動土壓力係數 K_a = tan²(45° − φ/2)</i>
Pa_out = Pa'- <i>每公尺牆長水平主動推力 P_a（kN/m）</i>
Mo_out = M_o'- <i>對牆趾傾覆力矩 M_o（kN·m/m）</i>
Wt_out = W_t'- <i>牆身自重 ΣW（kN/m）</i>
Mr_out = M_r'- <i>對牆趾抵抗力矩 M_r（kN·m/m）</i>
FSot_out = FS_ot'- <i>抗傾覆安全係數 FS（須 ≥ 2.0）</i>
FSsl_out = FS_sl'- <i>抗滑動安全係數 FS（須 ≥ 1.5）</i>
e_out = e_b'- <i>合力偏心距 e = B/2 − x_R（m）</i>
qmax_out = q_max'- <i>基底最大壓力 q_max（kN/m²）</i>
'<b style="color:'kleur(UC_ot)'">抗傾覆：UC_ot = 'ru(UC_ot)' → 'oordeel(UC_ot)'</b>
'<b style="color:'kleur(UC_sl)'">抗滑動：UC_sl = 'ru(UC_sl)' → 'oordeel(UC_sl)'</b>
'<b style="color:'kleur(UC_ecc)'">合力偏心：UC_ecc = 'ru(UC_ecc)' → 'oordeel(UC_ecc)'</b>
'<b style="color:'kleur(UC_bear)'">基底壓力：UC_bear = 'ru(UC_bear)' → 'oordeel(UC_bear)'</b>
'<b style="color:'kleur(UC_H)'">有效高度（≤ 4 m，swc_tech 第 118 條）：UC_H = 'ru(UC_H)' → 'oordeel(UC_H)'</b>

'<h3>三、牆身斷面應力（rc112 14.5；砌石採使用者容許應力）</h3>
#hide
kE = if(mat ≡ 1; 1.6; 1.0)
kD1 = if(mat ≡ 1; 0.9; 1.0)
kD2 = if(mat ≡ 1; 1.4; 1.0)
lim_t = if(mat ≡ 1; 0.6*0.42*sqrt(f_c)*1000; ft_a)
lim_c = if(mat ≡ 1; 0.6*0.85*f_c*1000; fc_a)
b_s(y) = t_top + (B - t_top)*y/H
W_s(y) = g_w*(t_top*y + (b_s(y) - t_top)*y/2)
Mw_s(y) = g_w*(t_top*y*(b_s(y)/2 - t_top/2) + (b_s(y) - t_top)*y/2*(b_s(y)/2 - t_top - (b_s(y) - t_top)/3))
Me_s(y) = Ka*g_s*y^3/6 + Ka*q_sur*y^2/2
Pa_s(y) = 0.5*Ka*g_s*y^2 + Ka*q_sur*y
Mu1(y) = abs(kE*Me_s(y) - kD1*Mw_s(y))
Mu2(y) = kD2*Mw_s(y)
st(y) = max(max(Mu1(y)*6/b_s(y)^2 - kD1*W_s(y)/b_s(y); Mu2(y)*6/b_s(y)^2 - kD2*W_s(y)/b_s(y)); 0)
sc(y) = max(Mu1(y)*6/b_s(y)^2 + kD1*W_s(y)/b_s(y); Mu2(y)*6/b_s(y)^2 + kD2*W_s(y)/b_s(y))
lim_v(y) = if(mat ≡ 1; 0.6*0.11*sqrt(f_c)*1000*b_s(y); fv_a*b_s(y))
UCt(y) = if(st(y) ≤ 0.000001; 0; if(lim_t > 0; st(y)/lim_t; 99))
UCc(y) = sc(y)/lim_c
UCv(y) = kE*Pa_s(y)/lim_v(y)
UC_t1 = UCt(H)
UC_c1 = UCc(H)
UC_v1 = UCv(H)
UC_t2 = UCt(H/2)
UC_c2 = UCc(H/2)
UC_v2 = UCv(H/2)
#show
st1_out = st(H)'- <i>y = H 斷面最大拉應力（kN/m²）</i>
sc1_out = sc(H)'- <i>y = H 斷面最大壓應力（kN/m²）</i>
st2_out = st(H/2)'- <i>y = H/2 斷面最大拉應力（kN/m²）</i>
sc2_out = sc(H/2)'- <i>y = H/2 斷面最大壓應力（kN/m²）</i>
'<b style="color:'kleur(UC_t1)'">牆底拉應力：UC_t1 = 'ru(UC_t1)' → 'oordeel(UC_t1)'</b>
'<b style="color:'kleur(UC_c1)'">牆底壓應力：UC_c1 = 'ru(UC_c1)' → 'oordeel(UC_c1)'</b>
'<b style="color:'kleur(UC_v1)'">牆底剪力：UC_v1 = 'ru(UC_v1)' → 'oordeel(UC_v1)'</b>
'<b style="color:'kleur(UC_t2)'">半高拉應力：UC_t2 = 'ru(UC_t2)' → 'oordeel(UC_t2)'</b>
'<b style="color:'kleur(UC_c2)'">半高壓應力：UC_c2 = 'ru(UC_c2)' → 'oordeel(UC_c2)'</b>
'<b style="color:'kleur(UC_v2)'">半高剪力：UC_v2 = 'ru(UC_v2)' → 'oordeel(UC_v2)'</b>

#hide
UC_max = ru(max(max(max(UC_ot; UC_sl); max(UC_ecc; UC_bear)); max(max(max(UC_H; UC_t1); max(UC_c1; UC_v1)); max(max(UC_t2; UC_c2); UC_v2))))
#show
UC_max'<span class="alleen-afdruk"></span>'

'<h3>四、總結</h3>
'<i>排水孔與伸縮縫（swc_tech 第 121 條）、地震、地下水與整體邊坡穩定（found112 7.4.4）須另行檢核；砌石容許應力由使用者負責提供。</i>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>重力式擋土牆檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>重力式擋土牆檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。須 0 &lt; t ≤ B、φ 15°～45°、材料與基礎地盤選項有效，且各強度與單位重為正值。
#end if
`;
