export const twRetainingWall = `"鋼筋混凝土懸臂式擋土牆設計與檢核（found112 / swc_tech / rc112）

'<i>依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）第7章、農業部《水土保持技術規範》（114年5月7日版，swc_tech）第117～121條及《建築物混凝土結構設計規範》（112年8月10日版，rc112）第11、13、20、24章，提供懸臂式鋼筋混凝土擋土牆之完整外在穩定性（抗傾覆、抗滑動、基底偏心合力位置、地盤容許承載力）與內部截面結構強度（立壁底彎矩與剪力、底版前趾彎矩與剪力、底版後踵彎矩與剪力、各部配筋量與溫度收縮筋）及排水伸縮縫細部構造檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、設計條件與輸入參數</h3>

'<h4>1. 幾何尺寸</h4>
H_wall = ?{5.0}', 擋土牆總高度 H（水土保持技術規範 §118 四：懸臂式以 8 m 以下為原則）（m）'
B_base = ?{3.2}', 基礎底版總寬度 B（建議約 0.5H～0.7H）（m）'
h_base = ?{0.5}', 基礎底版厚度 h_b（m）'
L_toe = ?{0.9}', 牆趾前伸長度 L_toe（m）'
t_top = ?{0.3}', 立壁頂端厚度 t_top（rc112 §11.3.1.1 規定外牆 ≥ 0.20 m）（m）'
t_stem = ?{0.5}', 立壁底部厚度 t_stem（m）'
D_soil_toe = ?{0.8}', 牆趾前方覆土埋置深度 D_f（m）'

h_stem = H_wall - h_base
L_heel = B_base - L_toe - t_stem

'立壁高度：h_stem = 'h_stem' m
'後踵長度：L_heel = 'L_heel' m

'<h4>2. 土壤與回填載重條件</h4>
gamma_s = ?{19.0}', 回填土單位重 γ_s（kN/m^3）'
phi_deg = ?{32}', 回填土有效內摩擦角 φ'
q_surcharge = ?{10.0}', 牆頂地表等效活載重超載 q_sur（kN/m^2）'
qa_allow = ?{220.0}', 地盤容許承載力 q_a（長期載重）（kN/m^2）'
mu_base = ?{0.55}', 基底土壤摩擦係數 μ（found112 表 4.6-1：粗砂、碎石約 0.55；中砂約 0.50；細砂粉土約 0.45）'

'<h4>3. 材料性質與保護層</h4>
fc_kpa = 28000'kN/m^2 <i>混凝土規定抗壓強度 f'c（28 MPa = 28000 kN/m²）</i>
fy_kpa = 420000'kN/m^2 <i>鋼筋規定降伏強度 fy（SD420 = 420 MPa = 420000 kN/m²）</i>
gamma_c = 24.0'kN/m^3 <i>鋼筋混凝土單位重 γ_c</i>
fc_mpa = fc_kpa / 1000
fy_mpa = fy_kpa / 1000

'<h4>4. 鋼筋配置參數</h4>
'立壁垂直主筋直徑（mm）：
db_stem = 22.2'mm <i>（D22 鋼筋，單根面積 387.1 mm²）</i>
Ab_stem = 387.1'mm^2
s_stem = 150'mm <i>立壁垂直受拉主筋間距 s_stem</i>

'前趾底層受拉主筋直徑（mm）：
db_toe = 19.1'mm <i>（D19 鋼筋，單根面積 286.5 mm²）</i>
Ab_toe = 286.5'mm^2
s_toe = 150'mm <i>前趾受拉主筋間距 s_toe</i>

'後踵頂層受拉主筋直徑（mm）：
db_heel = 19.1'mm <i>（D19 鋼筋，單根面積 286.5 mm²）</i>
Ab_heel = 286.5'mm^2
s_heel = 150'mm <i>後踵受拉主筋間距 s_heel</i>

'<h3>二、土壓力計算（主動土壓力）</h3>
'<i>依建築物基礎構造設計規範 §7.3.2（Rankine 主動土壓力，水平地表）</i>

Ka = tan(45*deg - phi_deg*deg/2)^2
'主動土壓力係數：Ka = 'ru(Ka)'

'牆背虛擬垂直面（過後踵後緣高 H）主動土壓力合力：
P_A_soil = 0.5 * Ka * gamma_s * H_wall^2
P_A_sur = Ka * q_surcharge * H_wall
P_ah = P_A_soil + P_A_sur

'填土自重水平推力：P_A_soil = 'ru(P_A_soil)' kN/m，作用高度 y1 = H/3 = 'ru(H_wall/3)' m
'地表超載水平推力：P_A_sur = 'ru(P_A_sur)' kN/m，作用高度 y2 = H/2 = 'ru(H_wall/2)' m
'總水平主動側推力：P_ah = 'ru(P_ah)' kN/m

'對前趾點 O 之總傾覆力矩 M_O：
M_O = P_A_soil * (H_wall / 3) + P_A_sur * (H_wall / 2)
'總傾覆力矩：M_O = 'ru(M_O)' kN·m/m

'<h3>三、垂直載重與抵抗力矩分析（對前趾點 O）</h3>

'<i>各分項構件自重與作用臂長（O 點至重心水平距離）：</i>
'1. 立壁矩形部分（厚 t_top，高 h_stem）：
W_1 = gamma_c * t_top * h_stem
arm_1 = L_toe + (t_stem - t_top) + t_top / 2
M_R1 = W_1 * arm_1

'2. 立壁前側三角形部分（厚 t_stem - t_top，高 h_stem）：
W_2 = 0.5 * gamma_c * (t_stem - t_top) * h_stem
arm_2 = L_toe + (2 / 3) * (t_stem - t_top)
M_R2 = W_2 * arm_2

'3. 基礎底版（寬 B，厚 h_base）：
W_3 = gamma_c * B_base * h_base
arm_3 = B_base / 2
M_R3 = W_3 * arm_3

'4. 後踵上方填土重（寬 L_heel，高 h_stem）：
W_4 = gamma_s * L_heel * h_stem
arm_4 = B_base - L_heel / 2
M_R4 = W_4 * arm_4

'5. 後踵上方地表超載（寬 L_heel）：
W_sur = q_surcharge * L_heel
arm_sur = B_base - L_heel / 2
M_Rsur = W_sur * arm_sur

'6. 前趾上方覆土重（覆土厚度 max(D_soil_toe - h_base, 0)）：
h_toe_soil = if(D_soil_toe > h_base; D_soil_toe - h_base; 0)
W_toe_soil = gamma_s * L_toe * h_toe_soil
arm_toe = L_toe / 2
M_Rtoe = W_toe_soil * arm_toe

sum_V = W_1 + W_2 + W_3 + W_4 + W_sur + W_toe_soil
sum_MR = M_R1 + M_R2 + M_R3 + M_R4 + M_Rsur + M_Rtoe

'總垂直載重：ΣV = 'ru(sum_V)' kN/m
'總抵抗力矩：ΣM_R = 'ru(sum_MR)' kN·m/m

'<h3>四、擋土牆整體外在穩定性檢核</h3>

'<h4>1. 抗傾覆穩定檢核（found112 §7.4.2 & swc_tech §120）</h4>
'<i>規範要求：抵抗力矩與傾倒力矩比值，常時安全係數 FS_ot ≥ 2.0</i>
FS_ot = sum_MR / M_O
UC_ot = 2.0 / FS_ot
'抗傾覆安全係數：FS_ot = 'ru(FS_ot)' （≥ 2.0）
'<b style="color:'kleur(UC_ot)'">抗傾覆檢核：UC_ot = 'ru(UC_ot)' → 'oordeel(UC_ot)'</b>

'<h4>2. 基底抗滑動穩定檢核（found112 §7.4.1 & swc_tech §120）</h4>
'<i>規範要求：基底抵抗摩擦力與水平推力比值，常時安全係數 FS_sl ≥ 1.5</i>
R_friction = mu_base * sum_V
FS_sl = R_friction / P_ah
UC_sl = 1.5 / FS_sl
'基底摩擦抵抗力：R_f = 'ru(R_friction)' kN/m
'抗滑動安全係數：FS_sl = 'ru(FS_sl)' （≥ 1.5）
'<b style="color:'kleur(UC_sl)'">抗滑動檢核：UC_sl = 'ru(UC_sl)' → 'oordeel(UC_sl)'</b>

'<h4>3. 合力偏心距與核心區檢核（found112 §4.3 & swc_tech §120 二(二)）</h4>
'<i>規範要求：土層基礎合力作用點必須在基礎底寬三分之一中段內（偏心距 e ≤ B/6），以確保基底無受拉揚起。</i>
x_R = (sum_MR - M_O) / sum_V
e_base = B_base / 2 - x_R
e_limit = B_base / 6
UC_ecc = abs(e_base) / e_limit

'合力作用點位置（距前趾 O 點）：x_R = 'ru(x_R)' m
'偏心距：e = 'ru(e_base)' m（核心區上限 e_lim = B/6 = 'ru(e_limit)' m）
'<b style="color:'kleur(UC_ecc)'">合力偏心檢核：UC_ecc = 'ru(UC_ecc)' → 'oordeel(UC_ecc)'</b>

'<h4>4. 地盤接觸應力與承載力檢核（found112 §4.1 & swc_tech §120 三）</h4>
'<i>依式(解4.1-1)計算前趾與後踵處之地盤接觸應力：</i>
q_toe = (sum_V / B_base) * (1 + 6 * e_base / B_base)
q_heel = (sum_V / B_base) * (1 - 6 * e_base / B_base)
q_max = if(q_toe > q_heel; q_toe; q_heel)
UC_bearing = q_max / qa_allow

'牆趾處接觸應力：q_toe = 'ru(q_toe)' kN/m²
'後踵處接觸應力：q_heel = 'ru(q_heel)' kN/m²
'最大接觸應力：q_max = 'ru(q_max)' kN/m²（容許承載力 q_a = 'qa_allow' kN/m²）
'<b style="color:'kleur(UC_bearing)'">地盤承載力檢核：UC_bearing = 'ru(UC_bearing)' → 'oordeel(UC_bearing)'</b>

'<h3>五、立壁結構截面強度檢核（rc112 / USD）</h3>

'<h4>1. 立壁底端設計載重（高 h_stem）</h4>
'<i>載重係數：側向土壓力與超載採 1.6（rc112 表 5.3.1）</i>
P_A_stem = 0.5 * Ka * gamma_s * h_stem^2
P_sur_stem = Ka * q_surcharge * h_stem

M_u_stem = 1.6 * (P_A_stem * (h_stem / 3) + P_sur_stem * (h_stem / 2))
V_u_stem = 1.6 * (P_A_stem + P_sur_stem)

'因數化立壁底端設計彎矩：M_u_stem = 'ru(M_u_stem)' kN·m/m
'因數化立壁底端設計剪力：V_u_stem = 'ru(V_u_stem)' kN/m

'<h4>2. 立壁有效深度與剪力強度檢核（rc112 §13.2.6 & §22.5）</h4>
'<i>接觸土層混凝土保護層採 50 mm（表 20.5.1.3.1）</i>
cover_stem = 50'mm
d_stem = t_stem * 1000 - cover_stem - db_stem / 2

phi_v = 0.75
phi_Vc_stem = phi_v * 0.17 * 1.0 * sqrt(fc_mpa) * 1000 * d_stem / 1000
UC_v_stem = V_u_stem / phi_Vc_stem

'立壁有效深度：d_stem = 'ru(d_stem)' mm
'立壁單向剪力強度：ϕVc = 'ru(phi_Vc_stem)' kN/m
'<b style="color:'kleur(UC_v_stem)'">立壁剪力檢核：UC_v_stem = 'ru(UC_v_stem)' → 'oordeel(UC_v_stem)'</b>

'<h4>3. 立壁抗彎撓曲容量檢核（rc112 §11.6 & §22.2）</h4>
As_stem = (1000 / s_stem) * Ab_stem
As_min_stem = 0.0018 * 1000 * (t_stem * 1000)
UC_rhos_stem = As_min_stem / As_stem

'垂直配置鋼筋面積：As = 'ru(As_stem)' mm²/m（最小鋼筋量 As,min = 'ru(As_min_stem)' mm²/m）
'<b style="color:'kleur(UC_rhos_stem)'">立壁最小鋼筋量檢核：UC_rhos_stem = 'ru(UC_rhos_stem)' → 'oordeel(UC_rhos_stem)'</b>

a_stem = (As_stem * fy_mpa) / (0.85 * fc_mpa * 1000)
phi_m = 0.90
phi_Mn_stem = phi_m * As_stem * fy_mpa * (d_stem - a_stem / 2) / 10^6
UC_m_stem = M_u_stem / phi_Mn_stem

'應力塊深度：a = 'ru(a_stem)' mm
'設計抗彎強度：ϕMn = 'ru(phi_Mn_stem)' kN·m/m
'<b style="color:'kleur(UC_m_stem)'">立壁抗彎檢核：UC_m_stem = 'ru(UC_m_stem)' → 'oordeel(UC_m_stem)'</b>

'<h3>六、基礎底版結構截面強度檢核（rc112）</h3>

'<h4>1. 底版前趾斷面檢核（Toe slab，懸臂長 L_toe）</h4>
'<i>立壁前緣處地盤應力 q_front，地盤向上反力因數 1.6，扣除底版與覆土自重因數 1.2</i>
q_front = q_heel + (q_toe - q_heel) * ((B_base - L_toe) / B_base)
w_toe_down = gamma_c * h_base + gamma_s * h_toe_soil

qu_toe_net = 1.6 * q_toe - 1.2 * w_toe_down
qu_front_net = 1.6 * q_front - 1.2 * w_toe_down

V_u_toe = ((qu_toe_net + qu_front_net) / 2) * L_toe
M_u_toe = qu_front_net * (L_toe^2 / 2) + (qu_toe_net - qu_front_net) * (L_toe^2 / 3)

'前趾設計剪力：V_u_toe = 'ru(V_u_toe)' kN/m
'前趾設計彎矩：M_u_toe = 'ru(M_u_toe)' kN·m/m

cover_base_bottom = 75'mm <i>貼地澆置保護層 75 mm（表 20.5.1.3.1）</i>
d_toe = h_base * 1000 - cover_base_bottom - db_toe / 2

phi_Vc_toe = phi_v * 0.17 * 1.0 * sqrt(fc_mpa) * 1000 * d_toe / 1000
UC_v_toe = V_u_toe / phi_Vc_toe

'前趾有效深度：d_toe = 'ru(d_toe)' mm
'前趾剪力強度：ϕVc = 'ru(phi_Vc_toe)' kN/m
'<b style="color:'kleur(UC_v_toe)'">前趾剪力檢核：UC_v_toe = 'ru(UC_v_toe)' → 'oordeel(UC_v_toe)'</b>

As_toe = (1000 / s_toe) * Ab_toe
As_min_base = 0.0018 * 1000 * (h_base * 1000)
UC_rhos_toe = As_min_base / As_toe

a_toe = (As_toe * fy_mpa) / (0.85 * fc_mpa * 1000)
phi_Mn_toe = phi_m * As_toe * fy_mpa * (d_toe - a_toe / 2) / 10^6
UC_m_toe = M_u_toe / phi_Mn_toe

'前趾底層配置鋼筋量：As = 'ru(As_toe)' mm²/m
'前趾設計抗彎強度：ϕMn = 'ru(phi_Mn_toe)' kN·m/m
'<b style="color:'kleur(UC_m_toe)'">前趾抗彎檢核：UC_m_toe = 'ru(UC_m_toe)' → 'oordeel(UC_m_toe)'</b>

'<h4>2. 底版後踵斷面檢核（Heel slab，懸臂長 L_heel）</h4>
'<i>後踵上方回填土重與底版自重向下因數 1.2、超載因數 1.6，保守考量地盤向上反力因數 1.0</i>
q_stem_back = q_heel + (q_toe - q_heel) * (L_heel / B_base)
wu_heel_down = 1.2 * (gamma_c * h_base + gamma_s * h_stem) + 1.6 * q_surcharge

V_u_heel = wu_heel_down * L_heel - 1.0 * ((q_stem_back + q_heel) / 2) * L_heel
M_u_heel = wu_heel_down * (L_heel^2 / 2) - 1.0 * (q_heel * (L_heel^2 / 2) + (q_stem_back - q_heel) * (L_heel^2 / 6))

'後踵設計剪力：V_u_heel = 'ru(V_u_heel)' kN/m
'後踵設計彎矩：M_u_heel = 'ru(M_u_heel)' kN·m/m

cover_base_top = 50'mm <i>頂面接觸土壤保護層 50 mm</i>
d_heel = h_base * 1000 - cover_base_top - db_heel / 2

phi_Vc_heel = phi_v * 0.17 * 1.0 * sqrt(fc_mpa) * 1000 * d_heel / 1000
UC_v_heel = V_u_heel / phi_Vc_heel

'後踵有效深度：d_heel = 'ru(d_heel)' mm
'後踵剪力強度：ϕVc = 'ru(phi_Vc_heel)' kN/m
'<b style="color:'kleur(UC_v_heel)'">後踵剪力檢核：UC_v_heel = 'ru(UC_v_heel)' → 'oordeel(UC_v_heel)'</b>

As_heel = (1000 / s_heel) * Ab_heel
UC_rhos_heel = As_min_base / As_heel

a_heel = (As_heel * fy_mpa) / (0.85 * fc_mpa * 1000)
phi_Mn_heel = phi_m * As_heel * fy_mpa * (d_heel - a_heel / 2) / 10^6
UC_m_heel = M_u_heel / phi_Mn_heel

'後踵頂層配置鋼筋量：As = 'ru(As_heel)' mm²/m
'後踵設計抗彎強度：ϕMn = 'ru(phi_Mn_heel)' kN·m/m
'<b style="color:'kleur(UC_m_heel)'">後踵抗彎檢核：UC_m_heel = 'ru(UC_m_heel)' → 'oordeel(UC_m_heel)'</b>

'<h3>七、細部構造與水土保持技術規範檢核</h3>

'<h4>1. 鋼筋最大間距檢核（rc112 §11.7.2.1）</h4>
'<i>牆垂直及水平主筋間距不得大於 3h 及 450 mm 之較小值：</i>
s_limit_stem = if(3 * t_stem * 1000 < 450; 3 * t_stem * 1000; 450)
UC_space_stem = s_stem / s_limit_stem
'立壁垂直筋間距上限：s_limit = 's_limit_stem' mm（配置 s = 's_stem' mm）
'<b style="color:'kleur(UC_space_stem)'">立壁鋼筋間距檢核：UC_space_stem = 'ru(UC_space_stem)' → 'oordeel(UC_space_stem)'</b>

'<h4>2. 排水孔配置檢核（水土保持技術規範 §121 第一項）</h4>
'<i>非透水性之擋土牆，應設直徑五公分以上之排水孔，每二平方公尺至少一孔，並應有防止阻塞之設施。</i>
drain_dia = 60'mm <i>排水孔直徑（規範規定 ≥ 50 mm，工程常用 60～100 mm PVC 管）</i>
drain_spacing_h = 1.5'm <i>排水孔水平間距</i>
drain_spacing_v = 1.2'm <i>排水孔垂直間距</i>
drain_area_per_hole = drain_spacing_h * drain_spacing_v
UC_drain_dia = 50 / drain_dia
UC_drain_area = drain_area_per_hole / 2.0
UC_drain = if(UC_drain_dia > UC_drain_area; UC_drain_dia; UC_drain_area)
'單一排水孔擔當面積：'ru(drain_area_per_hole)' m²（規範規定 ≤ 2.0 m²）
'<b style="color:'kleur(UC_drain)'">排水孔檢核：UC_drain = 'ru(UC_drain)' → 'oordeel(UC_drain)'</b>

'<h4>3. 伸縮縫設置間距（水土保持技術規範 §121 第二項）</h4>
'<i>擋土牆長度每二十公尺至四十公尺應加設伸縮縫一處。</i>
joint_spacing = 25.0'm <i>伸縮縫配置間距（規範規定 20～40 m 設一處）</i>
UC_joint = if(joint_spacing > 40; joint_spacing / 40; if(joint_spacing < 20; 20 / joint_spacing; 0.5))
'伸縮縫配置間距：'joint_spacing' m（符合 20～40 m 間距規定）
'<b style="color:'kleur(UC_joint)'">伸縮縫檢核：UC_joint = 'ru(UC_joint)' → 'oordeel(UC_joint)'</b>

#hide
UC_stab_max = if(UC_ot > UC_sl; UC_ot; UC_sl)
UC_stab_max2 = if(UC_stab_max > UC_ecc; UC_stab_max; UC_ecc)
UC_stab_max3 = if(UC_stab_max2 > UC_bearing; UC_stab_max2; UC_bearing)

UC_rc_max1 = if(UC_v_stem > UC_m_stem; UC_v_stem; UC_m_stem)
UC_rc_max2 = if(UC_rc_max1 > UC_v_toe; UC_rc_max1; UC_v_toe)
UC_rc_max3 = if(UC_rc_max2 > UC_m_toe; UC_rc_max2; UC_m_toe)
UC_rc_max4 = if(UC_rc_max3 > UC_v_heel; UC_rc_max3; UC_v_heel)
UC_rc_max5 = if(UC_rc_max4 > UC_m_heel; UC_rc_max4; UC_m_heel)
UC_rc_max6 = if(UC_rc_max5 > UC_rhos_stem; UC_rc_max5; UC_rhos_stem)
UC_rc_max7 = if(UC_rc_max6 > UC_space_stem; UC_rc_max6; UC_space_stem)

UC_det_max = if(UC_drain > UC_joint; UC_drain; UC_joint)

UC_calc_max = if(UC_stab_max3 > UC_rc_max7; UC_stab_max3; UC_rc_max7)
UC_max_raw = if(UC_calc_max > UC_det_max; UC_calc_max; UC_det_max)

'幾何健全度檢核：
UC_geom1 = if(H_wall ≤ 8.0; 0.5; 1.5) <i>懸臂式有效高限 8 m（swc_tech §118）</i>
UC_geom2 = if(L_heel > 0; 0.5; 2.0)
UC_geom3 = if(t_stem ≥ t_top; 0.5; 2.0)
UC_geom = if(UC_geom1 > UC_geom2; UC_geom1; if(UC_geom2 > UC_geom3; UC_geom2; UC_geom3))

UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>八、總結</h3>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>擋土牆檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>擋土牆檢核不合格</b>
#end if
`;
