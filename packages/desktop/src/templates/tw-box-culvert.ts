export const twBoxCulvert = `"鋼筋混凝土箱涵設計與檢核（hwbridge / rc112）

'<i>依據交通部《公路橋梁設計規範》（98年12月版，hwbridge）第 3.6 節 HS20-44 標準貨車、第 3.13 節涵洞衝擊係數、第 3.20 節土壓力、第 3.23 節表 3.3 強度設計法第 VIII 組（涵洞）載重組合、第 4.4 節透過填土之輪重分佈，以及內政部《建築物混凝土結構設計規範》（112年8月版，rc112）之強度折減係數與斷面強度，檢核單孔鋼筋混凝土箱涵：平面剛架 raamwerk 求解頂版、底版與側牆內力，再檢核抗彎 φMn、剪力 φVc、側牆軸壓、最少配筋量與鋼筋間距；另檢核 45° 內角加腋、滿流排水容量（曼寧公式）、地盤承載力與抗浮安全係數。適用範圍：單孔、覆土深度 &gt; 0.60 m（覆土較淺時須依 hwbridge 第 4.3 節以集中輪重設計版，本表不適用）。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、設計條件與輸入參數</h3>

'<h4>1. 箱涵斷面幾何尺寸</h4>
B_clear = 3.00'm <i>涵身內淨寬 B_clear</i>
H_clear = 2.00'm <i>涵身內淨高 H_clear</i>
t_top = 0.35'm <i>頂版厚度 t_top</i>
t_bot = 0.40'm <i>底版厚度 t_bot</i>
t_wall = 0.30'm <i>側牆厚度 t_wall</i>
c_chamfer = 0.20'm <i>45° 內角加腋邊長 c_chamfer</i>
H_cover = 1.00'm <i>頂版土層覆土深度 H_cover</i>
H_gw = 1.50'm <i>地下水位深度（自地表起算，m；若無地下水請設 ≥ 99 m）</i>
S_slope = 0.005'- <i>渠道縱向坡度 S_slope（swc_tech §78：排水設施縱坡 ≥ 0.2%）</i>
n_manning = 0.014'- <i>曼寧粗糙係數 n（設計者輸入；光面混凝土常用 0.013～0.015）</i>
Q_design = 12.00'm^3/s <i>設計洪峰通水量 Q_design</i>

'<h4>2. 材料強度與回填土壤參數</h4>
fc_kpa = 28000'kN/m^2 <i>混凝土規定抗壓強度 f'c（28 MPa = 28000 kN/m²）</i>
fy_kpa = 420000'kN/m^2 <i>鋼筋規定降伏強度 fy（SD420 = 420 MPa = 420000 kN/m²）</i>
gamma_c = 24.0'kN/m^3 <i>鋼筋混凝土單位重 γ_c</i>
gamma_s = 19.0'kN/m^3 <i>回填土單位重 γ_s</i>
gamma_w = 9.81'kN/m^3 <i>水單位重 γ_w</i>
phi_deg = 30'deg <i>土壤有效內摩擦角 φ</i>
q_surcharge = 10.0'kN/m^2 <i>地表等效均佈活載重超載 q_sur</i>
qa_allow = 220.0'kN/m^2 <i>地盤容許承載力 q_a（工作載重下）</i>
cover_ext = 50'mm <i>外側接觸土壤面鋼筋淨保護層厚度（rc112 表 20.6.1.3.1）</i>
cover_int = 40'mm <i>內側通水面鋼筋淨保護層厚度</i>

'<h4>3. 車輛活載重設定（公路橋梁設計規範 hwbridge 第 3 章）</h4>
truck_type = 1'- <i>車載種類：1 = HS20-44(MS18)（後軸重 144 kN，單輪 72 kN，§3.6）；0 = 無車載</i>
k_truck = 1.00'- <i>載重等級倍數：一般道路 1.00；省市重要道路、國道取 1.25（§3.6 第 6、7 款）</i>
s_wheel = 1.80'm <i>同軸左右輪中心距（依 §3.6 圖 3.3 確認）</i>
s_axle = 4.25'm <i>後軸距（§3.6 圖 3.3：4.25～9.15 m，取最小值產生最大壓力）</i>

'<h4>4. 鋼筋配置參數</h4>
'頂版主筋直徑與間距：
db_top = 19.1'mm <i>（D19 鋼筋，單根面積 286.5 mm²）</i>
Ab_top = 286.5'mm^2
s_top = 150'mm <i>頂版受拉主筋間距 s_top</i>

'底版主筋直徑與間距：
db_bot = 19.1'mm <i>（D19 鋼筋，單根面積 286.5 mm²）</i>
Ab_bot = 286.5'mm^2
s_bot = 150'mm <i>底版受拉主筋間距 s_bot</i>

'側牆垂直主筋直徑與間距：
db_wall = 15.9'mm <i>（D16 鋼筋，單根面積 198.6 mm²）</i>
Ab_wall = 198.6'mm^2
s_wall = 150'mm <i>側牆垂直受拉主筋間距 s_wall</i>

'角隅 45° 補強斜筋直徑與間距：
db_corner = 12.7'mm <i>（D13 鋼筋，單根面積 126.7 mm²）</i>
s_corner = 200'mm <i>角隅 X 形補強斜筋間距 s_corner</i>

#hide
fc_mpa = fc_kpa / 1000
fy_mpa = fy_kpa / 1000

'幾何與適用範圍防護檢核（覆土 ≤ 0.60 m 且有車載時屬 hwbridge §4.3 集中輪重，本表拒算）
limit_chamfer = min(B_clear / 2; H_clear / 2; t_wall)
cover_ok = if(truck_type == 0 or H_cover > 0.60; 1; 0)
geom_ok = if(B_clear > 0.5 and H_clear > 0.5 and t_top > 0.15 and t_bot > 0.15 and t_wall > 0.15 and c_chamfer > 0 and c_chamfer ≤ limit_chamfer and H_cover ≥ 0 and s_top > 0 and s_bot > 0 and s_wall > 0 and (truck_type == 0 or truck_type == 1) and k_truck ≥ 1.0 and s_wheel > 0 and s_axle > 0 and cover_ok == 1; 1; 0)
UC_geom = if(geom_ok == 1; 0.0; 999.0)
#show

'<h3>二、幾何尺寸與車輛活載重計算</h3>

'<i>外框尺寸與剛架構件中心線跨度：</i>
B_outer = B_clear + 2 * t_wall'm <i>箱涵外總寬 B_outer</i>
H_outer = H_clear + t_top + t_bot'm <i>箱涵外總高 H_outer</i>
B_c = B_clear + t_wall'm <i>閉合剛架頂底版計算跨度 B_c</i>
H_c = H_clear + (t_top + t_bot) / 2'm <i>閉合剛架側牆計算高度 H_c</i>

'<i>涵洞衝擊係數 I（hwbridge §3.13：覆土 0～0.3 m 取 30%、0.3～0.6 m 取 20%、0.6～0.9 m 取 10%；覆土 0.9 m 以上屬 B 類，不計衝擊）：</i>
#hide
I_truck_calc = if(H_cover ≤ 0.30; 0.30; if(H_cover ≤ 0.60; 0.20; if(H_cover < 0.90; 0.10; 0.0)))
I_truck = if(truck_type == 0; 0.0; I_truck_calc)
P_wheel = if(truck_type == 1; 72 * k_truck; 0.0)'kN
#show
'衝擊係數：I = 'I_truck'；設計輪重 P = 'P_wheel' kN

'<i>透過填土之輪重分佈（hwbridge §4.4）：每一輪重均佈於邊長 1.75·H_cover 之方形；相鄰輪重分佈區重疊時，全部輪重均佈於外圍面積。單孔箱涵覆土超過 2.4 m 且超過跨徑時，不計活載重。</i>
#hide
D_spread = 1.75 * H_cover
n_x = if(D_spread > s_wheel; 2; 1)
L_x = if(D_spread > s_wheel; D_spread + s_wheel; D_spread)
n_y = if(D_spread > s_axle; 2; 1)
L_y = if(D_spread > s_axle; D_spread + s_axle; D_spread)
n_wheels = n_x * n_y
LL_negligible = if(H_cover > 2.4 and H_cover > B_clear + t_wall; 1; 0)
q_truck_noI = if(truck_type == 0 or LL_negligible == 1 or cover_ok == 0; 0.0; n_x * n_y * P_wheel / (L_x * L_y))
q_truck_raw = q_truck_noI * (1 + I_truck)
#show
'輪重分佈面積：'n_wheels' 個輪重，L_x = 'ru(L_x)' m × L_y = 'ru(L_y)' m
q_truck = ru(q_truck_raw)'kN/m^2 <i>頂版均佈車載重（含衝擊）q_truck</i>

'<h3>三、土壓力與載重計算</h3>

'<i>靜止土壓力係數 K0 = 1 − sin(φ)：</i>
K0_soil = 1 - sin(phi_deg * deg)
'靜止土壓力係數：K0 = 'ru(K0_soil)'

'<i>頂版與底版垂直靜載重：</i>
w_soil = gamma_s * H_cover'kN/m^2 <i>頂版上方覆土自重 w_soil</i>
w_top_self = gamma_c * t_top'kN/m^2 <i>頂版混凝土自重 w_top</i>
w_bot_self = gamma_c * t_bot'kN/m^2 <i>底版混凝土自重 w_bot</i>
W_walls_total = 2 * gamma_c * t_wall * H_c'kN/m <i>雙側牆每延米自重 W_walls</i>

'頂版總靜載重（覆土、地表靜載超載、頂版自重）：
q_D_top = w_soil + q_surcharge + w_top_self'kN/m^2

'底版工作載重下地盤平均接觸應力（hwbridge §3.13 B 類：基礎壓力不計衝擊）：
q_base_service = q_D_top + w_bot_self + W_walls_total / B_c + q_truck_noI'kN/m^2
'地盤平均工作接觸應力：q_base_service = 'ru(q_base_service)' kN/m² ≤ qa = 'qa_allow' kN/m²

'<i>側牆側向土水壓力計算（外側向內推）：</i>
z_top = H_cover + t_top / 2'm <i>頂版中心線深度</i>
z_bot = H_cover + H_outer - t_bot / 2'm <i>底版中心線深度</i>

'側向活載重超載壓力（hwbridge §3.20：不小於相當 60 cm 高之填土）：
p_L_lat = if(truck_type == 0; 0.0; K0_soil * gamma_s * 0.60)'kN/m^2

'<i>土壓力不得小於相當 4.7 kN/m³ 之流體壓力（hwbridge §3.20）：</i>
#hide
p_soil_top_calc = max(K0_soil * (q_surcharge + gamma_s * z_top); 4.7 * z_top)
p_soil_bot_calc = max(K0_soil * (q_surcharge + gamma_s * min(z_bot; H_gw) + max(0; gamma_s - gamma_w) * max(0; z_bot - H_gw)); 4.7 * z_bot)
p_water_bot_calc = gamma_w * max(0; z_bot - H_gw)
p_lat_top_calc = p_soil_top_calc + p_L_lat
p_lat_bot_calc = p_soil_bot_calc + p_water_bot_calc + p_L_lat
#show

p_lat_top = ru(p_lat_top_calc)'kN/m^2 <i>頂版中心高度側向總壓力 p_lat,top</i>
p_lat_bot = ru(p_lat_bot_calc)'kN/m^2 <i>底版中心高度側向總壓力 p_lat,bot</i>

'<h3>四、強度設計載重組合（hwbridge §3.23 表 3.3 第 VIII 組：涵洞）</h3>
'<i>U = γ·[β_D·D + 1.67·(L+I) + β_E·E]，γ = 1.3；受撓構材 β_D = 1.0；剛性涵洞 β_E = 1.0（垂直與水平土壓）。檢核頂版、底版跨中正彎矩時，側向土壓所生彎矩至多取一半（§3.20，β_E = 0.5）。</i>
#hide
gamma_LF = 1.3
beta_D = 1.0
beta_L = 1.67
beta_E = 1.0
#show

w_u_top = gamma_LF * (beta_D * w_top_self + beta_E * (w_soil + q_surcharge) + beta_L * q_truck)'kN/m^2 <i>因數化頂版垂直載重 w_u,top</i>
w_u_wall_per_B = gamma_LF * beta_D * W_walls_total / B_c'kN/m^2 <i>側牆自重換算底版反力分量</i>
w_u_bot = w_u_top + w_u_wall_per_B'kN/m^2 <i>底版因數化淨向上地盤反力 w_u,bot</i>

p_u_top = gamma_LF * (beta_E * p_soil_top_calc + beta_L * p_L_lat)'kN/m^2 <i>頂版中心高度因數化側壓力 p_u,top</i>
p_u_bot = gamma_LF * (beta_E * (p_soil_bot_calc + p_water_bot_calc) + beta_L * p_L_lat)'kN/m^2 <i>底版中心高度因數化側壓力 p_u,bot</i>

'<h3>五、閉合剛架平面結構力學分析（raamwerk 求解）</h3>
'<i>取每延米寬度（b = 1.0 m）為四節點四桿件閉合剛架模型求解內力：</i>

#hide
Ec_kpa = 4700 * (fc_mpa^0.5) * 1000'kN/m^2 <i>混凝土彈性模數</i>
EI_top = Ec_kpa * (1.0 * (t_top^3) / 12)
EA_top = Ec_kpa * (1.0 * t_top)
EI_bot = Ec_kpa * (1.0 * (t_bot^3) / 12)
EA_bot = Ec_kpa * (1.0 * t_bot)
EI_wall = Ec_kpa * (1.0 * (t_wall^3) / 12)
EA_wall = Ec_kpa * (1.0 * t_wall)

'節點座標 [x; y]：1(左下), 2(左上), 3(右上), 4(右下)
kn_box = [0; 0; B_c; B_c | 0; H_c; H_c; 0]

'桿件 [i; j; EI; EA; hinge_i; hinge_j]：1(左牆 1->2), 2(頂版 2->3), 3(右牆 3->4), 4(底版 4->1)
st_box = [1; 2; 3; 4 | 2; 3; 4; 1 | EI_wall; EI_top; EI_wall; EI_bot | EA_wall; EA_top; EA_wall; EA_bot | 0; 0; 0; 0 | 0; 0; 0; 0]

'邊界約束：節點 1 鉸支承 [1,1,1,0]、節點 4 滾支承 [4,0,1,0]，允許角隅對稱自由轉動並消除剛體位移
op_box = [1; 4 | 1; 0 | 1; 1 | 0; 0]

'垂直載重工況（頂版向內/向下為方向 4；底版向內/向上為方向 4；啟用 toppen=1 精確捕捉極值）：
last_v = [2; 4 | 1; 1 | 0; 0 | B_c; B_c | w_u_top; w_u_bot | w_u_top; w_u_bot | 4; 4]
R_v = raamwerk(kn_box; st_box; op_box; last_v; [1; 1]; 1)

'側向壓力工況（左牆由下往上向內為方向 4；右牆由上往下向內為方向 4）：
last_h = [1; 3 | 1; 1 | 0; 0 | H_c; H_c | p_u_bot; p_u_top | p_u_top; p_u_bot | 4; 4]
R_h = raamwerk(kn_box; st_box; op_box; last_h; [1; 1]; 1)

'提取垂直載重工況各構件內力：
ext_v_top = raamwerk_ext(R_v; 2; 7)
M_v_top_mid = ext_v_top.1
M_v_top_end = ext_v_top.3
ext_v_top_shear = raamwerk_ext(R_v; 2; 6)
V_v_top = max(abs(ext_v_top_shear.1); abs(ext_v_top_shear.3))

ext_v_bot = raamwerk_ext(R_v; 4; 7)
M_v_bot_mid = ext_v_bot.1
M_v_bot_end = ext_v_bot.3
ext_v_bot_shear = raamwerk_ext(R_v; 4; 6)
V_v_bot = max(abs(ext_v_bot_shear.1); abs(ext_v_bot_shear.3))

ext_v_wall = raamwerk_ext(R_v; 1; 7)
M_v_wall_mid = ext_v_wall.1

'提取側向載重工況各構件內力：
ext_h_top = raamwerk_ext(R_h; 2; 7)
M_h_top_mid = ext_h_top.1
M_h_top_end = ext_h_top.3

ext_h_bot = raamwerk_ext(R_h; 4; 7)
M_h_bot_mid = ext_h_bot.1
M_h_bot_end = ext_h_bot.3

ext_h_wall = raamwerk_ext(R_h; 1; 7)
M_h_wall_mid = ext_h_wall.1
M_h_wall_end = ext_h_wall.3
ext_h_wall_shear = raamwerk_ext(R_h; 1; 6)
V_h_wall = max(abs(ext_h_wall_shear.1); abs(ext_h_wall_shear.3))

'綜合控制內力組合（線性疊加）：
'頂版與底版跨中正彎矩：側向土壓所生彎矩至多取一半（hwbridge §3.20，β_E = 0.5）；端部負彎矩取全部（β_E = 1.0）
'側牆跨中正彎矩：保守不計垂直載重之減量（垂直工況含活載重，未必同時存在）
M_u_top_mid_calc = max(0.1; M_v_top_mid + 0.5 * M_h_top_mid)
M_u_top_end_calc = max(0.1; abs(M_v_top_end + M_h_top_end))
V_u_top_calc = V_v_top

M_u_bot_mid_calc = max(0.1; M_v_bot_mid + 0.5 * M_h_bot_mid)
M_u_bot_end_calc = max(0.1; abs(M_v_bot_end + M_h_bot_end))
V_u_bot_calc = V_v_bot

M_u_wall_mid_calc = max(0.1; M_h_wall_mid)
M_u_wall_end_calc = max(0.1; max(M_u_top_end_calc; M_u_bot_end_calc))
V_u_wall_calc = V_h_wall
P_u_wall_calc = w_u_top * B_c / 2 + gamma_LF * beta_D * gamma_c * t_wall * H_c
#show

Mu_top_mid = ru(M_u_top_mid_calc)'kN*m <i>頂版跨中設計正彎矩 Mu,top,mid</i>
Mu_top_end = ru(M_u_top_end_calc)'kN*m <i>頂版端部設計負彎矩 Mu,top,end</i>
Vu_top = ru(V_u_top_calc)'kN <i>頂版端部設計剪力 Vu,top</i>

Mu_bot_mid = ru(M_u_bot_mid_calc)'kN*m <i>底版跨中設計正彎矩 Mu,bot,mid</i>
Mu_bot_end = ru(M_u_bot_end_calc)'kN*m <i>底版端部設計負彎矩 Mu,bot,end</i>
Vu_bot = ru(V_u_bot_calc)'kN <i>底版端部設計剪力 Vu,bot</i>

Mu_wall_mid = ru(M_u_wall_mid_calc)'kN*m <i>側牆跨中設計正彎矩 Mu,wall,mid</i>
Mu_wall_end = ru(M_u_wall_end_calc)'kN*m <i>側牆端部設計負彎矩 Mu,wall,end</i>
Vu_wall = ru(V_u_wall_calc)'kN <i>側牆底部設計剪力 Vu,wall</i>
Pu_wall = ru(P_u_wall_calc)'kN <i>側牆軸壓力 Pu,wall</i>

'<h3>六、鋼筋混凝土截面強度檢核（rc112）</h3>

#hide
beta1 = if(fc_mpa ≤ 28; 0.85; max(0.65; 0.85 - 0.05 * (fc_mpa - 28) / 7))
phi_b = 0.90
phi_v = 0.75

'頂版配筋計算
d_top_in = t_top * 1000 - cover_int - db_top / 2'mm
d_top_out = t_top * 1000 - cover_ext - db_top / 2'mm
As_top = Ab_top * (1000 / s_top)'mm^2
a_top = As_top * fy_mpa / (0.85 * fc_mpa * 1000)'mm
phi_Mn_top_mid_calc = phi_b * As_top * fy_mpa * (d_top_in - a_top / 2) * 1e-6'kN*m
phi_Mn_top_end_calc = phi_b * As_top * fy_mpa * (d_top_out - a_top / 2) * 1e-6'kN*m
phi_Vc_top_calc = phi_v * 0.17 * (fc_mpa^0.5) * 1000 * d_top_out * 1e-3'kN
As_min_top = 0.0018 * 1000 * (t_top * 1000)'mm^2

'底版配筋計算
d_bot_in = t_bot * 1000 - cover_int - db_bot / 2'mm
d_bot_out = t_bot * 1000 - cover_ext - db_bot / 2'mm
As_bot = Ab_bot * (1000 / s_bot)'mm^2
a_bot = As_bot * fy_mpa / (0.85 * fc_mpa * 1000)'mm
phi_Mn_bot_mid_calc = phi_b * As_bot * fy_mpa * (d_bot_in - a_bot / 2) * 1e-6'kN*m
phi_Mn_bot_end_calc = phi_b * As_bot * fy_mpa * (d_bot_out - a_bot / 2) * 1e-6'kN*m
phi_Vc_bot_calc = phi_v * 0.17 * (fc_mpa^0.5) * 1000 * d_bot_out * 1e-3'kN
As_min_bot = 0.0018 * 1000 * (t_bot * 1000)'mm^2

'側牆配筋計算
d_wall_in = t_wall * 1000 - cover_int - db_wall / 2'mm
d_wall_out = t_wall * 1000 - cover_ext - db_wall / 2'mm
As_wall = Ab_wall * (1000 / s_wall)'mm^2
a_wall = As_wall * fy_mpa / (0.85 * fc_mpa * 1000)'mm
phi_Mn_wall_mid_calc = phi_b * As_wall * fy_mpa * (d_wall_in - a_wall / 2) * 1e-6'kN*m
phi_Mn_wall_end_calc = phi_b * As_wall * fy_mpa * (d_wall_out - a_wall / 2) * 1e-6'kN*m
phi_Vc_wall_calc = phi_v * 0.17 * (fc_mpa^0.5) * 1000 * d_wall_out * 1e-3'kN
phi_Pn_wall_calc = 0.65 * 0.80 * (0.85 * fc_mpa * (1000 * t_wall * 1000 - 2 * As_wall) + fy_mpa * 2 * As_wall) * 1e-3'kN
As_min_wall = 0.0018 * 1000 * (t_wall * 1000)'mm^2

'裂縫控制間距限制（rc112 第 24.3.2 條）：
fs_rebar = 2 / 3 * fy_mpa
s_max_top_calc = min(380 * (280 / fs_rebar) - 2.5 * cover_ext; 300 * (280 / fs_rebar); 450; 3 * t_top * 1000)
s_max_bot_calc = min(380 * (280 / fs_rebar) - 2.5 * cover_ext; 300 * (280 / fs_rebar); 450; 3 * t_bot * 1000)
s_max_wall_calc = min(380 * (280 / fs_rebar) - 2.5 * cover_ext; 300 * (280 / fs_rebar); 450; 3 * t_wall * 1000)
#show

'<h4>1. 頂版斷面檢核（t_top = 't_top' m）</h4>
phi_Mn_top_mid = ru(phi_Mn_top_mid_calc)'kN*m <i>頂版跨中正抗彎容量 φMn</i>
phi_Mn_top_end = ru(phi_Mn_top_end_calc)'kN*m <i>頂版端部負抗彎容量 φMn</i>
phi_Vc_top = ru(phi_Vc_top_calc)'kN <i>頂版剪力容量 φVc</i>

UC_M_top_mid = Mu_top_mid / phi_Mn_top_mid
'<b style="color:'kleur(UC_M_top_mid)'">頂版跨中正彎矩檢核：UC = 'ru(UC_M_top_mid)' ≤ 1.0 → 'oordeel(UC_M_top_mid)'</b>

UC_M_top_end = Mu_top_end / phi_Mn_top_end
'<b style="color:'kleur(UC_M_top_end)'">頂版端部負彎矩檢核：UC = 'ru(UC_M_top_end)' ≤ 1.0 → 'oordeel(UC_M_top_end)'</b>

UC_V_top = Vu_top / phi_Vc_top
'<b style="color:'kleur(UC_V_top)'">頂版剪力強度檢核：UC = 'ru(UC_V_top)' ≤ 1.0 → 'oordeel(UC_V_top)'</b>

UC_As_top = As_min_top / As_top
'<b style="color:'kleur(UC_As_top)'">頂版最小鋼筋量檢核：UC = 'ru(UC_As_top)' ≤ 1.0 → 'oordeel(UC_As_top)'</b>

UC_s_top = s_top / s_max_top_calc
'<b style="color:'kleur(UC_s_top)'">頂版鋼筋間距上限檢核：UC = 'ru(UC_s_top)' ≤ 1.0 → 'oordeel(UC_s_top)'</b>

'<h4>2. 底版斷面檢核（t_bot = 't_bot' m）</h4>
phi_Mn_bot_mid = ru(phi_Mn_bot_mid_calc)'kN*m <i>底版跨中正抗彎容量 φMn</i>
phi_Mn_bot_end = ru(phi_Mn_bot_end_calc)'kN*m <i>底版端部負抗彎容量 φMn</i>
phi_Vc_bot = ru(phi_Vc_bot_calc)'kN <i>底版剪力容量 φVc</i>

UC_M_bot_mid = Mu_bot_mid / phi_Mn_bot_mid
'<b style="color:'kleur(UC_M_bot_mid)'">底版跨中正彎矩檢核：UC = 'ru(UC_M_bot_mid)' ≤ 1.0 → 'oordeel(UC_M_bot_mid)'</b>

UC_M_bot_end = Mu_bot_end / phi_Mn_bot_end
'<b style="color:'kleur(UC_M_bot_end)'">底版端部負彎矩檢核：UC = 'ru(UC_M_bot_end)' ≤ 1.0 → 'oordeel(UC_M_bot_end)'</b>

UC_V_bot = Vu_bot / phi_Vc_bot
'<b style="color:'kleur(UC_V_bot)'">底版剪力強度檢核：UC = 'ru(UC_V_bot)' ≤ 1.0 → 'oordeel(UC_V_bot)'</b>

UC_As_bot = As_min_bot / As_bot
'<b style="color:'kleur(UC_As_bot)'">底版最小鋼筋量檢核：UC = 'ru(UC_As_bot)' ≤ 1.0 → 'oordeel(UC_As_bot)'</b>

UC_s_bot = s_bot / s_max_bot_calc
'<b style="color:'kleur(UC_s_bot)'">底版鋼筋間距上限檢核：UC = 'ru(UC_s_bot)' ≤ 1.0 → 'oordeel(UC_s_bot)'</b>

'<h4>3. 側牆斷面檢核（t_wall = 't_wall' m）</h4>
phi_Mn_wall_mid = ru(phi_Mn_wall_mid_calc)'kN*m <i>側牆跨中正抗彎容量 φMn</i>
phi_Mn_wall_end = ru(phi_Mn_wall_end_calc)'kN*m <i>側牆端部負抗彎容量 φMn</i>
phi_Vc_wall = ru(phi_Vc_wall_calc)'kN <i>側牆剪力容量 φVc（保守不計軸壓提高）</i>
phi_Pn_wall = ru(phi_Pn_wall_calc)'kN <i>側牆純軸壓容量 φPn</i>

UC_M_wall_mid = Mu_wall_mid / phi_Mn_wall_mid
'<b style="color:'kleur(UC_M_wall_mid)'">側牆跨中正彎矩檢核：UC = 'ru(UC_M_wall_mid)' ≤ 1.0 → 'oordeel(UC_M_wall_mid)'</b>

UC_M_wall_end = Mu_wall_end / phi_Mn_wall_end
'<b style="color:'kleur(UC_M_wall_end)'">側牆端部負彎矩檢核：UC = 'ru(UC_M_wall_end)' ≤ 1.0 → 'oordeel(UC_M_wall_end)'</b>

UC_V_wall = Vu_wall / phi_Vc_wall
'<b style="color:'kleur(UC_V_wall)'">側牆剪力強度檢核：UC = 'ru(UC_V_wall)' ≤ 1.0 → 'oordeel(UC_V_wall)'</b>

UC_P_wall = Pu_wall / phi_Pn_wall
'<b style="color:'kleur(UC_P_wall)'">側牆軸壓容量檢核：UC = 'ru(UC_P_wall)' ≤ 1.0 → 'oordeel(UC_P_wall)'</b>

UC_As_wall = As_min_wall / As_wall
'<b style="color:'kleur(UC_As_wall)'">側牆最小鋼筋量檢核：UC = 'ru(UC_As_wall)' ≤ 1.0 → 'oordeel(UC_As_wall)'</b>

UC_s_wall = s_wall / s_max_wall_calc
'<b style="color:'kleur(UC_s_wall)'">側牆鋼筋間距上限檢核：UC = 'ru(UC_s_wall)' ≤ 1.0 → 'oordeel(UC_s_wall)'</b>

'<h3>七、構造細部、水理與穩定性檢核</h3>

'<h4>1. 45° 內角加腋與角隅補強</h4>
'<i>內角加腋建議邊長 c ≥ 0.15 m，並配置 D13 @ 200 mm 交叉斜筋：</i>
UC_chamfer = 0.15 / c_chamfer
'<b style="color:'kleur(UC_chamfer)'">45° 內角加腋尺寸檢核（≥ 0.15 m）：UC = 'ru(UC_chamfer)' ≤ 1.0 → 'oordeel(UC_chamfer)'</b>

'<h4>2. 滿流排水容量檢核（曼寧公式，swc_tech §84）</h4>
#hide
A_flow = B_clear * H_clear - 2 * (c_chamfer^2)'m^2 <i>通水淨斷面積（扣除 4 角加腋）</i>
P_flow = 2 * (B_clear + H_clear) - 8 * c_chamfer + 4 * (2^0.5) * c_chamfer'm <i>濕周</i>
R_flow = A_flow / P_flow'm <i>水力半徑</i>
Q_cap_calc = (1 / n_manning) * A_flow * (R_flow^(2/3)) * (S_slope^0.5)'m^3/s
#show
Q_cap = ru(Q_cap_calc)'m^3/s <i>滿流排水容量 Q_cap</i>
UC_Q = Q_design / Q_cap
'<b style="color:'kleur(UC_Q)'">排水通水容量檢核：UC_Q = 'ru(UC_Q)' ≤ 1.0 → 'oordeel(UC_Q)'</b>

'<h4>3. 地下水抗浮穩定性檢核</h4>
#hide
h_submerged = max(0; H_cover + H_outer - H_gw)'m
U_uplift = gamma_w * h_submerged * B_outer'kN/m <i>每延米總浮力</i>
W_concrete = gamma_c * (B_outer * H_outer - A_flow)'kN/m
W_soil_cover = gamma_s * H_cover * B_outer'kN/m
W_total_weight = W_concrete + W_soil_cover'kN/m
FS_float_calc = if(U_uplift ≤ 0.1; 999.0; W_total_weight / U_uplift)
UC_float_calc = if(U_uplift ≤ 0.1; 0.0; 1.20 / FS_float_calc)
#show
FS_float = ru(FS_float_calc)
UC_float = ru(UC_float_calc)
'<b style="color:'kleur(UC_float)'">抗浮安全係數檢核（FS = 'FS_float' ≥ 1.20）：UC = 'UC_float' ≤ 1.0 → 'oordeel(UC_float)'</b>

'<h4>4. 地盤容許承載力檢核</h4>
UC_bearing = q_base_service / qa_allow
'<b style="color:'kleur(UC_bearing)'">地盤承載力檢核：UC = 'ru(UC_bearing)' ≤ 1.0 → 'oordeel(UC_bearing)'</b>

'<h3>八、檢核總結與控制項目</h3>

#hide
UC_max_raw = max(UC_M_top_mid; UC_M_top_end; UC_V_top; UC_As_top; UC_s_top; UC_M_bot_mid; UC_M_bot_end; UC_V_bot; UC_As_bot; UC_s_bot; UC_M_wall_mid; UC_M_wall_end; UC_V_wall; UC_P_wall; UC_As_wall; UC_s_wall; UC_chamfer; UC_Q; UC_float; UC_bearing)
UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>九、總結</h3>
#if UC_geom > 1.0
    '<b>總結：無效輸入，未檢核</b>
#else if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>鋼筋混凝土箱涵設計與檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>鋼筋混凝土箱涵設計與檢核不合格</b>
#end if
`;
