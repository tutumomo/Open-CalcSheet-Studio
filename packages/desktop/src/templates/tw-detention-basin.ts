/**
 * 滯洪池設計與檢核（swc_tech 第 94～97 條；雨水下水道設計指南 I-8.3.2 排放口出流關係）
 *
 * 依《水土保持技術規範》（114年5月7日修正）第 16～19 條（合理化公式、逕流係數）、
 * 第 94～97 條（滯洪設施規劃設計原則、滯洪量估算與管理）：
 *   - 第 96 條三角形歷線法：Vs1 = tb'(Q2 − Q1)/2 × 3600、Vs2 = tb'(Q3 − Q1)/2 × 3600、
 *     Vsd = 1.1·Vs2（永久）或 1.3·Vs1（臨時）；
 *   - 第 95 條第三款出流洪峰上限：Q_out ≤ min(0.8·Q_in, Q1, Q_allow)。
 * 排放孔口與緊急溢洪口之出流關係改採《雨水下水道設計指南》I-8.3.2（A 級已驗證）：
 *   - 堰流 q = 1.767·B·h^1.5（h ≤ 1.2L）；
 *   - 潛流 q = 0.6·B·L·√(2g(h − L/2))（h ≥ 1.8L）；
 *   - 1.2L 與 1.8L 之間以兩流量線內插；
 *   - 溢流 q_over = 1.767·B_over·H_2^1.5，且須大於入流尖峰。
 * 另以 Modified Puls 法逐時段演算（預設以第 96 條三角形歷線為入流）：
 *   S(i+1) = S(i) + Δt·[I(i) − (O(i)+O(i+1))/2]，求最大有效蓄水量、最高水位與最大出流。
 * 堤頂最小出水高 0.50 m 為工程慣例值，非規範明文，已於輸入列標示。
 */

export const twDetentionBasin = `"滯洪池設計與檢核（swc_tech 第 94～97 條）

'<i>依據農業部《水土保持技術規範》（114年5月7日修正，swc_tech）第 16～19 條（合理化公式、逕流係數）、第 94～97 條（滯洪設施規劃設計原則、滯洪量估算與管理），以三角形歷線法求臨時與永久滯洪量及設計蓄洪量；排放孔口與緊急溢洪口之出流關係依《雨水下水道設計指南》I-8.3.2（堰流、潛流與溢流）；並以 Modified Puls 法逐時段演算最大蓄水量、最高水位與最大出流，檢核池體容量與第 95 條第三款之出流洪峰上限。堤頂最小出水高為工程慣例值，非規範明文，已於輸入列標示。建築基地雨水貯集滯洪設施（建築技術規則設計施工編 §4-3）另有規定，不在本模組範圍。</i><span class="alleen-scherm"></span>

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

'<h3>五、排放孔口與緊急溢洪口（雨水下水道設計指南 I-8.3.2）</h3>
'<i>排放孔口為矩形，依 I-8.3.2：作用水深 h ≤ 1.2L 視為堰流 q = 1.767·B·h^1.5；h ≥ 1.8L 視為潛流 q = 0.6·B·L·√(2g(h − L/2))；介於其間以兩流量線內插。緊急溢洪口 q = 1.767·L_s·h_s^1.5（溢流口底高程取設計水位減 h_s，故設計水位時之溢流水深即為 h_s），並須可通過入流尖峰（q_over ≥ Q_p）。</i>

B_orf = ?{0.40}', 排放孔口寬度 B（m）'
L_orf = ?{0.40}', 排放孔口高度 L（m）'
L_spill = ?{8.0}', 緊急溢洪口寬度 L_s（m）'
h_spill = ?{0.30}', 溢洪口設計溢流水深 h_s（自設計水位起算）（m）'
fb_min = 0.50'm <i>堤頂最小出水高（工程慣例值，非規範明文，由設計者自訂）</i>

#hide
A_orf_calc = B_orf * L_orf
h_des_calc = H_w - z_inv
qw12_calc = 1.767 * B_orf * (1.2 * L_orf)^1.5
qo18_calc = 0.6 * B_orf * L_orf * sqrt(2 * 9.81 * (1.8 * L_orf - L_orf / 2))
q_orf_calc = if(h_des_calc ≤ 0; 0; if(h_des_calc ≤ 1.2 * L_orf; 1.767 * B_orf * h_des_calc^1.5; if(h_des_calc ≥ 1.8 * L_orf; 0.6 * B_orf * L_orf * sqrt(2 * 9.81 * (h_des_calc - L_orf / 2)); qw12_calc + (h_des_calc - 1.2 * L_orf)/(0.6 * L_orf) * (qo18_calc - qw12_calc))))
Q_spill_calc = 1.767 * L_spill * h_spill^1.5
z_spill_calc = H_w - h_spill
fb_act_calc = H_crest - H_w - h_spill
#show

A_orf = A_orf_calc'm^2 <i>排放孔口斷面積 A_o</i>
h_des = h_des_calc'm <i>排放孔口作用水深 h（設計水位 − 孔口底緣）</i>
Q_orf = q_orf_calc'm^3/s <i>設計水位下排放孔口出流量 Q_orf（最大出流，偏安全）</i>
Q_spill = Q_spill_calc'm^3/s <i>緊急溢洪口通水能力 Q_spill</i>
fb_act = fb_act_calc'm <i>實際堤頂出水高 = 堤頂 − 設計水位 − 溢流水深</i>

'<h3>六、逐時段調洪演算（Modified Puls 法）</h3>
'<i>以第 96 條三角形歷線（預設）或自訂歷線為入流歷線，依池體蓄水曲線 V(y) = B0·L0·y + z·(B0+L0)·y² + (4/3)·z²·y³ 與排放孔口、緊急溢洪口之出流關係，以 Modified Puls 法逐時段演算：S(i+1) = S(i) + Δt·[I(i) − (O(i)+O(i+1))/2]，其中 S 為有效蓄水量、I 為時段平均入流、O 為出流量。演算得最大有效蓄水量、最高水位與最大出流量，據以檢核池體容量與第 95 條第三款之出流洪峰上限。</i>

n_step = 20' <i>演算時段數（2～200）</i>'
Q_pk_in = 0'm^3/s <i>演算入流洪峰（0 = 依第 96 條三角形歷線採 Q_in_peak − Q1）</i>'
t_rise_in = 0'h <i>漲水時間（與退水時間同時填 0 = 依第 96 條三角形歷線採 tb_eff/2）</i>'
t_rec_in = 0'h <i>退水時間（0 = 依第 96 條三角形歷線採 tb_eff/2）</i>'

#hide
Q_pk_calc = if(Q_pk_in > 0; Q_pk_in; Q_in_peak - Q1)
t_rise_calc = if(t_rise_in > 0 and t_rec_in > 0; t_rise_in; tb_eff / 2)
t_rec_calc = if(t_rise_in > 0 and t_rec_in > 0; t_rec_in; tb_eff / 2)
T_hyd_calc = t_rise_calc + t_rec_calc
dt_calc = T_hyd_calc / n_step
dt_s_calc = dt_calc * 3600
V_in_vol_calc = Q_pk_calc * T_hyd_calc / 2 * 3600
Vpond_f(y) = B0_pond * L0_pond * y + z_pond * (B0_pond + L0_pond) * y^2 + (4/3) * z_pond^2 * y^3
Qout_f(h) = if(h ≤ 0; 0; if(h ≤ 1.2 * L_orf; 1.767 * B_orf * h^1.5; if(h ≥ 1.8 * L_orf; 0.6 * B_orf * L_orf * sqrt(2 * 9.81 * (h - L_orf / 2)); qw12_calc + (h - 1.2 * L_orf)/(0.6 * L_orf) * (qo18_calc - qw12_calc))))
Otot_f(y) = Qout_f(y - z_inv) + if(y > z_spill_calc; 1.767 * L_spill * (y - z_spill_calc)^1.5; 0)
Qin_f(t) = if(t ≤ 0; 0; if(t ≥ T_hyd_calc; 0; if(t ≤ t_rise_calc; Q_pk_calc * t / t_rise_calc; Q_pk_calc * (1 - (t - t_rise_calc)/t_rec_calc))))
#show

dt_rt = dt_calc'h <i>演算時段長 Δt</i>'
V_in_vol = V_in_vol_calc'm^3 <i>演算入流歷線體積（預設依第 96 條三角形歷線，與 Vs1／Vs2 一致；自訂歷線時須由設計者確認與設計暴雨相符）</i>'

#hide
y_prev = z_inv
S_prev = 0
O_prev = 0
Vmax_rt = 0
ymax_rt = z_inv
Qmax_rt = 0
over_rt = 0
drain_rt = 0
#for i = 1 : n_step
  t_mid = (i - 0.5) * dt_calc
  I_mid = Qin_f(t_mid)
  S_targ = S_prev + dt_s_calc * I_mid
  Fl = (Vpond_f(z_inv) - V_at_inv) + dt_s_calc * (O_prev + Otot_f(z_inv)) / 2 - S_targ
  Fh = (Vpond_f(H_crest) - V_at_inv) + dt_s_calc * (O_prev + Otot_f(H_crest)) / 2 - S_targ
  lo_r = if(Fh < 0; H_crest; z_inv)
  hi_r = if(Fl > 0; z_inv; H_crest)
  over_rt = if(Fh < 0; 1; over_rt)
  drain_rt = if(Fl > 0; 1; drain_rt)
  #for it = 1 : 45
    mid_r = (lo_r + hi_r) / 2
    Flm = (Vpond_f(lo_r) - V_at_inv) + dt_s_calc * (O_prev + Otot_f(lo_r)) / 2 - S_targ
    Fmm = (Vpond_f(mid_r) - V_at_inv) + dt_s_calc * (O_prev + Otot_f(mid_r)) / 2 - S_targ
    cs = if(Flm * Fmm ≤ 0; 1; 0)
    hi_r = if(cs > 0.5; mid_r; hi_r)
    lo_r = if(cs > 0.5; lo_r; mid_r)
  #loop
  y_next = (lo_r + hi_r) / 2
  S_next = Vpond_f(y_next) - V_at_inv
  O_next = Otot_f(y_next)
  y_prev = y_next
  S_prev = S_next
  O_prev = O_next
  Vmax_rt = max(Vmax_rt; S_next)
  ymax_rt = max(ymax_rt; y_next)
  Qmax_rt = max(Qmax_rt; O_next)
#loop
#show

V_max_rt = Vmax_rt'm^3 <i>逐時段演算最大有效蓄水量</i>'
y_max_rt = ymax_rt'm <i>逐時段演算最高水位（自池底起算）</i>'
Q_max_rt = Qmax_rt'm^3/s <i>逐時段演算最大出流量</i>'
'演算備註：<b>'if(over_rt > 0.5; "入流超出池體與溢洪口可容納量，水位達堤頂，判定不合格"; if(drain_rt > 0.5; "部分時段入流量小於前一時段出流量，池體蓄水已降至孔口底緣（時段長度可能過大，請檢討 Δt）"; if(ymax_rt > H_w; "演算最高水位高於設計水位，緊急溢洪口已啟用"; "演算最高水位在設計水位以下，溢洪口未啟用")))'</b>'

'<h3>七、安全係數與檢核比（Unity Checks）</h3>

#hide
geom_ok = if(A_catch > 0 and Q3 > Q1 and Q2 > Q1 and L0_pond > 0 and B0_pond > 0 and z_pond ≥ 0 and H_w > 0 and z_inv ≥ 0 and H_crest > H_w and B_orf > 0 and L_orf > 0 and h_des_calc > 0 and L_spill > 0 and h_spill > 0 and Q_allow_down > 0 and C_pre > 0 and C_pre ≤ 1 and C_mid ≤ 1 and C_post ≤ 1 and n_step ≥ 2 and n_step ≤ 200 and n_step ≡ round(n_step) and Q_pk_in ≥ 0 and t_rise_in ≥ 0 and t_rec_in ≥ 0 and Q_pk_calc > 0 and dt_calc > 0; 1; 0)
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

'<h4>3. 逐時段調洪演算檢核</h4>
UC_rt_vol = if(V_eff > 0; Vmax_rt / V_eff; 99)
UC_rt_out = if(Q_out_cap > 0; Qmax_rt / Q_out_cap; 99)
UC_rt_crest = if(over_rt > 0.5; 99; if(ymax_rt > H_crest; 99; 0))
'<b style="color:'kleur(UC_rt_vol)'">調洪演算蓄洪量檢核：V_max ≤ V_eff：UC_rt_vol = 'ru(UC_rt_vol)' ≤ 1.0 → 'oordeel(UC_rt_vol)'</b>

'<b style="color:'kleur(UC_rt_out)'">調洪演算出流洪峰檢核（§95 三）：Q_max ≤ Q_out,cap：UC_rt_out = 'ru(UC_rt_out)' ≤ 1.0 → 'oordeel(UC_rt_out)'</b>

'<b style="color:'kleur(UC_rt_crest)'">調洪演算最高水位檢核（不得高於堤頂）：UC_rt_crest = 'ru(UC_rt_crest)' ≤ 1.0 → 'oordeel(UC_rt_crest)'</b>

'<h4>4. 設計者另行確認項目（不納入 UC 計算）</h4>
'<i>§95 五：出水口應加設防止堵塞之半球型、弧型或其他立體型式攔污設施；§95 六：有保全對象時應設緊急溢洪口並注意排放安全；§97：永久性滯洪設施如設閘門控制水位，蓄水量不得列入滯洪體積；§97：臨時性滯洪設施施工中不得設閘門、平時不得蓄水；池體堤防穩定、滲流與坡面保護須另行檢核。</i>

'<h3>八、檢核總結與控制項目</h3>

#hide
UC_max_raw = max(UC_vol; UC_out; UC_spill; UC_fb; UC_rt_vol; UC_rt_out; UC_rt_crest)
UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>九、總結</h3>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>滯洪池檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>滯洪池檢核不合格</b>
#end if
`;
