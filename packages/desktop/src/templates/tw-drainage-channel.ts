export const twDrainageChannel = `"鋼筋混凝土排水溝與明渠水理設計檢核（swc_tech / rc112）

'<i>依據農業部《水土保持技術規範》（114年5月7日修正，swc_tech）第16～19條、第78條、第82～87條，內政部國土管理署《市區道路及附屬工程設計規範》（113年9月12日修正）第7章，以及《建築物混凝土結構設計規範》（112年8月10日版，rc112）第11、22、24章，提供矩形（U型溝）與梯形鋼筋混凝土排水明渠之完整水理容量（曼寧公式等速流、水力半徑、設計流速上下限、正常水深反算、出水高檢核、流態福祿數判定）與側壁土壓力結構強度（因數化彎矩與剪力強度、最小鋼筋量、鋼筋間距）綜合檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、設計條件與輸入參數</h3>

'<h4>1. 水文條件與設計流量</h4>
use_rational = 1'- <i>流量推估方式：1 = 採用合理化公式 Q = (1/360)·C·I·A；0 = 直接輸入設計流量</i>
C_runoff = 0.85'- <i>逕流係數 C（swc_tech 表 18：開發整地區非農業 0.95～1.0，平坦耕地 0.85，丘陵 0.90）</i>
I_rain = 90.0'mm/h <i>設計降雨強度 I（swc_tech §83：坡地農地重現期距 10 年，其他非農業使用 25 年）</i>
A_catch = 2.0'ha <i>集水區面積 A（公頃，ha；合理化公式適用面積 ≤ 1000 ha）</i>
Q_direct = 0.45'm^3/s <i>直接指定之設計流量 Q_direct（當 use_rational = 0 時採用）</i>

#hide
Q_design_calc = if(use_rational == 1; C_runoff * I_rain * A_catch / 360; Q_direct)
#show
Q_design = Q_design_calc'm^3/s <i>設計洪峰流量 Q_design</i>

'<h4>2. 渠道幾何與水理參數</h4>
B_chan = 0.60'm <i>渠道底寬 B（水土保持技術規範 §78 一(二)：U形/矩形/梯形側溝寬度最小 0.30 m）</i>
H_chan = 0.80'm <i>渠道淨深 H（水土保持技術規範 §78 一(二)：側溝深度最小 0.30 m）</i>
z_side = 0.0'- <i>渠道側坡比 1:z（水平/垂直；垂直矩形 U 型溝 z = 0；梯形溝例如 0.5 或 1.0）</i>
S_chan = 0.01'- <i>渠底縱坡度 S（水土保持技術規範 §78 一(一)：邊溝須陡於 0.2%，即 S ≥ 0.002；山區農路 ≥ 0.005）</i>
n_manning = 0.014'- <i>曼寧粗糙係數 n（swc_tech §84；光面混凝土取 0.013～0.015，漿砌石取 0.020～0.025）</i>
V_min_req = 0.8'm/s <i>最小容許流速下限（swc_tech §85 一：混凝土或鋼筋混凝土設施防淤流速 ≥ 0.8 m/s）</i>
V_max_req = 4.57'm/s <i>最大容許流速上限（swc_tech §85 二(一)表列混凝土常流水 4.57～6.10 m/s，取保守下限 4.57；市區道路規範 §7.3.6 與下水道工程設施標準限 3.0 m/s，屬市區雨水下水道者請改填 3.0）</i>
sf_cap_req = 1.2'- <i>通水容量安全加成係數（非規範明文，為工程慣例之設計流量裕度，由設計者自訂；填 1.0 即不加成）</i>

'<h4>3. 側壁結構材料與土壤參數（rc112）</h4>
t_wall = 0.15'm <i>側壁厚度 t_wall（m）</i>
t_base = 0.15'm <i>底版厚度 t_base（m）</i>
fc_kpa = 24000'kN/m^2 <i>混凝土規定抗壓強度 f'c（24 MPa = 24000 kN/m²）</i>
fy_kpa = 420000'kN/m^2 <i>鋼筋規定降伏強度 fy（SD420 = 420 MPa = 420000 kN/m²）</i>
gamma_soil = 19.0'kN/m^3 <i>溝壁外側回填土單位重 γ_s</i>
phi_deg = 30'deg <i>土壤有效內摩擦角 φ</i>
q_surcharge = 10.0'kN/m^2 <i>溝側地表活載重等效均布超載 q_sur</i>
db_wall = 12.7'mm <i>側壁受拉主筋直徑（D13 = 12.7 mm，單根面積 126.7 mm²）</i>
Ab_wall = 126.7'mm^2 <i>單根鋼筋斷面積</i>
s_wall = 200'mm <i>側壁受拉主筋間距 s</i>
cc_wall = 50'mm <i>鋼筋淨保護層厚度（接觸土壤面取 50 mm）</i>

fc_mpa = fc_kpa / 1000
fy_mpa = fy_kpa / 1000

'<h3>二、全斷面滿流幾何與通水容量</h3>
'<i>依曼寧公式（swc_tech 第 84 條）：v = (1/n)·R^(2/3)·S^(1/2)，Q = A·v</i>

A_full = (B_chan + z_side * H_chan) * H_chan'm^2 <i>滿流通水面積 A_full</i>
P_full = B_chan + 2 * H_chan * (1 + z_side^2)^0.5'm <i>滿流潤周 P_full</i>
R_full = A_full / P_full'm <i>滿流水力半徑 R_full = A/P</i>

Q_cap = (1 / n_manning) * A_full * (R_full^(2/3)) * (S_chan^0.5)'m^3/s <i>全斷面滿流容量 Q_cap</i>
V_full = Q_cap / A_full'm/s <i>滿流平均流速 V_full</i>

'<h3>三、設計流量下正常水深與水理計算</h3>
'<i>以等速流曼寧公式經數值疊代精確求解設計水深 d_n</i>

#hide
sec_side = (1 + z_side^2)^0.5
d_guess = (n_manning * Q_design / (B_chan * (S_chan^0.5)))^0.6
d_k0 = if(d_guess > H_chan; H_chan * 0.9; if(d_guess < 0.02; 0.05; d_guess))

A_k0 = (B_chan + z_side * d_k0) * d_k0
P_k0 = B_chan + 2 * d_k0 * sec_side
T_k0 = B_chan + 2 * z_side * d_k0
f_k0 = (A_k0^(5/3)) / (P_k0^(2/3)) - n_manning * Q_design / (S_chan^0.5)
df_k0 = (A_k0^(2/3) / P_k0^(2/3)) * (5/3 * T_k0 - 4/3 * (A_k0 / P_k0) * sec_side)
d_k1 = max(0.01; d_k0 - f_k0 / df_k0)

A_k1 = (B_chan + z_side * d_k1) * d_k1
P_k1 = B_chan + 2 * d_k1 * sec_side
T_k1 = B_chan + 2 * z_side * d_k1
f_k1 = (A_k1^(5/3)) / (P_k1^(2/3)) - n_manning * Q_design / (S_chan^0.5)
df_k1 = (A_k1^(2/3) / P_k1^(2/3)) * (5/3 * T_k1 - 4/3 * (A_k1 / P_k1) * sec_side)
d_k2 = max(0.01; d_k1 - f_k1 / df_k1)

A_k2 = (B_chan + z_side * d_k2) * d_k2
P_k2 = B_chan + 2 * d_k2 * sec_side
T_k2 = B_chan + 2 * z_side * d_k2
f_k2 = (A_k2^(5/3)) / (P_k2^(2/3)) - n_manning * Q_design / (S_chan^0.5)
df_k2 = (A_k2^(2/3) / P_k2^(2/3)) * (5/3 * T_k2 - 4/3 * (A_k2 / P_k2) * sec_side)
d_n_raw = max(0.01; d_k2 - f_k2 / df_k2)

d_n_val = if(Q_design > Q_cap; H_chan * 1.05; d_n_raw)
#show

d_n = d_n_val'm <i>設計正常水深 d_n</i>
A_design = (B_chan + z_side * d_n) * d_n'm^2 <i>設計通水斷面積 A_design</i>
P_design = B_chan + 2 * d_n * (1 + z_side^2)^0.5'm <i>設計潤周 P_design</i>
R_design = A_design / P_design'm <i>設計水力半徑 R_design</i>
T_design = B_chan + 2 * z_side * d_n'm <i>設計水面寬度 T_design</i>
V_design = Q_design / A_design'm/s <i>設計平均流速 V_design</i>

D_hyd = A_design / T_design'm <i>水力水深 D_h = A/T</i>
Fr_num = V_design / (9.81 * D_hyd)^0.5'- <i>福祿數 Fr = V/√(g·D_h)；Fr &lt; 1 為緩流，Fr &gt; 1 為急流（非規範明文之流態參考）</i>

'<h3>四、出水高檢核（swc_tech 第 86 條）</h3>
'<i>規定出水高：設計水深之 25%，且不得小於 20 cm（0.20 m）</i>

fb_calc = 0.25 * d_n'm
fb_min = 0.20'm <i>出水高法定下限 20 cm</i>

#hide
fb_req_val = max(fb_calc; fb_min)
#show
fb_req = fb_req_val'm <i>法定最小出水高需求 fb_req</i>
fb_actual = H_chan - d_n'm <i>渠道實際提供之出水高 fb_act</i>
H_req = d_n + fb_req'm <i>渠道總深度需求 H_req = d_n + fb_req</i>

'<h3>五、側壁結構強度檢核（rc112 / USD）</h3>
'<i>側壁受靜止土壓力與地表超載作用，側壁底部交接面承受懸臂彎矩與剪力（載重因數 1.6）</i>

K0_soil = 1 - sin(phi_deg*deg)'- <i>靜止土壓力係數 K_0 = 1 − sin φ（Jaky 式，非規範明文之工程慣用值；剛性 U 型溝壁取靜止土壓力，空溝為最不利狀況）</i>

#hide
V_u_wall_val = 1.6 * (0.5 * K0_soil * gamma_soil * (H_chan^2) + K0_soil * q_surcharge * H_chan)
M_u_wall_val = 1.6 * ((1/6) * K0_soil * gamma_soil * (H_chan^3) + 0.5 * K0_soil * q_surcharge * (H_chan^2))
#show

V_u_wall = V_u_wall_val'kN/m <i>側壁底部因數化剪力 V_u</i>
M_u_wall = M_u_wall_val'kN*m/m <i>側壁底部因數化彎矩 M_u</i>

'<h4>側壁受彎與剪力承載容量</h4>
dw_wall = t_wall * 1000 - cc_wall - 0.5 * db_wall'mm <i>側壁有效深度 d_w</i>
As_wall = Ab_wall * 1000 / s_wall'mm²/m <i>每米側壁配筋量 A_s</i>

a_block = (As_wall * fy_mpa) / (0.85 * fc_mpa * 1000)'mm <i>等效矩形應力塊深度 a</i>
phi_Mn_wall = 0.90 * As_wall * fy_mpa * (dw_wall - 0.5 * a_block) / 10^6'kN·m/m <i>側壁設計抗彎容量 φMn（φ = 0.90，受拉控制）</i>
phi_Vc_wall = 0.75 * 0.17 * 1.0 * sqrt(fc_mpa) * 1000 * dw_wall / 1000'kN/m <i>混凝土設計單向剪力容量 φVc = φ·0.17λ√f'c·b·d（φ = 0.75，λ = 1.0）</i>

'<h4>最小鋼筋量與間距限制（rc112 §11.6.1、§11.7.2.1）</h4>
As_min_wall = 0.0018 * 1000 * t_wall * 1000'mm²/m <i>最小收縮與溫度鋼筋量 A_s,min = 0.0018·b·t（SD420）</i>

#hide
s_max_calc = min(3 * t_wall * 1000; 450)
#show
s_max_wall = s_max_calc'mm <i>最大配筋間距限制 s_max = min(3t, 450 mm)</i>

'<h3>六、安全係數與檢核比（Unity Checks）</h3>

#hide
geom_valid = if(B_chan > 0 and H_chan > 0 and S_chan > 0 and n_manning > 0 and Q_design > 0; 1; 0)
UC_geom = if(geom_valid == 1; 0.0; 99.0)
#show

'<h4>1. 水理能力檢核</h4>
UC_cap = Q_design / Q_cap
'<b style="color:'kleur(UC_cap)'">滿流容量檢核：UC_cap = 'ru(UC_cap)' ≤ 1.0 → 'oordeel(UC_cap)'</b>

UC_cap_sf = (sf_cap_req * Q_design) / Q_cap
'<b style="color:'kleur(UC_cap_sf)'">加成容量檢核（'sf_cap_req'倍）：UC_cap_sf = 'ru(UC_cap_sf)' ≤ 1.0 → 'oordeel(UC_cap_sf)'</b>

UC_fb = H_req / H_chan
'<b style="color:'kleur(UC_fb)'">出水高渠深檢核：UC_fb = 'ru(UC_fb)' ≤ 1.0 → 'oordeel(UC_fb)'</b>

UC_vmin = V_min_req / V_design
'<b style="color:'kleur(UC_vmin)'">防淤最小流速檢核（≥ 'V_min_req' m/s）：UC_vmin = 'ru(UC_vmin)' ≤ 1.0 → 'oordeel(UC_vmin)'</b>

UC_vmax = V_design / V_max_req
'<b style="color:'kleur(UC_vmax)'">防沖最大流速檢核（≤ 'V_max_req' m/s）：UC_vmax = 'ru(UC_vmax)' ≤ 1.0 → 'oordeel(UC_vmax)'</b>

'<h4>2. 構造幾何限制檢核（swc_tech 第 78 條）</h4>
UC_b_min = 0.30 / B_chan
'<b style="color:'kleur(UC_b_min)'">渠道內寬下限檢核（≥ 0.30 m）：UC_b_min = 'ru(UC_b_min)' ≤ 1.0 → 'oordeel(UC_b_min)'</b>

UC_h_min = 0.30 / H_chan
'<b style="color:'kleur(UC_h_min)'">渠道內深下限檢核（≥ 0.30 m）：UC_h_min = 'ru(UC_h_min)' ≤ 1.0 → 'oordeel(UC_h_min)'</b>

UC_s_min = 0.002 / S_chan
'<b style="color:'kleur(UC_s_min)'">渠底縱坡下限檢核（≥ 0.2%）：UC_s_min = 'ru(UC_s_min)' ≤ 1.0 → 'oordeel(UC_s_min)'</b>

'<h4>3. 側壁結構安全檢核（rc112）</h4>
UC_m_wall = M_u_wall / phi_Mn_wall
'<b style="color:'kleur(UC_m_wall)'">側壁抗彎強度檢核：UC_m_wall = 'ru(UC_m_wall)' ≤ 1.0 → 'oordeel(UC_m_wall)'</b>

UC_v_wall = V_u_wall / phi_Vc_wall
'<b style="color:'kleur(UC_v_wall)'">側壁剪力強度檢核：UC_v_wall = 'ru(UC_v_wall)' ≤ 1.0 → 'oordeel(UC_v_wall)'</b>

UC_rho_wall = As_min_wall / As_wall
'<b style="color:'kleur(UC_rho_wall)'">側壁最小配筋量檢核：UC_rho_wall = 'ru(UC_rho_wall)' ≤ 1.0 → 'oordeel(UC_rho_wall)'</b>

UC_s_wall = s_wall / s_max_wall
'<b style="color:'kleur(UC_s_wall)'">側壁鋼筋間距上限檢核：UC_s_wall = 'ru(UC_s_wall)' ≤ 1.0 → 'oordeel(UC_s_wall)'</b>

'<h3>七、檢核總結與控制項目</h3>

#hide
UC_max_raw = max(UC_cap; UC_cap_sf; UC_fb; UC_vmin; UC_vmax; UC_b_min; UC_h_min; UC_s_min; UC_m_wall; UC_v_wall; UC_rho_wall; UC_s_wall)
UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>八、總結</h3>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>排水溝水理與結構檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>排水溝水理與結構檢核不合格</b>
#end if
`;
