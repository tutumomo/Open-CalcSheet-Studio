/**
 * 建築物風速壓與各層順風向風力（wind103full）— 依據內政部《建築物耐風設計規範及解說》（103年12月3日版）。
 * 式 2.6、2.7（風速壓 q(z)；K(z) = 2.774(z/z_g)^(2α)，依規範解說式 C2.7 核對：2.774 = 1.666²、指數 2α；已驗證庫 wind103full_qz 的 2/α 與解說不符，不採用）、用途係數 I（2.5）。
 * 非已驗證庫：地況 α、z_g（表 2.2，僅 C 地況 α = 0.15、z_g = 300 m 於解說可核）、
 * 淨風壓係數 G·Cp 由使用者依 2.7～2.8 節輸入，本模組不代查。
 * 範圍：各層等高之矩形規則建築、高度不超過 z_g。載重產生器，結尾行為「總結：未檢核」。
 */
export const twWindLoad = `"建築物風速壓與各層風力（wind103full）

'<i>依據內政部《建築物耐風設計規範及解說》（103年12月3日版，wind103full）式 2.6、2.7 求各層高度之風速壓 q(z)，再以使用者輸入之淨風壓係數 G·Cp（迎風面加背風面，依 2.7、2.8 節）求各層順風向風力。V10、地況指數 α 與梯度高度 z_g（表 2.2）須依工址與規範原表輸入：預設值為地況 C（α = 0.15、z_g = 300 m）。僅適用各層等高之規則矩形建築且高度不超過 z_g；橫風向、扭轉向與共振效應不在本模組範圍。</i><span class="alleen-scherm"></span>

#hide
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
V_10 = 40.0'm/s <i>基本設計風速 V10(C)（wind103full 2.4，依工址查表）</i>
I_w = 1.0'- <i>用途係數 I（2.5：第一、二、三類建築物 1.1，其他 1.0）</i>
K_zt = 1.0'- <i>地形係數 Kzt（無特殊地形取 1.0）</i>
alpha_w = 0.15'- <i>地況指數 α（表 2.2；地況 C = 0.15，A/B 請查原表）</i>
z_g = 300'm <i>梯度高度 z_g（表 2.2；地況 C = 300 m，A/B 請查原表）</i>
GCp = 1.3'- <i>順風向淨風壓係數 G·(Cp 迎風 − Cp 背風)（2.7、2.8 節，使用者自行查算）</i>
n_st = 8'- <i>樓層數 n（各層等高）</i>
h_st = 3.5'm <i>各層樓高 h</i>
B_w = 20'm <i>垂直於風向之建築物寬度 B</i>

#hide
ok_in = if(V_10 > 0 and I_w ≥ 0.8 and I_w ≤ 1.2 and K_zt ≥ 0.5 and alpha_w ≥ 0.05 and alpha_w ≤ 0.5 and z_g ≥ 1 and GCp > 0 and n_st ≥ 1 and h_st > 0 and B_w > 0 and n_st*h_st ≤ z_g; 1; 0)
#show

#if ok_in > 0.5
'<h3>二、風速壓（式 2.6、2.7）</h3>
#hide
H_calc = n_st * h_st
Kh_calc = 2.774 * (max(H_calc; 5) / z_g) ^ (2 * alpha_w)
qh_calc = 0.06 * Kh_calc * K_zt * (I_w * V_10) ^ 2
S_F = 0
S_M = 0
#for i = 1 : n_st
zi = max(i * h_st; 5)
qi = 0.06 * 2.774 * (zi / z_g) ^ (2 * alpha_w) * K_zt * (I_w * V_10) ^ 2
Fi = qi * GCp * B_w * h_st / 1000
S_F = S_F + Fi
S_M = S_M + Fi * i * h_st
#loop
F1_calc = 0.06 * 2.774 * (max(h_st; 5) / z_g) ^ (2 * alpha_w) * K_zt * (I_w * V_10) ^ 2 * GCp * B_w * h_st / 1000
#show
H = H_calc'm <i>屋頂高度 h</i>
K_h = Kh_calc'- <i>屋頂高度之風速壓地況係數 K(h)（式 2.7，z ≤ 5 m 以 5 m 計）</i>
q_h = qh_calc'kgf/m^2 <i>屋頂高度風速壓 q(h) = 0.06·K(h)·Kzt·(I·V10)^2（式 2.6）</i>

'<h3>三、各層風力與基底反力</h3>
'<i>第 i 層風力 F_i = q(z_i)·G·Cp·B·h（tf），z_i 為該層樓版高度；各層合計即基底剪力。</i>
F_1 = F1_calc'tf <i>一樓風力 F_1</i>
V_w = S_F'tf <i>基底總風力（剪力）V_w = ΣF_i</i>
M_w = S_M'tf*m <i>基底傾倒力矩 M_w = ΣF_i·z_i</i>

'<h3>四、總結</h3>
'<b>總結：未檢核</b>。本模組為載重產生器，僅輸出風力；V_w = 'ru(S_F)' tf，請將各層風力帶入結構分析並與地震力比較取控制者。
#else
'<b>總結：無效輸入，未檢核</b>。V10、I、Kzt、α、z_g、G·Cp、樓層與幾何須為有效值，且建築高度不得超過 z_g。
#end if
`;
