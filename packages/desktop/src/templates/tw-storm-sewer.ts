/**
 * 雨水下水道圓形管渠水理與配置檢核（下水道工程設施標準 114.11.04 第 3、4、5、8 條）。
 *
 * 規範依據與資料等級：
 * 1. 水力計算採曼寧式 V = (1/n)·R^(2/3)·S^(1/2)；達計畫下水量時最小流速 0.8 m/s、
 *    最大流速 3.0 m/s（第 3 條；A 級已驗證表 sewer_std_storm_velocity_limits）。
 * 2. 圓形雨水管渠最小管徑 800 mm（第 4 條，B 級條文）。
 * 3. 最小覆土深度：圓形管 75 cm、鋼筋混凝土管 50 cm；箱涵無限制（第 5 條，B 級條文）。
 * 4. 人孔最大間距：管徑 ≤800 mm → 100 m；800～1200 mm → 150 m；>1200 mm → 200 m；
 *    管徑 ≥2500 mm 者每隔 500 m 設機械清掃孔；人孔入口內徑 ≥60 cm，深度 >50 cm 時
 *    漸增至 90 cm（第 8 條，B 級條文）。
 *
 * 圓形管渠部分滿流之水力半徑以 θ = 2·acos(1 − 2y/D) 之弓形斷面計算；水深比 y/D 由使用者
 * 依設計流量選定，本表不反算水深。本表不涵蓋雨水井、連接管、道路側溝、抽水站、滯洪設施與
 * 管渠結構設計，亦不檢核下游水面銜接與迴水。
 */

export const twStormSewer = `"雨水下水道圓形管渠水理與配置檢核（下水道工程設施標準 第 3、4、5、8 條）

'<i>依據內政部《下水道工程設施標準》（114 年 11 月 4 日修正）第 3 條（水力計算與流速）、第 4 條（最小斷面）、第 5 條（最小覆土深度）與第 8 條（人孔間距與入口內徑），檢核圓形雨水管渠之滿流容量、流速上下限與配置。雨水井、連接管、道路側溝、抽水站、滯洪設施、管渠結構設計與下游迴水均未納入。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 設計條件</h5>

Q_d = 0.850'm^3/s <i>計畫下水量 Q（m³/s；由計畫逕流量或合理化公式求得後輸入）</i>
D_p = 800'mm <i>圓形管渠內徑 D（mm；雨水管渠最小 800 mm）</i>
S_p = 0.005'- <i>管渠水力坡度 S（小數）</i>
n_p = 0.013'- <i>曼寧粗糙係數 n（混凝土管常用 0.013，須依管材選定）</i>
yr_p = 0.75'- <i>設計流量下之水深比 y/D（0 < y/D ≤ 1；由設計者依流量選定，本表不反算）</i>

<h5>2. 配置條件</h5>

cov_p = 1.20'm <i>管頂覆土深度（m）</i>
rcp_p = 1'- <i>是否為鋼筋混凝土管（1 = 是，最小覆土 50 cm；0 = 其他圓形管，75 cm）</i>
Lmh_p = 90'm <i>人孔設置間距（m）</i>
Dmh_p = 90'cm <i>人孔入口內徑（cm；最小 60 cm，深度 >50 cm 時 90 cm）</i>
Hmh_p = 180'cm <i>人孔入口深度（cm；>50 cm 時內徑須漸增至 90 cm）</i>
Lcl_p = 400'm <i>機械清掃孔間距（m；僅管徑 ≥2500 mm 時檢核）</i>

#hide
g_min = 0.8
g_max = 3.0
D_min = 800
cov_std = 0.75
cov_rcp = 0.50
ok_in = if(Q_d > 0 and D_p ≥ 300 and S_p > 0 and n_p > 0 and yr_p > 0 and yr_p ≤ 1 and cov_p ≥ 0 and Lmh_p > 0 and Dmh_p > 0 and Hmh_p > 0 and Lcl_p > 0 and (rcp_p ≡ 0 or rcp_p ≡ 1); 1; 0)
#show

#if ok_in > 0.5

<h5>3. 圓形斷面水理（曼寧式，第 3 條）</h5>
#hide
D_m = D_p/1000
theta = 2*acos(1 - 2*yr_p)
A_flow = (D_m^2/8)*(theta - sin(theta))
P_wet = D_m*theta/2
R_hyd = A_flow/P_wet
V_flow = (1/n_p)*(R_hyd^(2/3))*(S_p^0.5)
Q_cap = A_flow*V_flow
A_full = pi*D_m^2/4
V_full = (1/n_p)*((D_m/4)^(2/3))*(S_p^0.5)
Q_full = A_full*V_full
#show
D_out = D_m'm <i>管渠內徑 D（m）</i>
theta_out = theta'rad <i>水面夾角 θ = 2·acos(1 − 2y/D)（rad）</i>
A_out = A_flow'm^2 <i>通水面積 A = (D²/8)(θ − sin θ)（m²）</i>
P_out = P_wet'm <i>濕周 P = Dθ/2（m）</i>
R_out = R_hyd'm <i>水力半徑 R = A/P（m）</i>
V_out = V_flow'm/s <i>流速 V = (1/n)R^(2/3)S^(1/2)（m/s）</i>
Q_out = Q_cap'm^3/s <i>於水深比 y/D 下之通水能力 Q_cap（m³/s）</i>
Vfull_out = V_full'm/s <i>滿管流速（m/s；供對照）</i>
Qfull_out = Q_full'm^3/s <i>滿管容量（m³/s；供對照）</i>

<h5>4. 最小斷面、覆土與人孔（第 4、5、8 條）</h5>
#hide
cov_req = if(rcp_p ≡ 1; cov_rcp; cov_std)
mh_max = if(D_p ≤ 800; 100; if(D_p ≤ 1200; 150; 200))
dmh_req = if(Hmh_p > 50; 90; 60)
cl_req = if(D_p ≥ 2500; 500; 0)

UC_D = D_min/D_p
UC_cov = cov_req/cov_p
UC_cap = Q_d/Q_cap
UC_vmin = g_min/V_flow
UC_vmax = V_flow/g_max
UC_mh = Lmh_p/mh_max
UC_mhd = dmh_req/Dmh_p
UC_cl = if(D_p ≥ 2500; Lcl_p/cl_req; 0)
UC_max = ru(max(UC_D; max(UC_cov; max(UC_cap; max(UC_vmin; max(UC_vmax; max(UC_mh; max(UC_mhd; UC_cl))))))))
#show
cov_req_out = cov_req'm <i>最小覆土深度（m；圓形管 0.75 m、鋼筋混凝土管 0.50 m）</i>
mh_max_out = mh_max'm <i>人孔最大間距（m；管徑 ≤800 → 100、800～1200 → 150、>1200 → 200）</i>
dmh_req_out = dmh_req'cm <i>人孔入口最小內徑（cm；深度 >50 cm 時 90 cm）</i>
Vmin_out = g_min'm/s <i>最小流速（m/s；第 3 條）</i>
Vmax_out = g_max'm/s <i>最大流速（m/s；第 3 條）</i>

<h5>5. Unity Checks</h5>
'<b style="color:'kleur(UC_D)'">最小管徑 D ≥ 800 mm：UC = 'ru(UC_D)' → 'oordeel(UC_D)'</b>
'<b style="color:'kleur(UC_cov)'">管頂覆土深度：UC = 'ru(UC_cov)' → 'oordeel(UC_cov)'</b>
'<b style="color:'kleur(UC_cap)'">通水能力 Q_cap ≥ Q：UC = 'ru(UC_cap)' → 'oordeel(UC_cap)'</b>
'<b style="color:'kleur(UC_vmin)'">最小流速 V ≥ 0.8 m/s：UC = 'ru(UC_vmin)' → 'oordeel(UC_vmin)'</b>
'<b style="color:'kleur(UC_vmax)'">最大流速 V ≤ 3.0 m/s：UC = 'ru(UC_vmax)' → 'oordeel(UC_vmax)'</b>
'<b style="color:'kleur(UC_mh)'">人孔間距：UC = 'ru(UC_mh)' → 'oordeel(UC_mh)'</b>
'<b style="color:'kleur(UC_mhd)'">人孔入口內徑：UC = 'ru(UC_mhd)' → 'oordeel(UC_mhd)'</b>
#if D_p ≥ 2500
'<b style="color:'kleur(UC_cl)'">機械清掃孔間距 ≤ 500 m：UC = 'ru(UC_cl)' → 'oordeel(UC_cl)'</b>
#end if

<h5>6. 總結與未涵蓋事項</h5>
'<i>流速上下限以達計畫下水量時計；管渠材質或結構特殊者，第 3 條但書得不受 0.8～3.0 m/s 限制，本表未另設開關。箱涵（矩形斷面）之最小淨寬淨高 1200 mm 與無覆土限制由 tw-box-culvert 另行檢核。最小覆土不足時第 5 條第 3 款要求以混凝土或鋼筋混凝土補強，本表僅判不合格，不作補強設計。</i>
#if UC_max ≤ 1.0
'<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>雨水下水道管渠水理與配置檢核合格</b>
#else
'<b>控制 UC = 'UC_max'</b> > 1.0 → <b>雨水下水道管渠水理與配置檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。計畫下水量、坡度、粗糙係數、水深比、人孔間距、入口內徑、入口深度與機械清掃孔間距均須大於零；水深比須在 0～1 之間；管徑須 ≥ 300 mm；覆土深度不得為負。
#end if
`;
