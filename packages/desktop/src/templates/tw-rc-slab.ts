/**
 * 鋼筋混凝土單向板設計與檢核（rc112）— 依據內政部《建築物混凝土結構設計規範》（112年8月10日版）。
 *
 * 涵蓋：最小板厚（表 7.3.1.1）、近似彎矩與剪力（表 6.5.2、表 6.5.4）、撓曲強度（22.2、21.2）、
 * 最少撓曲鋼筋 0.0018Ag（7.6.1.1）、收縮與溫度鋼筋（24.4.3.2、24.4.3.3）、主筋間距（7.7.2.3）、
 * 單向剪力強度（表 22.5.5.1 式(c)，無剪力鋼筋）、保護層（表 20.5.1.3.1）。
 * 撓度採規範之最小板厚法控制（7.3.1.1，符合者不另算撓度）。
 * 範圍：fy = 420 MPa、常重混凝土、均布載重、長向／短向淨跨比 ≥ 2 之單向板。
 * 雙向板（第 8 章直接設計法／等值構架法）之彎矩分配表未入已驗證庫，不在本模組範圍。
 */
export const twRcSlab = `"鋼筋混凝土單向板設計與檢核（rc112）

'<i>依據內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）第 6.5、7.3、7.6、7.7、20.5、22.2、22.5、24.4 節，以 1 m 寬板帶檢核單向板之最小厚度、撓曲強度、最少鋼筋、溫度收縮鋼筋、鋼筋間距與單向剪力。僅適用 f_y = 420 MPa、常重混凝土、均布載重、長向／短向淨跨比 ≥ 2 者；雙向板不在本模組範圍。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
f_c = 28'- <i>混凝土規定抗壓強度 f'c（MPa；rc112 19.2.1，≥ 21）</i>
f_y = 420'- <i>鋼筋規定降伏強度 f_y（MPa；本模組僅支援 420）</i>
h = 150'- <i>板厚 h（mm）</i>
ln = 3.0'- <i>短向淨跨 ℓn（m；支承面到面）</i>
L_long = 7.0'- <i>長向淨跨（m；須 ≥ 2ℓn，否則為雙向板）</i>
sup = 3'- <i>支承條件（表 7.3.1.1）：1 = 簡支；2 = 一端連續；3 = 兩端連續；4 = 懸臂</i>
mc = 4'- <i>彎矩斷面（表 6.5.2）：1 = 簡支跨中 ℓn²/8；2 = 端跨正彎矩（不連續端與支承一體）1/14；3 = 端跨正彎矩（不連續端不受束縛）1/11；4 = 內跨正彎矩 1/16；5 = 第一內支承外面（二跨）1/9；6 = 第一內支承外面（二跨以上）1/10；7 = 其他支承面 1/11；8 = 懸臂固定端 ℓn²/2；9 = 跨距 &lt; 3 m 板之所有支承面 1/12</i>
w_D = 2.0'- <i>附加靜載重（不含板自重；kN/m²）</i>
w_L = 3.0'- <i>活載重 L（kN/m²）</i>
env = 1'- <i>暴露環境（表 20.5.1.3.1）：1 = 不暴露且不接觸大地之樓板；2 = 暴露大氣或接觸大地；3 = 貼地澆置且永久接觸大地；4 = 海水或腐蝕環境</i>
cover = 20'- <i>採用淨保護層 c（mm）</i>
bar = 13'- <i>主筋號數 D（10、13、16、19、22、25）</i>
s = 150'- <i>主筋間距（mm）</i>
bar_t = 10'- <i>溫度收縮鋼筋號數 D（10、13、16、19、22、25）</i>
s_t = 250'- <i>溫度收縮鋼筋間距（mm）</i>

#hide
db_m = if(bar ≡ 10; 9.53; if(bar ≡ 13; 12.7; if(bar ≡ 16; 15.9; if(bar ≡ 19; 19.1; if(bar ≡ 22; 22.2; if(bar ≡ 25; 25.4; 0))))))
Ab_m = if(bar ≡ 10; 71.33; if(bar ≡ 13; 126.7; if(bar ≡ 16; 198.6; if(bar ≡ 19; 286.5; if(bar ≡ 22; 387.1; if(bar ≡ 25; 506.7; 0))))))
db_t = if(bar_t ≡ 10; 9.53; if(bar_t ≡ 13; 12.7; if(bar_t ≡ 16; 15.9; if(bar_t ≡ 19; 19.1; if(bar_t ≡ 22; 22.2; if(bar_t ≡ 25; 25.4; 0))))))
Ab_t = if(bar_t ≡ 10; 71.33; if(bar_t ≡ 13; 126.7; if(bar_t ≡ 16; 198.6; if(bar_t ≡ 19; 286.5; if(bar_t ≡ 22; 387.1; if(bar_t ≡ 25; 506.7; 0))))))
D_tot = 24*h/1000 + w_D
ok_sup = if(sup ≡ 1; if(mc ≡ 1; 1; 0); if(sup ≡ 4; if(mc ≡ 8; 1; 0); if(sup ≡ 2 or sup ≡ 3; if(mc ≥ 2 and mc ≤ 7 or mc ≡ 9; 1; 0); 0)))
ok_in = if(f_c ≥ 21 and f_c ≤ 70 and abs(f_y - 420) < 0.5 and h > 0 and ln > 0 and L_long ≥ 2*ln and w_D ≥ 0 and w_L ≥ 0 and env ≥ 1 and env ≤ 4 and env ≡ round(env) and cover > 0 and db_m > 0 and db_t > 0 and s > 0 and s_t > 0 and ok_sup > 0.5 and (mc ≠ 9 or ln < 3) and (sup ≡ 1 or sup ≡ 4 or w_L ≤ 3*D_tot); 1; 0)
#show

#if ok_in > 0.5
'<h3>二、載重與內力（表 6.5.2、表 6.5.4）</h3>
#hide
w_u = 1.2*D_tot + 1.6*w_L
coef_M = if(mc ≡ 1; 1/8; if(mc ≡ 2; 1/14; if(mc ≡ 3; 1/11; if(mc ≡ 4; 1/16; if(mc ≡ 5; 1/9; if(mc ≡ 6; 1/10; if(mc ≡ 7; 1/11; if(mc ≡ 8; 1/2; 1/12))))))))
M_u = coef_M * w_u * ln^2
V_u = if(mc ≡ 8; w_u*ln; if(mc ≡ 5 or mc ≡ 6; 1.15*w_u*ln/2; w_u*ln/2))
#show
D_all = D_tot'- <i>總靜載重 D = 24h/1000 + w_D（kN/m²）</i>
w_u_out = w_u'- <i>因數化均布載重 w_u = 1.2D + 1.6L（kN/m²，1 m 板帶）</i>
M_u_out = M_u'- <i>設計彎矩 M_u（kN·m/m）</i>
V_u_out = V_u'- <i>設計剪力 V_u（kN/m）</i>

'<h3>三、最小板厚（表 7.3.1.1，撓度控制）</h3>
#hide
k_h = if(sup ≡ 1; 20; if(sup ≡ 2; 24; if(sup ≡ 3; 28; 10)))
h_min = ln*1000/k_h
UC_h = h_min/h
#show
h_min_out = h_min'- <i>最小板厚 h_min = ℓn/k（mm；k = 20／24／28／10）</i>
'<b style="color:'kleur(UC_h)'">最小板厚檢核：UC_h = 'ru(UC_h)' → 'oordeel(UC_h)'</b>

'<h3>四、撓曲強度（22.2、21.2）</h3>
#hide
cov_min = if(env ≡ 1; 20; if(env ≡ 2; if(db_m ≤ 15.9; 40; 50); if(env ≡ 3; 75; 100)))
UC_cov = cov_min/cover
d_eff = h - cover - db_m/2
A_s = Ab_m*1000/s
a_blk = A_s*f_y/(0.85*f_c*1000)
beta1 = if(f_c ≤ 28; 0.85; max(0.65; 0.85 - 0.05*(f_c - 28)/7))
c_na = a_blk/beta1
eps_t = if(d_eff > 0 and c_na > 0; 0.003*(d_eff - c_na)/c_na; 0)
UC_eps = if(eps_t > 0; 0.005/eps_t; 99)
phiMn = 0.9*A_s*f_y*(d_eff - a_blk/2)/1000000
UC_m = M_u/phiMn
As_min = 0.0018*1000*h
UC_As = As_min/A_s
#show
d_out = d_eff'- <i>有效深度 d = h − c − d_b/2（mm）</i>
As_out = A_s'- <i>主筋面積 A_s = A_b·1000/s（mm²/m）</i>
eps_out = eps_t'- <i>受拉鋼筋應變 ε_t（須 ≥ 0.005 方得取 φ = 0.90）</i>
phiMn_out = phiMn'- <i>設計撓曲強度 φMn（kN·m/m）</i>
'<b style="color:'kleur(UC_cov)'">保護層檢核：UC_cov = 'ru(UC_cov)' → 'oordeel(UC_cov)'</b>
'<b style="color:'kleur(UC_eps)'">拉力控制檢核：UC_eps = 'ru(UC_eps)' → 'oordeel(UC_eps)'</b>
'<b style="color:'kleur(UC_m)'">撓曲強度檢核：UC_m = 'ru(UC_m)' → 'oordeel(UC_m)'</b>
'<b style="color:'kleur(UC_As)'">最少撓曲鋼筋（0.0018Ag，7.6.1.1）：UC_As = 'ru(UC_As)' → 'oordeel(UC_As)'</b>

'<h3>五、鋼筋間距與溫度收縮鋼筋（7.7.2.3、24.4.3）</h3>
#hide
s_max = min(3*h; 450)
UC_s = s/s_max
A_st = Ab_t*1000/s_t
UC_ts = As_min/A_st
s_t_max = min(5*h; 450)
UC_tsp = s_t/s_t_max
#show
'<b style="color:'kleur(UC_s)'">主筋間距（≤ min(3h, 450 mm)）：UC_s = 'ru(UC_s)' → 'oordeel(UC_s)'</b>
'<b style="color:'kleur(UC_ts)'">溫度收縮鋼筋量（0.0018Ag，24.4.3.2）：UC_ts = 'ru(UC_ts)' → 'oordeel(UC_ts)'</b>
'<b style="color:'kleur(UC_tsp)'">溫度收縮鋼筋間距（≤ min(5h, 450 mm)，24.4.3.3）：UC_tsp = 'ru(UC_tsp)' → 'oordeel(UC_tsp)'</b>

'<h3>六、單向剪力強度（表 22.5.5.1 式(c)，無剪力鋼筋）</h3>
#hide
rho_w = A_s/(1000*d_eff)
lam_s = min(1; sqrt(2/(1 + d_eff/250)))
Vc_kN = min(0.68*lam_s*rho_w^(1/3)*sqrt(f_c)*1000*d_eff; 0.42*sqrt(f_c)*1000*d_eff)/1000
phiVc = 0.75*Vc_kN
UC_v = V_u/phiVc
#show
lam_s_out = lam_s'- <i>尺度效應係數 λ_s = √(2/(1 + d/250)) ≤ 1（22.5.5.1.3）</i>
phiVc_out = phiVc'- <i>設計剪力強度 φV_c（kN/m）</i>
'<b style="color:'kleur(UC_v)'">單向剪力檢核：UC_v = 'ru(UC_v)' → 'oordeel(UC_v)'</b>

#hide
UC_max = ru(max(max(max(UC_h; UC_cov); max(UC_eps; UC_m)); max(max(UC_As; UC_s); max(max(UC_ts; UC_tsp); UC_v))))
#show
UC_max'<span class="alleen-afdruk"></span>'

'<h3>七、總結</h3>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>單向板檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>單向板檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。須 f_y = 420 MPa、長向／短向淨跨比 ≥ 2、支承條件與彎矩斷面相容、鋼筋號數為 D10～D25，且連續板活載重不得大於 3 倍靜載重。
#end if
`;
