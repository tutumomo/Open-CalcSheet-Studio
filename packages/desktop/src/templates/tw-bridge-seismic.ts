/**
 * 公路橋梁耐震設計檢核（hwbridgeseis108 第八章）— 地盤不穩定、地震土壓／動水壓與梁端防落。
 *
 * 規範條文與來源（B 級官方來源，逐列記於 docs/tw/規範來源.md §5.21）：
 * 1. 液化判定（8.1.2 式 8-1）：FL = RS/LS，FL < 1.0 判定可能液化；土壤參數折減（8.1.3 表 8-1）。
 * 2. 極軟弱土層（8.1.1）：單軸壓縮強度 ≤ 20 kPa（0.2 kgf/cm²）判定為極軟弱土層，土壤參數為零。
 * 3. 地震土壓力（8.2 式 8-2～8-5）：θ0 = tan⁻¹kh、kh 可取 0.2·S_II,S（錨碇或設斜樁之橋台，
 *    解說 C8.2 依 AASHTO-1996 建議取 0.6·S_II,S）。
 *    注意：條文式 8-2 之 q′ 項未附平方根（q′·K_EA），且式 8-3／8-5 分母為
 *    cosθ0·cos²θ·cos(θ+θ0+δ)·[1+√(…)]²，與 Mononobe–Okabe 常用式（q′·√K_EA、cos²θ0、括號不平方）不同；
 *    本表以 @select 提供兩式，預設採條文式。
 * 4. 地震動水壓（8.3 式 8-6～8-9）：單側臨水 P = (7/12)·kh·γw·b·h²、hg = (2/5)h（kh 取 0.4·S_II,S）；
 *    四周環水依 b/h 分三式（8-8a/b/c，皆含 b/t 因子）、hg = (3/7)h。
 * 5. 梁端防落長度（8.5 式 8-10、8-11）：活動支承 LN ≥ max(LNmin; uR + uG)、固定支承 LN ≥ LNmin；
 *    LNmin = (50 + 0.25L + 1.0H)·(1 + S²/8000)、uR = √(uR1² + uR2²)、uG = εG·Le·S_III,S/S_II,S，
 *    εG：第一類地盤 0.0025、第二類 0.00375、第三類 0.005、臺北盆地 0.00625。
 * 6. 梁端間隙（8.6 式 8-12）與伸縮裝置伸縮量（8.7 式 8-13）：
 *    SB ≥ uS + LA（橋台）或 cφ·uS + LA（同橋墩相鄰兩主梁）；LE ≥ uJ + LA 或 cφ·uJ + LA；
 *    LA = 1.5 cm；cφ 依表 7-2（ΔT/T1 ≤ 0.1 → 1.0、0.1～0.8 → 1.4、0.8～1.0 → 1.0，ΔT = T1 − T2，T1 ≥ T2）。
 * 7. 本表未涵蓋（須另行檢討）：設計總橫力與分布（第 2 章）、分析方法與韌性（第 3～5 章）、隔震（第 7 章）、
 *    液化後流動化之定量分析（8.1.4）、防止落橋裝置之降伏強度檢核（8.5 第 1 項）。
 * 8. 單位：本表以 SI 計算（kPa、kN、m）；梁端防落長度、間隙與伸縮量依規範以 cm 表示。
 *
 * 結尾行：「控制 UC = … → 橋梁耐震（第八章）檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twBridgeSeismic = `"公路橋梁耐震設計檢核（hwbridgeseis108 第八章）

'<i>依據交通部《公路橋梁耐震設計規範》（108.01.14 修正，hwbridgeseis108）第八章，檢核液化與土壤參數折減、地震土壓力、地震動水壓、梁端防落長度、梁端間隙與伸縮裝置伸縮量。設計總橫力、韌性分析、隔震與液化後流動化須另行檢討。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 工址與設計地震參數</h5>

S_II_S = 1.0'- <i>等級 II 地震工址短週期水平譜加速度係數 S_II,S（依本規範 2.3.2 計算，設計者填入）</i>
S_III_S = 1.0'- <i>等級 III 地震工址短週期水平譜加速度係數 S_III,S（依本規範 2.3.3 計算，設計者填入）</i>

@select gr_typ "工址地盤種類（8.5.1 地盤變位係數 εG 用）"
  第一類地盤 = 1
  第二類地盤 = 2
  第三類地盤 = 3
  臺北盆地 = 4
@end

<h5>2. 液化判定與土壤參數折減（8.1）</h5>
<p class="calc-uitleg">液化評估之 R_S、L_S 屬「會改變合格與否之重要假設」，須由設計者依工址鑽探與液化分析填入，不可預設為安全數值。</p>

qu_c = 20'- <i>黏土或粉土層單軸壓縮強度 q_u（kPa；≤ 20 kPa 即 0.2 kgf/cm² 判定為極軟弱土層，8.1.1）</i>
RS_liq = 1.2'- <i>土壤抵抗液化剪應力強度與有效覆土壓力之比值 R_S（8.1.2 式 8-1）</i>
LS_liq = 1.0'- <i>地震引致土壤剪應力與有效覆土壓力之比值 L_S</i>
x_liq = 5'- <i>液化評估土層距地表面之深度 x（m；表 8-1 適用 0～20 m）</i>

<h5>3. 地震土壓力（8.2 式 8-2～8-5）</h5>

@select mo_form "地震土壓力計算式版本"
  條文式 8-2～8-5（q′ 項未附平方根；分母 cosθ0·cos²θ·cos(θ+θ0+δ)·[1+√(…)]²） = 1
  Mononobe-Okabe 常用式（q′·√K；cos²θ0；括號不平方） = 2
@end

kh_ea_in = 0'- <i>地震土壓用水平加速度係數 k_h（8.2 條文取 0.2·S_II,S；錨碇或設斜樁之橋台依解說 C8.2 取 0.6·S_II,S）；填 0 時自動採 0.2·S_II,S</i>
phi_s = 30'- <i>土壤摩擦角 φ（deg）</i>
alpha_g = 0'- <i>地表面與水平面之夾角 α（deg）</i>
theta_w = 0'- <i>擋土牆（橋台）背面與垂直面之夾角 θ（deg）</i>
delta_w = 0'- <i>擋土牆背面與填土間之摩擦角 δ（deg）</i>
c_soil = 0'- <i>土壤凝聚力 c（kPa；耐震設計用土壤參數，液化時須先依表 8-1 折減後填入）</i>
gamma_s = 18'- <i>土壤單位重 γ（kN/m³）</i>
q_sur = 0'- <i>地震時地表之加載 q′（kPa）</i>
H_ret = 5'- <i>擋土牆（橋台）背面土層高度 H（m）</i>

<h5>4. 地震動水壓（8.3 式 8-6～8-9）</h5>

@select water_form "臨水情形"
  單側臨水（8-6、8-7） = 1
  四周環水（8-8a/b/c、8-9） = 2
@end

h_w = 3'- <i>水深 h（m）</i>
b_w = 10'- <i>與動水壓作用方向垂直之結構物寬度 b（m）</i>
t_w = 3'- <i>動水壓作用方向結構物之厚度 t（m；四周環水時使用）</i>
A0_w = 30'- <i>下部結構之斷面積 A0（m²；四周環水時使用）</i>
gamma_w = 9.81'- <i>水之單位重 γw（kN/m³）</i>

<h5>5. 梁端防落長度（8.5 式 8-10、8-11）</h5>

@select bear_form "支承型式"
  活動支承（LN ≥ max(LNmin; uR + uG)） = 1
  固定支承（LN ≥ LNmin） = 2
@end

L_span = 30'- <i>跨徑 L（m）</i>
H_sub = 8'- <i>基面起算下部結構之高度 H（m；橋台採鄰近橋墩高度，單跨橋取 0）</i>
S_skew = 0'- <i>橋墩之斜角 S（deg；橋墩橫向支承連線與垂直橋軸方向之夾角）</i>
uR1 = 5'- <i>振動單元 1 之最大變位 u_R1（cm；等級 III 地震）</i>
uR2 = 3'- <i>振動單元 2 之最大變位 u_R2（cm；等級 III 地震）</i>
Le_eff = 3000'- <i>影響梁端防落長度之下部結構間距 L_e（cm）</i>
LN_use = 75'- <i>設計採用之梁端防落長度 L_N（cm）</i>

<h5>6. 梁端間隙與伸縮裝置（8.6 式 8-12、8.7 式 8-13）</h5>

@select gap_form "間隙位置"
  主梁與橋台間（uS + LA） = 1
  同一橋墩上相鄰兩主梁間（cφ·uS + LA） = 2
@end

uS_gap = 4'- <i>等級 II 地震引致之主梁與橋台間相對位移（或同一橋墩相鄰兩主梁位移之大值）u_S（cm）</i>
uJ_exp = 2.5'- <i>等級 I 地震引致之相對位移 u_J（cm）</i>
T1_p = 0.8'- <i>相鄰兩振動單元較大之基本振動週期 T1（s）</i>
T2_p = 0.6'- <i>相鄰兩振動單元較小之基本振動週期 T2（s）</i>
SB_use = 10'- <i>設計採用之梁端間隙 S_B（cm）</i>
LE_use = 8'- <i>設計採用之伸縮裝置設計伸縮量 L_E（cm）</i>

#hide
# 角度換算（deg → rad）
sinD(a) = sin(a*pi/180)
cosD(a) = cos(a*pi/180)

# 8.1.2 式 8-1：液化抵抗率 FL
FL_c = if(RS_liq > 0 and LS_liq > 0; RS_liq/LS_liq; -1)
weak_f = if(qu_c > 0 and qu_c ≤ 20; 1; 0)
# 8.1.3 表 8-1：土壤參數折減係數 DE（FL > 1 不液化，不折減）
DE_use = if(FL_c > 1; 1; if(FL_c ≤ 1/3; if(x_liq ≤ 10; if(RS_liq ≤ 0.3; 0; 1/6); 1/3); if(FL_c ≤ 2/3; if(x_liq ≤ 10; if(RS_liq ≤ 0.3; 1/3; 2/3); 2/3); if(x_liq ≤ 10; if(RS_liq ≤ 0.3; 2/3; 1); 1))))
# 8.1.4：地震地表水平加速度 A = 0.4·S_II,S·g
A_814 = 0.4*S_II_S

# 8.2：θ0 = tan⁻¹kh
kh_ea = if(kh_ea_in > 0; kh_ea_in; 0.2*S_II_S)
th0_ea = atan(kh_ea)*180/pi

# 式 8-3：主動土壓力係數 K_EA
numA = cosD(phi_s - th0_ea - theta_w)^2
s1A = sinD(phi_s + delta_w)
s2A = if(phi_s - alpha_g - th0_ea < 0; 0; sinD(phi_s - alpha_g - th0_ea))
c1A = cosD(theta_w + th0_ea + delta_w)
c2A = cosD(theta_w - alpha_g)
wA = if(c1A > 0 and c2A > 0; max(0; s1A*s2A/(c1A*c2A)); 0)
denA = if(mo_form ≡ 1; cosD(th0_ea)*cosD(theta_w)^2*c1A*(1 + sqrt(wA))^2; cosD(th0_ea)^2*cosD(theta_w)^2*c1A*(1 + sqrt(wA)))
KEA_c = if(denA > 0; numA/denA; -1)

# 式 8-5：被動土壓力係數 K_EP
numP = cosD(phi_s - th0_ea + theta_w)^2
s1P = sinD(phi_s + delta_w)
s2P = sinD(phi_s + alpha_g - th0_ea)
c1P = cosD(delta_w + th0_ea - theta_w)
c2P = cosD(theta_w - alpha_g)
wP = if(c1P > 0 and c2P > 0; max(0; s1P*s2P/(c1P*c2P)); 0)
baseP = 1 - sqrt(wP)
denP = if(mo_form ≡ 1; cosD(th0_ea)*cosD(theta_w)^2*c1P*baseP^2; cosD(th0_ea)^2*cosD(theta_w)^2*c1P*baseP)
KEP_c = if(baseP > 0 and denP > 0; numP/denP; -1)

# q′ 項係數：條文式 K；Mononobe-Okabe 常用式 √K
qaK = if(KEA_c > 0; if(mo_form ≡ 1; KEA_c; sqrt(KEA_c)); -1)
qpK = if(KEP_c > 0; if(mo_form ≡ 1; KEP_c; sqrt(KEP_c)); -1)

# 式 8-2：地震主動土壓力（牆頂負壓截斷至零）
p0A = if(KEA_c > 0; -2*c_soil*sqrt(KEA_c) + q_sur*qaK; 0)
xcA = if(KEA_c > 0 and p0A < 0; (2*c_soil*sqrt(KEA_c) - q_sur*qaK)/(gamma_s*KEA_c); 0)
dA = max(0; H_ret - xcA)
PtriA = 0.5*gamma_s*KEA_c*dA^2
PrecA = q_sur*qaK*dA
PEa_c = if(KEA_c > 0; PtriA + PrecA; 0)
yEa_c = if(PEa_c > 0; (PtriA*dA/3 + PrecA*dA/2)/PEa_c; 0)
pbA = if(KEA_c > 0; gamma_s*H_ret*KEA_c - 2*c_soil*sqrt(KEA_c) + q_sur*qaK; 0)

# 式 8-4：地震被動土壓力
cP_term = if(KEP_c > 0; 2*c_soil*sqrt(KEP_c) + q_sur*qpK; 0)
PEp_c = if(KEP_c > 0; 0.5*gamma_s*KEP_c*H_ret^2 + cP_term*H_ret; 0)
yEp_c = if(PEp_c > 0; (0.5*gamma_s*KEP_c*H_ret^2*(H_ret/3) + cP_term*H_ret*(H_ret/2))/PEp_c; 0)

# 8.3：地震動水壓（kh 取 0.4·S_II,S）
kh_w = 0.4*S_II_S
ratio_bh = if(h_w > 0; b_w/h_w; 0)
P_w = if(water_form ≡ 1; (7/12)*kh_w*gamma_w*b_w*h_w^2; if(ratio_bh ≤ 2; (3/4)*kh_w*gamma_w*A0_w*h_w*(b_w/t_w)*(1 - b_w/(4*h_w)); if(ratio_bh ≤ 4; (3/4)*kh_w*gamma_w*A0_w*h_w*(b_w/t_w)*(0.7 - b_w/(10*h_w)); (9/40)*kh_w*gamma_w*A0_w*h_w*(b_w/t_w))))
hg_w = if(water_form ≡ 1; (2/5)*h_w; (3/7)*h_w)

# 8.5.1 式 8-10、8-11：梁端防落長度
epsG = if(gr_typ ≡ 1; 0.0025; if(gr_typ ≡ 2; 0.00375; if(gr_typ ≡ 3; 0.005; 0.00625)))
LNmin_c = (50 + 0.25*L_span + 1.0*H_sub)*(1 + S_skew^2/8000)
uR_c = sqrt(uR1^2 + uR2^2)
uG_c = epsG*Le_eff*(S_III_S/S_II_S)
LNreq_c = if(bear_form ≡ 1; max(LNmin_c; uR_c + uG_c); LNmin_c)
UC_LN = if(LN_use > 0; LNreq_c/LN_use; -1)

# 8.6、8.7 式 8-12、8-13：梁端間隙與伸縮裝置（LA = 1.5 cm；cφ 表 7-2）
LA_c = 1.5
rT_c = if(T1_p > 0; (T1_p - T2_p)/T1_p; -1)
cphi_c = if(rT_c ≤ 0.1; 1.0; if(rT_c ≤ 0.8; 1.4; 1.0))
SBreq_c = if(gap_form ≡ 1; uS_gap + LA_c; cphi_c*uS_gap + LA_c)
LEreq_c = if(gap_form ≡ 1; uJ_exp + LA_c; cphi_c*uJ_exp + LA_c)
UC_SB = if(SB_use > 0; SBreq_c/SB_use; -1)
UC_LE = if(LE_use > 0; LEreq_c/LE_use; -1)

# 有效性
ok_gr = S_II_S > 0 and S_III_S > 0 and gr_typ ≥ 1 and gr_typ ≤ 4 and gr_typ ≡ floor(gr_typ)
ok_liq = qu_c > 0 and FL_c > 0 and x_liq > 0 and (FL_c ≥ 1 or x_liq ≤ 20)
ok_ea = phi_s > 0 and phi_s < 90 and H_ret > 0 and gamma_s > 0 and c_soil ≥ 0 and q_sur ≥ 0 and alpha_g > -90 and alpha_g < 90 and theta_w ≥ -45 and theta_w ≤ 45 and delta_w ≥ -45 and delta_w ≤ 45 and mo_form ≥ 1 and mo_form ≤ 2 and KEA_c > 0 and KEP_c > 0 and kh_ea > 0
ok_w = h_w > 0 and gamma_w > 0 and b_w > 0 and (water_form ≡ 1 or (water_form ≡ 2 and t_w > 0 and A0_w > 0))
ok_ln = L_span > 0 and H_sub ≥ 0 and S_skew ≥ 0 and uR1 ≥ 0 and uR2 ≥ 0 and Le_eff > 0 and LN_use > 0 and (bear_form ≡ 1 or bear_form ≡ 2)
ok_gap = uS_gap ≥ 0 and uJ_exp ≥ 0 and T1_p ≥ T2_p and T2_p > 0 and SB_use > 0 and LE_use > 0 and (gap_form ≡ 1 or gap_form ≡ 2)
ok_in = ok_gr and ok_liq and ok_ea and ok_w and ok_ln and ok_gap
UC_max = ru(max(UC_LN; UC_SB; UC_LE))
#show

#if ok_in > 0.5

<h5>7. 液化判定與土壤參數折減（8.1.2、8.1.3、8.1.4）</h5>
FL_out = FL_c'- <i>液化抵抗率 FL = R_S/L_S（式 8-1）；FL < 1.0 判定可能液化</i>
DE_out = DE_use'- <i>土壤參數之折減係數 DE（表 8-1；FL > 1 不折減）</i>
A814_out = A_814'- <i>地震地表水平加速度 A = 0.4·S_II,S（g；8.1.4）</i>
#if weak_f > 0.5
'<b style="color:#b91c1c">注意：單軸壓縮強度 ≤ 20 kPa，判定為極軟弱土層（8.1.1），其耐震設計用土壤參數須設定為零，且不宜作為基礎承載層；如有此類土層，應將基面設定於該土層下緣（8.1.4 第 3 點）。</b>
#else
'<span>極軟弱土層判定：q_u = 'qu_c' kPa > 20 kPa，非極軟弱土層。</span>
#end if
#if FL_c < 1
'<b style="color:#b45309">液化判定：FL = 'FL_c' < 1.0 → 該土層可能液化，土壤參數應依表 8-1 折減（DE = 'DE_use'）；液化土層之重量應視為其下方土層之載重，並應分別考慮未液化、液化及流動化之影響（8.1.4）。</b>
#else
'<span>液化判定：FL = 'FL_c' ≥ 1.0 → 不液化，土壤參數不折減。</span>
#end if

<h5>8. 地震土壓力（8.2 式 8-2～8-5）</h5>
kh_out = kh_ea'- <i>水平加速度係數 k_h（θ0 = tan⁻¹k_h = 'th0_ea'°）</i>
KEA_out = KEA_c'- <i>地震主動土壓力係數 K_EA（式 8-3）</i>
KEP_out = KEP_c'- <i>地震被動土壓力係數 K_EP（式 8-5）</i>
pEa0_out = p0A'- <i>牆頂（x = 0）地震主動土壓力 p_Ea（kPa；負值表示截斷為零）</i>
pEab_out = pbA'- <i>牆底（x = H）地震主動土壓力 p_Ea（kPa）</i>
PEa_out = PEa_c'- <i>地震主動土壓合力 P_Ea（kN/m 牆長；負壓截斷後）</i>
yEa_out = yEa_c'- <i>P_Ea 作用點距牆底之距離（m）</i>
PEp_out = PEp_c'- <i>地震被動土壓合力 P_Ep（kN/m 牆長）</i>
yEp_out = yEp_c'- <i>P_Ep 作用點距牆底之距離（m）</i>
'<span>土壓作用力方向與水平間之夾角為 θ+δ = 'theta_w + delta_w'°（以逆時針方向為正值，8.2 圖 8-1）。</span>

<h5>9. 地震動水壓（8.3 式 8-6～8-9）</h5>
Pw_out = P_w'- <i>作用於結構物之全部地震動水壓 P（kN）</i>
hgw_out = hg_w'- <i>全部動水壓合力作用點至地表面之距離 h_g（m）</i>
'<i>軟弱土層及液化性土壤內之地震動水壓，設計上不予考慮（解說 C8.3）。</i><span class="alleen-scherm"></span>

<h5>10. 梁端防落長度檢核（8.5 式 8-10、8-11）</h5>
epsG_out = epsG'- <i>地盤變位係數 εG（8.5.1）</i>
LNmin_out = LNmin_c'- <i>最小梁端防落長度 L_Nmin（cm；=(50+0.25L+1.0H)(1+S²/8000)）</i>
uR_out = uR_c'- <i>等級 III 地震引致梁端與橋墩頂部相對變位 u_R = √(u_R1²+u_R2²)（cm）</i>
uG_out = uG_c'- <i>地震引致相鄰橋墩間表層地盤水平相對變位 u_G = εG·L_e·S_III,S/S_II,S（cm）</i>
LNreq_out = LNreq_c'- <i>需求梁端防落長度 L_N（cm；活動支承取 max(L_Nmin; u_R+u_G)，固定支承取 L_Nmin）</i>
'<b style="color:'kleur(UC_LN)'">梁端防落長度：需求 'ru(LNreq_c)' cm ≤ 設計 'LN_use' cm，UC = 'ru(UC_LN)' → 'oordeel(UC_LN)'</b>

<h5>11. 梁端間隙與伸縮裝置檢核（8.6 式 8-12、8.7 式 8-13）</h5>
cphi_out = cphi_c'- <i>調整係數 cφ（表 7-2；ΔT/T1 = 'rT_c'，ΔT = T1−T2）</i>
SBreq_out = SBreq_c'- <i>需求梁端間隙 S_B（cm）</i>
LEreq_out = LEreq_c'- <i>需求伸縮裝置設計伸縮量 L_E（cm）</i>
'<b style="color:'kleur(UC_SB)'">梁端間隙：需求 'ru(SBreq_c)' cm ≤ 設計 'SB_use' cm，UC = 'ru(UC_SB)' → 'oordeel(UC_SB)'</b>
'<b style="color:'kleur(UC_LE)'">伸縮裝置：需求 'ru(LEreq_c)' cm ≤ 設計 'LE_use' cm，UC = 'ru(UC_LE)' → 'oordeel(UC_LE)'</b>

<h5>12. 總結</h5>
'<i>本表未涵蓋：設計總橫力與其分布（第 2 章）、分析方法與韌性（第 3～5 章）、隔震（第 7 章）、液化後流動化之定量分析（8.1.4）、防止落橋裝置降伏強度（8.5 第 1 項：須大於支承靜載重反力 R_d 之 1.5 倍）；重要橋梁或大坡度橋梁另應依 8.5 設置防止落橋措施。</i><span class="alleen-scherm"></span>
#if UC_max ≤ 1.0
'<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>橋梁耐震（第八章）檢核合格</b>
#else
'<b>控制 UC = 'UC_max'</b> > 1.0 → <b>橋梁耐震（第八章）檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。S_II,S 與 S_III,S 須大於零；液化評估之 R_S、L_S 須大於零且 FL < 1 時土層深度須在 0～20 m（表 8-1 範圍）；土壓之 φ、γ、H 須為正、K_EA 與 K_EP 須可求得（牆背幾何與 k_h 過大時公式不適用）；動水壓之水深、寬度須為正（四周環水另需 t、A0 為正）；防落之跨徑、L_e、L_N 須為正；間隙之 T1 ≥ T2 > 0 且 S_B、L_E 為正；各下拉選單須為有效選項。
#end if
`;
