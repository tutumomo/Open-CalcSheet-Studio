/**
 * 垂直式跌水工與消能設施設計檢核（hwdrain107 §4.8.2、附錄 L、§5.13）。
 *
 * 規範依據與資料等級：
 * 1. 垂直式跌水僅適用於渠道局部落差 3 m 以下（公路排水設計規範 107.02.06 §4.8.2；A 級公式
 *    hwdrain107_drop_structure_select_48）。
 * 2. 附錄 L（B 級官方 PDF 原圖逐式核對）：下游最高水位小於上游渠底加 0.6 h_c 時，
 *    h' = h_c / 2；L = {2.5 + 1.1(h_c/h) + 0.7(h_c/h)^3} sqrt(h h')。
 * 3. 出水高 h_f >= max(0.25 h_c, 0.20 m)（§4.4.3）；出口護床寬 >= 2.5B、長 >= 5D，
 *    拋石或混凝土塊 d >= max(V_out^2 / 24.7, 0.30 m)（§5.13 式 5-3；B 級官方 PDF）。
 *
 * h_c=(q^2/g)^(1/3) 為矩形渠道臨界水深的一般水力學式，不是本規範明文。
 * 本表不涵蓋斜面式、齒坡式、衝擊式跌水、靜水池水躍細部、RC 結構、基礎及淘刷分析。
 */

export const twDropStructure = `"垂直式跌水工與消能設施設計檢核（hwdrain107 4.8.2／附錄 L）

'<i>依據交通部《公路排水設計規範》（107 年 2 月 6 日修正）第 4.8.2 節、附錄 L 與第 5.13 節，檢核局部落差 3 m 以下之垂直式跌水構造最小長度、尾檻、出水高與出口護床。斜面式、齒坡式與衝擊式跌水，以及靜水池水躍、結構、基礎與淘刷設計，均須另行檢討。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

<h5>1. 適用範圍與設計條件</h5>

Q_d = 1.20'm^3/s <i>設計流量 Q（m³/s）</i>
B_ch = 1.00'm <i>上游矩形渠道淨寬 B（m）</i>
h_drop = 1.50'm <i>上、下游渠底高差 h（m；垂直式跌水限 3 m 以下）</i>
D_ch = 0.80'm <i>出口排水溝設計水深 D（m；供護床最小長度檢核）</i>
y_tail = 0.25'm <i>下游最高水位距下游渠底之高度 y_t（m）</i>
V_out = 4.00'm/s <i>出口設計流速 V（m/s；應由上游水理或能量方程式另行求得）</i>

<p class="calc-uitleg">本表以矩形渠道假定計算臨界水深。附錄 L 的適用條件為：下游最高水位須小於「上游渠底 + 0.6 倍臨界水深」；本表以 y_t &lt; h + 0.6h_c 檢核。</p>

<h5>2. 擬設跌水與消能設施尺寸</h5>

L_prov = 2.50'm <i>垂直跌水構造提供長度 L（m）</i>
hp_prov = 0.30'm <i>尾檻提供高度 h'（m）</i>
fb_prov = 0.30'm <i>上游渠道提供出水高 h_f（m）</i>
W_prot = 2.80'm <i>出口護床提供寬度 W（m）</i>
L_prot = 4.50'm <i>出口護床提供長度 L_p（m）</i>
d_prot = 0.70'm <i>拋石或混凝土塊最小粒徑 d（m）</i>

#hide
g = 9.81
ok_in = if(Q_d > 0 and B_ch > 0 and h_drop > 0 and D_ch > 0 and y_tail ≥ 0 and V_out > 0 and L_prov > 0 and hp_prov > 0 and fb_prov > 0 and W_prot > 0 and L_prot > 0 and d_prot > 0; 1; 0)
#show

#if ok_in > 0.5

<h5>3. 臨界水深與附錄 L 垂直跌水構造</h5>
#hide
# 矩形渠道：q=Q/B；h_c=(q²/g)^(1/3)（一般水力學式，非規範明文）
q_unit = Q_d/B_ch
hc = (q_unit^2/g)^(1/3)
Vc = sqrt(g*hc)

# 附錄 L 適用條件：下游最高水位 < 上游渠底 + 0.6h_c
y_tail_lim = h_drop + 0.6*hc
tail_ok = if(y_tail < y_tail_lim; 1; 0)
UC_tail = if(tail_ok > 0.5; y_tail/y_tail_lim; 1.01)

# 附錄 L 式 (L-2)、(L-1)
hp_req = hc/2
r_hc = hc/h_drop
k_L = 2.5 + 1.1*r_hc + 0.7*(r_hc^3)
L_req = k_L*sqrt(h_drop*hp_req)
#show
q_out = q_unit'm^2/s <i>單位寬流量 q = Q/B（m²/s）</i>
hc_out = hc'm <i>臨界水深 h_c = (q²/g)^(1/3)（m；矩形渠道一般水力學式）</i>
Vc_out = Vc'm/s <i>臨界流速 V_c = √(g h_c)（m/s）</i>
y_tail_lim_out = y_tail_lim'm <i>附錄 L 下游最高水位上限 h + 0.6h_c（m；以距下游渠底高度表示）</i>
hp_req_out = hp_req'm <i>尾檻最小高度 h' = h_c/2（m；附錄 L 式 L-2）</i>
L_req_out = L_req'm <i>跌水構造最小長度 L（m；附錄 L 式 L-1）</i>

<h5>4. 出水高與出口護床（第 4.4.3、5.13 節）</h5>
#hide
fb_req = max(0.25*hc; 0.20)
W_prot_req = 2.5*B_ch
L_prot_req = 5*D_ch
d_vel_req = V_out^2/24.7
d_prot_req = max(d_vel_req; 0.30)

UC_h = h_drop/3
UC_L = L_req/L_prov
UC_hp = hp_req/hp_prov
UC_fb = fb_req/fb_prov
UC_W = W_prot_req/W_prot
UC_Lp = L_prot_req/L_prot
UC_d = d_prot_req/d_prot
UC_max = ru(max(UC_h; max(UC_tail; max(UC_L; max(UC_hp; max(UC_fb; max(UC_W; max(UC_Lp; UC_d))))))))
#show
fb_req_out = fb_req'm <i>最小出水高 h_f = max(0.25h_c；0.20 m)（m；第 4.4.3 節）</i>
W_prot_req_out = W_prot_req'm <i>護床最小寬度 2.5B（m；第 5.13 節）</i>
L_prot_req_out = L_prot_req'm <i>護床最小長度 5D（m；第 5.13 節）</i>
d_vel_req_out = d_vel_req'm <i>粒徑計算值 d = V²/24.7（m；第 5.13 節式 5-3）</i>
d_prot_req_out = d_prot_req'm <i>拋石／混凝土塊最小粒徑 max(V²/24.7；0.30 m)（m；第 5.13 節）</i>

<h5>5. Unity Checks</h5>
'<b style="color:'kleur(UC_h)'">垂直式適用落差 h ≤ 3.0 m：UC = 'ru(UC_h)' → 'oordeel(UC_h)'</b>
'<b style="color:'kleur(UC_tail)'">附錄 L 尾水適用條件 y_t &lt; h + 0.6h_c：UC = 'ru(UC_tail)' → 'oordeel(UC_tail)'</b>
'<b style="color:'kleur(UC_L)'">跌水構造長度 L：UC = 'ru(UC_L)' → 'oordeel(UC_L)'</b>
'<b style="color:'kleur(UC_hp)'">尾檻高度 h'：UC = 'ru(UC_hp)' → 'oordeel(UC_hp)'</b>
'<b style="color:'kleur(UC_fb)'">上游出水高：UC = 'ru(UC_fb)' → 'oordeel(UC_fb)'</b>
'<b style="color:'kleur(UC_W)'">護床寬度：UC = 'ru(UC_W)' → 'oordeel(UC_W)'</b>
'<b style="color:'kleur(UC_Lp)'">護床長度：UC = 'ru(UC_Lp)' → 'oordeel(UC_Lp)'</b>
'<b style="color:'kleur(UC_d)'">護床塊石粒徑：UC = 'ru(UC_d)' → 'oordeel(UC_d)'</b>

<h5>6. 總結與未涵蓋事項</h5>
'<i>本表只適用於局部落差 3 m 以下，且附錄 L 尾水條件成立的垂直式跌水。局部落差 3～5 m 的斜面式跌水、落差較大或下游水位不穩定之齒坡式／衝擊式跌水，須依第 4.8.3～4.8.6 節另案設計。靜水池水躍、RC 構造、基礎穩定、實際出口流速與淘刷均未納入。</i>
#if UC_max ≤ 1.0
'<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>垂直式跌水工與消能設施檢核合格</b>
#else
'<b>控制 UC = 'UC_max'</b> > 1.0 → <b>垂直式跌水工與消能設施檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。流量、渠道寬度、渠底高差、渠道水深、出口流速及所有提供尺寸均須大於零；下游最高水位不得為負值。
#end if
`;
