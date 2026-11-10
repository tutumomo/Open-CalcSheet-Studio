/**
 * 明渠漸變流水面線標準步進法（swc_tech 第 84～86 條；曼寧公式與能量方程式）。
 *
 * 梯形（m = 0 為矩形）等斷面棱柱形渠道、定量流、正坡（S0 > 0）。
 * 以曼寧公式求正常水深 y_n，臨界方程式 Q²T/(gA³) = 1 求臨界水深 y_c；
 * 控制水深 y_0 > y_c 為緩流，控制斷面在下游，自下游向上游推算（M1、M2、S1）；
 * y_0 < y_c 為急流，控制斷面在上游，自上游向下游推算（M3、S2、S3）。
 * 每步以能量方程式 z + y + V²/2g 加平均摩擦坡降 Sf = n²V²/R^(4/3) 求解，二分法 45 次疊代。
 * 檢核：出水高（第 86 條，25% 水深且 ≥ 0.20 m）、最大流速（第 85 條二）、最小流速（第 85 條一）。
 * 步長內無法維持控制水深（壅水無解，例如需水躍）時 UC 取 99，不假裝求得結果。
 */
export const twBackwaterProfile = `"明渠水面線標準步進法（swc_tech / 曼寧公式）

'<i>依據《水土保持技術規範》（114年5月7日版）第 84 條曼寧公式、第 85 條流速限制、第 86 條出水高，以標準步進法（standard step method）推算梯形或矩形等斷面棱柱形渠道之漸變流水面線（M1、M2、M3、S1、S2、S3）。正坡、定量流；步長內無解（需水躍）時不求解並判不合格。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
Q_d = 10'- <i>設計流量 Q（m³/s）</i>
b_w = 3'- <i>渠底寬 b（m）</i>
m_s = 1'- <i>邊坡 m（水平:垂直 = m:1；0 為矩形）</i>
n_m = 0.015'- <i>曼寧粗糙係數 n（swc_tech 第 84 條；混凝土 0.013～0.015）</i>
S_0 = 0.001'- <i>渠底坡降 S0（正坡）</i>
y_0 = 1.8'- <i>控制斷面水深 y_0（m；高於臨界水深＝下游控制，低於臨界水深＝上游控制）</i>
L_r = 400'- <i>推算渠段長度 L（m）</i>
N_s = 20'- <i>推算步數 N（1～100）</i>
H_ch = 3.0'- <i>渠道深度 H（m）</i>
V_allow = 4.57'- <i>最大容許流速（m/s；swc_tech 第 85 條二(一)混凝土常流水 4.57～6.10，取保守下限）</i>

#hide
ok_in = if(Q_d > 0 and b_w > 0 and m_s ≥ 0 and n_m > 0 and S_0 > 0 and y_0 > 0 and L_r > 0 and N_s ≥ 1 and N_s ≤ 100 and N_s ≡ round(N_s) and H_ch > 0 and V_allow > 0; 1; 0)
#show

#if ok_in > 0.5
'<h3>二、正常水深與臨界水深</h3>
#hide
g_a = 9.81
sec_m = sqrt(1 + m_s^2)
A_f(y) = (b_w + m_s*y)*y
P_f(y) = b_w + 2*y*sec_m
T_f(y) = b_w + 2*m_s*y
V_f(y) = Q_d/A_f(y)
Sf_f(y) = n_m^2*V_f(y)^2/(A_f(y)/P_f(y))^(4/3)
E_f(y) = y + V_f(y)^2/(2*g_a)
Gn_f(y) = A_f(y)*(A_f(y)/P_f(y))^(2/3)*sqrt(S_0)/n_m - Q_d
Gc_f(y) = Q_d^2*T_f(y)/(g_a*A_f(y)^3) - 1
lo_n = 0.0001
hi_n = 100
#for it = 1 : 45
mid_n = (lo_n + hi_n)/2
cn = if(Gn_f(lo_n)*Gn_f(mid_n) ≤ 0; 1; 0)
hi_n = if(cn > 0.5; mid_n; hi_n)
lo_n = if(cn > 0.5; lo_n; mid_n)
#loop
y_n = (lo_n + hi_n)/2
lo_c = 0.0001
hi_c = 100
#for it = 1 : 45
mid_c = (lo_c + hi_c)/2
cc = if(Gc_f(lo_c)*Gc_f(mid_c) ≤ 0; 1; 0)
hi_c = if(cc > 0.5; mid_c; hi_c)
lo_c = if(cc > 0.5; lo_c; mid_c)
#loop
y_c = (lo_c + hi_c)/2
mild = if(y_n > y_c; 1; 0)
sub = if(y_0 > y_c; 1; 0)
prof = if(mild > 0.5; if(y_0 > y_n; "M1"; if(y_0 > y_c; "M2"; "M3")); if(y_0 > y_c; "S1"; if(y_0 > y_n; "S2"; "S3")))
ok_ctl = if(abs(y_0 - y_c) > 0.01*y_c; 1; 0)
#show
y_n_out = y_n'- <i>正常水深 y_n（m；曼寧公式 Q = A·R^(2/3)·S0^(1/2)/n）</i>
y_c_out = y_c'- <i>臨界水深 y_c（m；Q²T/(gA³) = 1）</i>
'渠道坡度分類：<b>'if(mild > 0.5; "緩坡 (y_n &gt; y_c)"; "陡坡 (y_n &lt; y_c)")'</b>；水面線型式：<b>'prof'</b>

'<h3>三、標準步進法推算</h3>
#hide
dx = L_r/N_s
y_cur = y_0
y_max = y_0
V_max = V_f(y_0)
V_min = V_f(y_0)
y_mid = y_0
bad = if(ok_ctl > 0.5; 0; 1)
#for i = 1 : N_s
E_p = E_f(y_cur)
Sf_p = Sf_f(y_cur)
lo_s = if(sub > 0.5; y_c; 0.0001)
hi_s = if(sub > 0.5; 100; y_c)
#for it = 1 : 45
mid_s = (lo_s + hi_s)/2
Fl = S_0*dx + (if(sub > 0.5; 1; -1))*(E_f(lo_s) - E_p) - dx*(Sf_f(lo_s) + Sf_p)/2
Fm = S_0*dx + (if(sub > 0.5; 1; -1))*(E_f(mid_s) - E_p) - dx*(Sf_f(mid_s) + Sf_p)/2
cs = if(Fl*Fm ≤ 0; 1; 0)
hi_s = if(cs > 0.5; mid_s; hi_s)
lo_s = if(cs > 0.5; lo_s; mid_s)
#loop
y_new = (lo_s + hi_s)/2
Fe = S_0*dx + (if(sub > 0.5; 1; -1))*(E_f(y_new) - E_p) - dx*(Sf_f(y_new) + Sf_p)/2
bad = if(abs(Fe) > 0.000001 or bad > 0.5; 1; 0)
y_cur = y_new
y_max = max(y_max; y_cur)
V_max = max(V_max; V_f(y_cur))
V_min = min(V_min; V_f(y_cur))
y_mid = if(i ≡ round(N_s/2); y_cur; y_mid)
#loop
#show
dx_out = dx'- <i>步長 Δx（m）</i>
y_end_out = y_cur'- <i>推算終點水深（m；下游控制時為渠段上游端，上游控制時為渠段下游端）</i>
y_mid_out = y_mid'- <i>渠段中點水深（m）</i>
ymax_out = y_max'- <i>渠段最大水深（m）</i>
Vmax_out = V_max'- <i>最大流速（m/s）</i>
Vmin_out = V_min'- <i>最小流速（m/s）</i>
'求解狀態：<b>'if(bad > 0.5; "未收斂或控制水深過近臨界（無解，需水躍或改變控制斷面）"; "各步均收斂")'</b>

'<h3>四、檢核（swc_tech 第 85、86 條）</h3>
#hide
fb_req = max(0.25*y_max; 0.2)
UC_fb = (y_max + fb_req)/H_ch
UC_vmax = V_max/V_allow
UC_vmin = 0.8/V_min
UC_sol = if(bad > 0.5; 99; 0.5)
#show
fb_out = fb_req'- <i>所需出水高 = max(25% 最大水深, 0.20 m)（第 86 條）</i>
'<b style="color:'kleur(UC_fb)'">出水高與渠深：UC_fb = 'ru(UC_fb)' → 'oordeel(UC_fb)'</b>
'<b style="color:'kleur(UC_vmax)'">最大流速（第 85 條二）：UC_vmax = 'ru(UC_vmax)' → 'oordeel(UC_vmax)'</b>
'<b style="color:'kleur(UC_vmin)'">最小流速 ≥ 0.8 m/s（第 85 條一）：UC_vmin = 'ru(UC_vmin)' → 'oordeel(UC_vmin)'</b>
'<b style="color:'kleur(UC_sol)'">步進法可解性：UC_sol = 'ru(UC_sol)' → 'oordeel(UC_sol)'</b>

#hide
UC_max = ru(max(max(UC_fb; UC_vmax); max(UC_vmin; UC_sol)))
#show
UC_max'<span class="alleen-afdruk"></span>'

'<h3>五、總結</h3>
'<i>超臨界流與水躍位置、橋涵水頭損失及變斷面渠道不在本模組範圍。</i>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>明渠水面線檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>明渠水面線檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。Q、b、n、S0、y_0、L、H 須為正值，m ≥ 0，步數為 1～100 之整數（正坡）。
#end if
`;
