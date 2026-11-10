export const twDetentionBasin = `"滯洪池設計與檢核（swc_tech 第 94～97 條）

'<i>依據農業部《水土保持技術規範》（114年5月7日修正，swc_tech）第 16～19 條（合理化公式、逕流係數）、第 94～97 條（滯洪設施規劃設計原則、滯洪量估算與管理），以三角形歷線法求臨時與永久滯洪量及設計蓄洪量，並檢核池體蓄洪容積、孔口出流是否不超過第 95 條第三款之出流洪峰上限、緊急溢洪口通水能力與堤頂出水高。孔口係數與堰係數、出水高下限為工程慣用值，非規範明文，已於各輸入列標示。建築基地雨水貯集滯洪設施（建築技術規則設計施工編 §4-3）另有規定，不在本模組範圍。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、設計條件與輸入參數</h3>

'<h4>1. 水文條件（合理化公式 Q = C·I·A/360）</h4>
A_catch = 5.0'ha <i>基地集水面積 A（公頃，ha）</i>
I_pre = 100.0'mm/h <i>開發前洪峰流量採用之降雨強度 I_pre（swc_tech §95 四：出流歷線為重現期距 25 年以下；實際取值依主管機關審查要求）</i>
I_post = 120.0'mm/h <i>開發中、開發後洪峰流量採用之降雨強度 I_post（§95 四：入流歷線至少採重現期距 50 年以上；§169：開發建築用地以 50 年降雨強度計算滯洪設施）</i>
C_pre = 0.60'- <i>開發前逕流係數 C_pre（swc_tech 表 18）</i>
C_mid = 0.95'- <i>開發中逕流係數 C_mid（整地裸露期，swc_tech 表 18）</i>
C_post = 0.90'- <i>開發後逕流係數 C_post（swc_tech 表 18）</i>
tb_in = 1.5'h <i>設計基期 tb'（§96 一：不足 1 小時者仍以 1 小時計算）</i>
is_perm = 1'- <i>滯洪設施型式：1 = 永久性滯洪設施（Vsd = 1.1·Vs2）；0 = 臨時性滯洪設施（Vsd = 1.3·Vs1）</i>
Q_allow_down = 1.5'm^3/s <i>下游排水系統之容許排洪量 Q_allow（§95 三；未知時請填大值，但不得省略開發前洪峰條件）</i>

#hide
Q1_calc = C_pre * I_pre * A_catch / 360
Q2_calc = C_mid * I_post * A_catch / 360
Q3_calc = C_post * I_post * A_catch / 360
tb_eff_calc = max(tb_in; 1.0)
#show

Q1 = Q1_calc'm^3/s <i>開發前洪峰流量 Q1</i>
Q2 = Q2_calc'm^3/s <i>開發中洪峰流量 Q2</i>
Q3 = Q3_calc'm^3/s <i>開發後洪峰流量 Q3</i>
tb_eff = tb_eff_calc'h <i>計算採用基期 tb'（不小於 1 小時）</i>

'<h3>二、滯洪量與設計蓄洪量（swc_tech 第 96 條）</h3>
'<i>以開發前、中、後洪峰流量繪製三角形同底不等高之單位歷線：Vs1 = tb'(Q2 − Q1)/2 × 3600、Vs2 = tb'(Q3 − Q1)/2 × 3600</i>

Vs1 = tb_eff * (Q2 - Q1) / 2 * 3600'm^3 <i>臨時滯洪量 Vs1</i>
Vs2 = tb_eff * (Q3 - Q1) / 2 * 3600'm^3 <i>永久滯洪量 Vs2</i>

#hide
Vsd_calc = if(is_perm == 1; 1.1 * Vs2; 1.3 * Vs1)
Q_in_peak_calc = if(is_perm == 1; Q3; Q2)
#show

Vsd = Vsd_calc'm^3 <i>設計蓄洪量 Vsd（永久 = 1.1·Vs2；臨時 = 1.3·Vs1）</i>
Q_in_peak = Q_in_peak_calc'm^3/s <i>設計入流洪峰流量（永久採開發後 Q3；臨時採開發中 Q2）</i>

'<h3>三、出流洪峰流量上限（swc_tech 第 95 條第三款）</h3>
'<i>Q_out ≤ min(0.8·Q_in，Q1，Q_allow)：出流小於入流之 80%，不得大於開發前洪峰，且不應超過下游容許排洪量</i>

#hide
Q_out_cap_calc = min(0.8 * Q_in_peak; Q1; Q_allow_down)
#show
Q_out_cap = Q_out_cap_calc'm^3/s <i>容許出流洪峰流量 Q_out,cap</i>

'<h3>四、池體幾何與蓄洪容積</h3>
'<i>矩形底、四面等坡度邊坡之蓄水量：V(y) = B0·L0·y + z·(B0 + L0)·y² + (4/3)·z²·y³</i>

L0_pond = ?{30.0}', 池底長度 L0（m）'
B0_pond = ?{25.0}', 池底寬度 B0（m）'
z_pond = ?{2.0}', 池邊坡比 1:z（水平/垂直）'
H_w = ?{2.4}', 設計水位（自池底起算最高蓄洪水深）（m）'
z_inv = ?{0.10}', 孔口底緣高程 z_inv（自池底起算；孔口以下為死水位，不計入有效蓄洪量）（m）'
H_crest = ?{3.4}', 堤頂高程（自池底起算）（m）'

#hide
V_at_Hw = B0_pond * L0_pond * H_w + z_pond * (B0_pond + L0_pond) * H_w^2 + (4/3) * z_pond^2 * H_w^3
V_at_inv = B0_pond * L0_pond * z_inv + z_pond * (B0_pond + L0_pond) * z_inv^2 + (4/3) * z_pond^2 * z_inv^3
V_eff_calc = V_at_Hw - V_at_inv
#show

V_total = V_at_Hw'm^3 <i>設計水位下池體總蓄水量</i>
V_dead = V_at_inv'm^3 <i>孔口底緣以下死水量</i>
V_eff = V_eff_calc'm^3 <i>有效蓄洪容積 V_eff</i>

'<h3>五、出口孔口與緊急溢洪口</h3>
'<i>孔口出流 Q = n·Cd·A_o·√(2g·h_c)（h_c = 設計水位 − 孔口中心高程）；溢洪口 Q = Cw·L·h^(3/2)。係數為工程慣用值，非規範明文。</i>

D_orf = ?{0.45}', 孔口直徑 D_o（m）'
n_orf = ?{1}', 孔口數量'
Cd_orf = 0.62'- <i>孔口流量係數 Cd（工程慣用值，非規範明文）</i>
L_spill = ?{8.0}', 緊急溢洪口寬度 L_s（m）'
h_spill = ?{0.30}', 溢洪口設計溢流水深 h_s（自設計水位起算）（m）'
Cw_spill = 1.84'- <i>寬頂堰係數 Cw（SI，工程慣用值，非規範明文）</i>
fb_min = 0.50'm <i>堤頂最小出水高（工程慣例值，非規範明文，由設計者自訂）</i>

#hide
A_orf_calc = 3.14159265358979 * D_orf^2 / 4
h_c_calc = H_w - (z_inv + D_orf / 2)
Q_orf_calc = if(h_c_calc > 0; n_orf * Cd_orf * A_orf_calc * sqrt(2 * 9.81 * h_c_calc); 0)
Q_spill_calc = Cw_spill * L_spill * h_spill^1.5
fb_act_calc = H_crest - H_w - h_spill
#show

A_orf = A_orf_calc'm^2 <i>單孔斷面積 A_o</i>
h_c = h_c_calc'm <i>孔口作用水頭 h_c</i>
Q_orf = Q_orf_calc'm^3/s <i>設計水位下孔口出流量 Q_orf（最大出流，偏安全）</i>
Q_spill = Q_spill_calc'm^3/s <i>緊急溢洪口通水能力 Q_spill</i>
fb_act = fb_act_calc'm <i>實際堤頂出水高 = 堤頂 − 設計水位 − 溢流水深</i>

'<h3>六、安全係數與檢核比（Unity Checks）</h3>

#hide
geom_ok = if(A_catch > 0 and Q3 > Q1 and Q2 > Q1 and L0_pond > 0 and B0_pond > 0 and z_pond ≥ 0 and H_w > 0 and z_inv ≥ 0 and D_orf > 0 and n_orf ≥ 1 and h_c_calc > 0 and L_spill > 0 and h_spill > 0 and Q_allow_down > 0 and C_pre > 0 and C_pre ≤ 1 and C_mid ≤ 1 and C_post ≤ 1; 1; 0)
UC_geom = if(geom_ok == 1; 0.0; 99.0)
#show

'<h4>1. 滯洪量與出流檢核</h4>
UC_vol = Vsd / V_eff
'<b style="color:'kleur(UC_vol)'">蓄洪容積檢核：Vsd ≤ V_eff：UC_vol = 'ru(UC_vol)' ≤ 1.0 → 'oordeel(UC_vol)'</b>

UC_out = Q_orf / Q_out_cap
'<b style="color:'kleur(UC_out)'">出流洪峰檢核（§95 三）：Q_orf ≤ Q_out,cap：UC_out = 'ru(UC_out)' ≤ 1.0 → 'oordeel(UC_out)'</b>

'<h4>2. 緊急溢洪與堤頂檢核</h4>
UC_spill = Q_in_peak / Q_spill
'<b style="color:'kleur(UC_spill)'">緊急溢洪口通水能力檢核（Q_spill ≥ 入流洪峰）：UC_spill = 'ru(UC_spill)' ≤ 1.0 → 'oordeel(UC_spill)'</b>

UC_fb = if(fb_act > 0; fb_min / fb_act; 99)
'<b style="color:'kleur(UC_fb)'">堤頂出水高檢核：UC_fb = 'ru(UC_fb)' ≤ 1.0 → 'oordeel(UC_fb)'</b>

'<h4>3. 設計者另行確認項目（不納入 UC 計算）</h4>
'<i>§95 五：出水口應加設防止堵塞之半球型、弧型或其他立體型式攔污設施；§95 六：有保全對象時應設緊急溢洪口並注意排放安全；§97：永久性滯洪設施如設閘門控制水位，蓄水量不得列入滯洪體積；§97：臨時性滯洪設施施工中不得設閘門、平時不得蓄水；池體堤防穩定、滲流與坡面保護須另行檢核。</i>

'<h3>七、檢核總結與控制項目</h3>

#hide
UC_max_raw = max(UC_vol; UC_out; UC_spill; UC_fb)
UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>八、總結</h3>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>滯洪池檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>滯洪池檢核不合格</b>
#end if
`;
