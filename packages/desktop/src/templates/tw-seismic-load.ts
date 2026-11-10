/**
 * 建築物靜力分析法地震力計算（seis113）— 依據內政部《建築物耐震設計規範及解說》（113年3月1日版）。
 *
 * 涵蓋：週期經驗式（2-7～2-9）、SaD(T)（表 2-5(a)）、Ra（2-10）、Fu（2-12）、
 * 最小設計水平總橫力 V（2-1～2-3）、頂層集中力 Ft（2-14）、各層橫力 Fx（2-15）。
 * 範圍：一般工址（非台北盆地），各層等重等高之規則建築。台北盆地、近斷層調整、
 * 不規則建築與動力分析一律不在本模組範圍，輸入如標示台北盆地即拒算。
 * 本模組為載重產生器，不做合格判定，結尾行為「總結：未檢核」。
 */
export const twSeismicLoad = `"建築物靜力分析法地震力計算（seis113）

'<i>依據內政部《建築物耐震設計規範及解說》（113年3月1日版，seis113）第 2.2、2.6、2.9、2.11 節，以靜力分析法求最小設計水平總橫力 V 與各樓層橫力 Fx。僅適用一般工址之規則建築（各層等重等高）；臺北盆地、近斷層調整與動力分析不在本模組範圍。S_DS、S_D1 依工址所在鄉鎮查規範附表後輸入。</i><span class="alleen-scherm"></span>

#hide
ru(u) = ceil(u*10000)/10000
#show

'<h3>一、輸入參數</h3>
S_DS = ?{0.80}', 工址短週期設計水平譜加速度係數 S_DS（seis113 2.5，視圖可依行政區、地盤與近斷層距離一鍵帶入）'
S_D1 = ?{0.45}', 工址一秒週期設計水平譜加速度係數 S_D1（seis113 2.5，視圖可依行政區、地盤與近斷層距離一鍵帶入）'
I_eq = 1.0'- <i>用途係數 I（seis113 2.8：1.0／1.25／1.5）</i>
sys = 2'- <i>結構系統（週期經驗式 Ct）：1 = 鋼構造剛構架；2 = RC／SRC／鋼造偏心斜撐剛構架；3 = 其他</i>
R_duct = 4.8'- <i>結構系統韌性容量 R（seis113 表 1-3，依結構系統查表）</i>
alpha_y = 1.5'- <i>起始降伏地震力放大倍數 α_y（2.9：RC 強度設計法 1.5、鋼構極限設計 1.0、鋼構 ASD 1.2）</i>
taipei = 0'- <i>臺北盆地工址：0 = 否；1 = 是（本模組不支援，填 1 即拒算）</i>
n_st = 8'- <i>樓層數 n（各層等重等高）</i>
h_st = 3.5'm <i>各層樓高 h（m）</i>
W_st = 450'tf <i>各層地震有效重量 w（tf；含靜載重、活動隔間 ≥ 75 kg/m²，倉庫書庫加 1/4 活載重）</i>

#hide
ok_in = if(S_DS > 0 and S_D1 > 0 and S_DS ≥ S_D1/2.5 and (abs(I_eq - 1.0) < 0.001 or abs(I_eq - 1.25) < 0.001 or abs(I_eq - 1.5) < 0.001) and R_duct ≥ 1 and R_duct ≤ 6 and alpha_y ≥ 1 and n_st ≥ 1 and h_st > 0 and W_st > 0 and taipei < 0.5; 1; 0)
#show

#if ok_in > 0.5
'<h3>二、週期與譜加速度</h3>
#hide
h_n_calc = n_st * h_st
Ct_calc = if(sys < 1.5; 0.085; if(sys < 2.5; 0.070; 0.050))
T_a_calc = Ct_calc * h_n_calc ^ 0.75
T0_calc = S_D1 / S_DS
SaD_calc = if(T_a_calc ≤ 0.2*T0_calc; S_DS*(0.4 + 3*T_a_calc/T0_calc); if(T_a_calc ≤ T0_calc; S_DS; if(T_a_calc ≤ 2.5*T0_calc; S_D1/T_a_calc; 0.4*S_DS)))
#show
h_n = h_n_calc'm <i>基面至屋頂面高度 h_n</i>
C_t = Ct_calc'- <i>週期係數 C_t（式 2-7～2-9）</i>
T_a = T_a_calc'- <i>基本振動週期 T = C_t·h_n^(3/4)（s；其他力學方法所得 T 不得大於此值之 1.4 倍）</i>
T_0D = T0_calc'- <i>T_0^D = S_D1 / S_DS（s，式 2-6）</i>
S_aD = SaD_calc'- <i>工址設計水平譜加速度係數 S_aD（表 2-5(a)）</i>

'<h3>三、韌性容量與地震力折減係數</h3>
#hide
Ra_calc = 1 + (R_duct - 1)/1.5
s_calc = sqrt(2*Ra_calc - 1)
Fu_calc = if(T_a_calc ≥ T0_calc; Ra_calc; if(T_a_calc ≥ 0.6*T0_calc; s_calc + (Ra_calc - s_calc)*(T_a_calc - 0.6*T0_calc)/(0.4*T0_calc); if(T_a_calc ≥ 0.2*T0_calc; s_calc; s_calc + (s_calc - 1)*(T_a_calc - 0.2*T0_calc)/(0.2*T0_calc))))
r_calc = SaD_calc / Fu_calc
rm_calc = if(r_calc ≤ 0.3; r_calc; if(r_calc < 0.8; 0.52*r_calc + 0.144; 0.70*r_calc))
#show
R_a = Ra_calc'- <i>容許韌性容量 R_a = 1 + (R − 1)/1.5（式 2-10）</i>
F_u = Fu_calc'- <i>結構系統地震力折減係數 F_u（式 2-12）</i>
SaD_Fu = rm_calc'- <i>(S_aD / F_u)_m（式 2-2 修正後）</i>

'<h3>四、最小設計水平總橫力</h3>
#hide
W_tot_calc = n_st * W_st
V_calc = I_eq / (1.4*alpha_y) * rm_calc * W_tot_calc
Ft_calc = if(T_a_calc < 0.7; 0; min(0.07*T_a_calc*V_calc; 0.25*V_calc))
#show
W_tot = W_tot_calc'tf <i>建築物全部地震有效重量 W</i>
V = V_calc'tf <i>最小設計水平總橫力 V = I/(1.4α_y)·(S_aD/F_u)_m·W（式 2-1～2-3）</i>
V_W = V_calc / W_tot_calc'- <i>基底剪力係數 V/W</i>
F_t = Ft_calc'tf <i>頂層外加集中橫力 F_t（式 2-14；T &lt; 0.7 s 時為 0，不大於 0.25V）</i>

'<h3>五、各層橫力分配（式 2-15）</h3>
#hide
sum_wh_calc = W_st * h_st * n_st * (n_st + 1) / 2
F_top_calc = Ft_calc + (V_calc - Ft_calc) * W_st * (n_st*h_st) / sum_wh_calc
F_bot_calc = (V_calc - Ft_calc) * W_st * h_st / sum_wh_calc
F_sum_calc = F_top_calc + (V_calc - Ft_calc) * (1 - W_st*(n_st*h_st)/sum_wh_calc)
#show
F_top = F_top_calc'tf <i>頂層橫力 F_n = F_t + (V − F_t)·w_n·h_n / Σw_i·h_i</i>
F_bot = F_bot_calc'tf <i>一樓橫力 F_1 = (V − F_t)·w_1·h_1 / Σw_i·h_i</i>
'<i>各層橫力 F_x = (V − F_t)·w_x·h_x / Σw_i·h_i，各層合計等於 V；意外扭矩（2.14）、傾倒力矩（2.15）與層間位移（2.16）須另行檢核。</i>

'<h3>六、總結</h3>
'<b>總結：未檢核</b>。本模組為載重產生器，僅輸出設計地震力，不做構件合格判定；V = 'ru(V_calc)' tf，請將 V 與 F_x 帶入結構分析。
#else
'<b>總結：無效輸入，未檢核</b>。S_DS、S_D1、I、R、α_y、樓層與重量須為有效值，且不支援臺北盆地（taipei = 1）。
#end if
`;
