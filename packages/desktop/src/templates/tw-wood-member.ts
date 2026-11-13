/**
 * 木構造構材檢核（木構造建築物設計及施工技術規範 第 4、5 章）— 受拉、受壓、受彎構材。
 *
 * 規範條文與來源（B 級官方來源，逐列記於 docs/tw/規範來源.md §5.22）：
 * 1. 容許應力（4.3.1 表 4.3-1(a) 普通結構材、表 4.3-1(b) 上等結構材針葉樹；闊葉樹上等材取
 *    表 4.3-1(a) 對應值之 1.25 倍，4.3.1(2)(b)）；短期容許應力為長期之 2 倍。
 * 2. 容許應力之增減（4.3.4）：經常濕潤 ×0.7、直接曝雨 ×0.8、3 個月以內臨時性結構物長期容許應力 ×1.2
 *    （不適用於彈性模數）；會劈裂時容許剪應力可增 ×1.5（本表不採用，屬保守）。
 * 3. 彈性模數（4.4.1 表 4.4-1，單位 10³kgf/cm²）；主要構材單獨使用或重視剛性者計算變形取 80%。
 * 4. 潛變（4.4.4）：固定持續載重長期作用，氣乾狀態變形以 2 倍計，濕潤或乾濕反覆以 3 倍計。
 * 5. 受拉構材（5.2.1 式 5.1）：N/A_e ≤ f_t。
 * 6. 受壓構材（5.3.2）：N/A_g ≤ f_k、f_k = η·f_c（式 5.5）；η：λ ≤ 30 取 1、30 < λ ≤ 100 取 1.3 − 0.01λ、
 *    λ > 100 取 3000/λ²（式 5.6）；λ = l_k/i ≤ 150（式 5.8）；矩形斷面 i = h/3.46；
 *    兩端軸力不同時 l_k = l(0.75 + 0.25·N2/N1)（式 5.9）。
 * 7. 受彎構材（5.4）：M/Z_e ≤ f_b′·C_f（式 5.14）；αQ/A_e ≤ f_s（式 5.17，矩形 α = 3/2）；
 *    梁深超過 30 cm 之尺寸調整係數 C_f = C_l·C_h·(30/h)^(1/9)（式 5.16，C_l：一點集中 1.08、等均佈 1.0、
 *    三分點 0.97；C_h 依表 5.4-3）；橫向挫屈折減 f_b′ = C_b·f_b（式 5.19），
 *    C_s = l_e·h/b²（式 5.20）、C_k = 0.8·√(E/L_fb)（式 5.21）、C_b 依表 5.4-5、l_e 依表 5.4-6；
 *    剛性依表 5.4-1；側撐材依表 5.4-4。
 * 8. 本表假設與限制：簡支梁（表 5.4-6 之懸臂梁情形未涵蓋）；無切口（5.4.3(1)(a) 之有效斷面模數與
 *    5.4.3(2) 之有效斷面積未涵蓋，斷面積取全斷面積）；表 5.4-3 之跨徑/梁深比不在表列值（7、14、21、28～35）
 *    時採保守之較低一級 C_h（不內插）；表 5.4-6 未列三分點載重之 l_e，採等均佈之 1.9l_o（保守）；
 *    撓度公式採一般結構力學簡支梁解（等均佈 5Ml²/48EI、中央集中 Ml²/12EI、三分點 23Ml²/432EI），
 *    規範僅規定容許值未規定公式；氣乾比重 0.3 以下之柳杉、杉木、台灣杉之容許應力 ×0.7（表 4.3-1 附註），
 *    規範未規定其彈性模數之折減，本表依表 4.4-1 原值計算。
 * 9. 未涵蓋（須另行檢核）：結構用集成材（4.5）、結構用合板（4.6）、接合（第 6 章）、
 *    框組式剪力牆與橫隔板（第 7 章）、受彎拉與受彎壓複合應力（5.5）、複合受壓構材（5.3.3）、
 *    重疊梁（5.4.4）與桁架梁（5.4.5）。
 * 10. 單位：本表以 SI 計算（N、mm、N/mm²）；規範容許應力以 kgf/cm² 列表，換算 1 kgf/cm² = 0.0980665 N/mm²，
 *     彈性模數 10³kgf/cm² 換算 ×98.0665 N/mm²。
 *
 * 結尾行：「控制 UC = … → 木構造構材檢核合格／不合格」；無效輸入標「總結：無效輸入，未檢核」。
 */

export const twWoodMember = `"木構造構材檢核（受拉／受壓／受彎，木構造規範 第 4、5 章）

'<i>依據內政部《木構造建築物設計及施工技術規範》（100.05.23 修正發布全文）第 4.3、4.4 節容許應力與彈性模數、第 5.2 節受拉構材、第 5.3.2 節單一受壓構材、第 5.4 節受彎構材。本表以簡支梁、無切口構材為前提，不涵蓋切口、集成材、合板、接合、框組式剪力牆與複合應力，須另行檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
ru4(u) = ceil(u*10000)/10000
#show

<h5>1. 材料與使用條件（4.2、4.3.4、4.4）</h5>

@select soort "樹種群（4.2.1）"
  針葉樹 Ⅰ類 = 1
  針葉樹 Ⅱ類 = 2
  針葉樹 Ⅲ類 = 3
  針葉樹 Ⅳ類 = 4
  闊葉樹 Ⅰ類 = 5
  闊葉樹 Ⅱ類 = 6
  闊葉樹 Ⅲ類 = 7
@end

@select kam "材等（4.3.1）"
  普通結構材 = 0
  上等結構材 = 1
@end

@select omg "使用環境（4.3.4(1)(2)）"
  氣乾狀態 = 1
  經常濕潤狀態（×0.7） = 2
  直接曝露在雨水（×0.8） = 3
@end

@select licht "氣乾比重 0.3 以下之柳杉、杉木、台灣杉（容許應力 ×0.7）"
  否 = 0
  是 = 1
@end

@select stijf "主要構材單獨使用或重視剛性（彈性模數 ×0.8，4.4.1）"
  否 = 0
  是 = 1
@end

@select tijd "3 個月以內之臨時性結構物（長期容許應力 ×1.2，4.3.4(3)）"
  否 = 0
  是 = 1
@end

<h5>2. 構材尺寸與內力</h5>

b_t = 100'- <i>構材寬度 b（mm）</i>
h_t = 200'- <i>構材深度 h（mm；受壓構材取挫屈方向之深度）</i>
N_t = 0'- <i>設計用軸拉力 N（kN；不受拉填 0）</i>
Ae_t = 18000'- <i>受拉有效淨斷面積 A_e（mm²；無孔洞時等於全斷面積）</i>
N_c = 0'- <i>設計用軸壓力 N（kN；不受壓填 0）</i>
lk_t = 3000'- <i>挫屈長度 l_k（mm；兩端鉸支承時等於構材長度，其餘依 5.3.2(4)）</i>
Nr_t = 1.0'- <i>兩端較小軸壓力與較大軸壓力之比值 N2/N1（式 5.9；兩端相等填 1.0）</i>
M_b = 0'- <i>設計用彎矩 M（kN·m；不受彎填 0）</i>
Q_b = 0'- <i>設計用剪力 Q（kN）</i>
L_b = 6000'- <i>受彎構材跨度 l（mm；撓度檢核用）</i>
lo_b = 6000'- <i>側撐材間距 l_o（mm；橫向挫屈與撓度以外之檢核用）</i>

@select lastvorm "載重型式（表 5.4-3 之 C_l、表 5.4-6 之 l_e）"
  等均佈載重 = 1
  中央集中載重 = 2
  三分點載重 = 3
  兩端等彎矩 = 4
@end

@select ligger "受彎構材種類（表 5.4-1 之剛性）"
  梁（一般載重或短期雪載重） = 1
  桁條類 = 2
  長期承載全載重之梁 = 3
@end

#hide
# 容許應力（kgf/cm²，長期）與彈性模數（10³kgf/cm²）
# 表 4.3-1(a) 普通結構材：Lfc / Lft / Lfb / Lfs
fc_p = if(soort ≡ 1; 75; if(soort ≡ 2; 70; if(soort ≡ 3; 65; if(soort ≡ 4; 60; if(soort ≡ 5; 90; if(soort ≡ 6; 70; 70))))))
ft_p = if(soort ≡ 1; 55; if(soort ≡ 2; 55; if(soort ≡ 3; 50; if(soort ≡ 4; 45; if(soort ≡ 5; 80; if(soort ≡ 6; 60; 50))))))
fb_p = if(soort ≡ 1; 95; if(soort ≡ 2; 90; if(soort ≡ 3; 85; if(soort ≡ 4; 75; if(soort ≡ 5; 130; if(soort ≡ 6; 100; 90))))))
fs_p = if(soort ≡ 1; 8; if(soort ≡ 2; 7; if(soort ≡ 3; 7; if(soort ≡ 4; 6; if(soort ≡ 5; 14; if(soort ≡ 6; 10; 6))))))
E_p = if(soort ≡ 1; 100; if(soort ≡ 2; 90; if(soort ≡ 3; 80; if(soort ≡ 4; 70; if(soort ≡ 5; 100; if(soort ≡ 6; 80; 70))))))
# 表 4.3-1(b) 上等結構材（針葉樹）；闊葉樹上等材取普通材之 1.25 倍（4.3.1(2)(b)）
fc_k = if(soort ≡ 1; 90; if(soort ≡ 2; 85; if(soort ≡ 3; 80; if(soort ≡ 4; 75; fc_p*1.25))))
ft_k = if(soort ≡ 1; 65; if(soort ≡ 2; 65; if(soort ≡ 3; 60; if(soort ≡ 4; 55; ft_p*1.25))))
fb_k = if(soort ≡ 1; 120; if(soort ≡ 2; 110; if(soort ≡ 3; 105; if(soort ≡ 4; 95; fb_p*1.25))))
fs_k = if(soort ≡ 1; 10; if(soort ≡ 2; 9; if(soort ≡ 3; 9; if(soort ≡ 4; 7; fs_p*1.25))))
# 表 4.4-1 彈性模數（上等結構材）
E_k = if(soort ≡ 1; 110; if(soort ≡ 2; 100; if(soort ≡ 3; 90; if(soort ≡ 4; 80; if(soort ≡ 5; 110; if(soort ≡ 6; 90; 80))))))

fc_g = if(kam ≡ 1; fc_k; fc_p)
ft_g = if(kam ≡ 1; ft_k; ft_p)
fb_g = if(kam ≡ 1; fb_k; fb_p)
fs_g = if(kam ≡ 1; fs_k; fs_p)
E_g = if(kam ≡ 1; E_k; E_p)

# 環境折減與調整（4.3.4）
omg_f = if(omg ≡ 2; 0.7; if(omg ≡ 3; 0.8; 1.0))
licht_f = if(licht ≡ 1; 0.7; 1.0)
tijd_f = if(tijd ≡ 1; 1.2; 1.0)
# 換算為 N/mm²（1 kgf/cm² = 0.0980665 N/mm²；E 為 10³kgf/cm²）
kk = 0.0980665
fc_L = fc_g*omg_f*licht_f*tijd_f*kk
ft_L = ft_g*omg_f*licht_f*tijd_f*kk
fb_L = fb_g*omg_f*licht_f*tijd_f*kk
fs_L = fs_g*omg_f*licht_f*tijd_f*kk
E_L = E_g*if(stijf ≡ 1; 0.8; 1.0)*98.0665

# 潛變倍數（4.4.4）
creep = if(omg ≡ 1; 2; 3)

# 幾何
A_g = b_t*h_t
Z_e = b_t*h_t^2/6
I_y = b_t*h_t^3/12
i_y = h_t/3.46

# 5.2 受拉
sig_t = if(N_t > 0 and Ae_t > 0; N_t*1000/Ae_t; 0)
UC_t = if(N_t > 0; if(Ae_t > 0; sig_t/ft_L; -1); 0)

# 5.3.2 受壓
lk_use = if(Nr_t < 1; lk_t*(0.75 + 0.25*Nr_t); lk_t)
lam = lk_use/i_y
eta = if(lam ≤ 30; 1; if(lam ≤ 100; 1.3 - 0.01*lam; 3000/lam^2))
f_k = eta*fc_L
sig_c = if(N_c > 0; N_c*1000/A_g; 0)
UC_c = if(N_c > 0; if(lam ≤ 150; sig_c/f_k; 99); 0)

# 5.4 受彎
Cl = if(lastvorm ≡ 2; 1.08; if(lastvorm ≡ 3; 0.97; 1.0))
Ch = if(lo_b/h_t ≤ 7; 1.06; if(lo_b/h_t ≤ 14; 1.02; if(lo_b/h_t ≤ 21; 1.00; 0.98)))
Cf = if(h_t ≤ 300; 1.00; Cl*Ch*(30/(h_t/10))^(1/9))
# 表 5.4-6 之有效無側撐長度 l_e（懸臂梁未涵蓋；三分點載重保守取等均佈之 1.9l_o）
le_f = if(lastvorm ≡ 2; 1.6; if(lastvorm ≡ 4; 1.85; 1.9))
Cs = le_f*lo_b*h_t/b_t^2
Ck = 0.8*sqrt(E_L/fb_L)
Cb = if(Cs ≤ 10; 1.0; if(Cs ≤ Ck; 1 - (Cs/Ck)^4/3; if(Cs ≤ 50; 0.4*E_L/(Cs^2*fb_L); -1)))
fb_d = if(Cb > 0; Cb*fb_L; 0)
sig_b = if(M_b > 0; M_b*1000000/Z_e; 0)
UC_b = if(M_b > 0; if(Cb > 0; sig_b/(fb_d*Cf); 99); 0)
tau_b = if(Q_b > 0; 1.5*Q_b*1000/A_g; 0)
UC_v = if(Q_b > 0; tau_b/fs_L; 0)

# 撓度（一般力學簡支梁解；以彎矩表示）
k_defl = if(lastvorm ≡ 2; 1/12; if(lastvorm ≡ 3; 23/432; 5/48))
d_i = if(M_b > 0; k_defl*M_b*1000000*L_b^2/(E_L*I_y); 0)
d_l = d_i*creep
d_allow = if(ligger ≡ 3; L_b/300; if(ligger ≡ 2; L_b/200; min(L_b/300; 20)))
d_check = if(ligger ≡ 3; d_l; d_i)
UC_d = if(M_b > 0; d_check/d_allow; 0)

# 表 5.4-4 側撐材需求（依深度/寬度比）
hb = h_t/b_t
stut_tekst = if(hb < 2.5; "未滿 2.5：不需要側撐材。"; if(hb ≤ 4.0; "2.5 至 4.0：束制兩端支承之側向移動及迴轉。"; if(hb ≤ 5.0; "4.0 至 5.0：在支點間至少一處設置椽條或鋼棒之側撐材。"; if(hb ≤ 6.5; "5.0 至 6.5：束制兩端支承之側向移動及迴轉，且受壓側以地板板材或地板擱柵材聯結。"; if(hb ≤ 7.5; "6.5 至 7.5：在支點間設置繫材或側撐材，間距不得大於梁深之 8 倍。"; "7.5 至 9.0：束制兩端支承之側向移動及迴轉，且受壓側及受拉側以板或地板擱柵材聯結。")))))

# 有效性
ok_soort = soort ≥ 1 and soort ≤ 7 and soort ≡ floor(soort) and kam ≥ 0 and kam ≤ 1 and kam ≡ floor(kam) and omg ≥ 1 and omg ≤ 3 and omg ≡ floor(omg) and licht ≥ 0 and licht ≤ 1 and licht ≡ floor(licht) and stijf ≥ 0 and stijf ≤ 1 and stijf ≡ floor(stijf) and tijd ≥ 0 and tijd ≤ 1 and tijd ≡ floor(tijd)
ok_geo = b_t > 0 and h_t > 0 and b_t ≤ h_t and lo_b > 0 and L_b > 0
ok_last = if(N_t > 0; Ae_t > 0 and Ae_t ≤ A_g; 1) * if(N_c > 0; lk_t > 0 and Nr_t > 0 and Nr_t ≤ 1; 1) * if(M_b > 0; Q_b ≥ 0 and lastvorm ≥ 1 and lastvorm ≤ 4; 1) * if(Q_b > 0; lastvorm ≥ 1 and lastvorm ≤ 4; 1)
ok_ligger = ligger ≥ 1 and ligger ≤ 3 and ligger ≡ floor(ligger)
ok_any = if(N_t > 0 or N_c > 0 or M_b > 0; 1; 0)
ok_in = ok_soort and ok_geo and ok_ligger and ok_any and ok_last > 0.5
UC_max = ru(max(UC_t; max(UC_c; max(UC_b; max(UC_v; UC_d)))))
#show

#if ok_in > 0.5

<h5>3. 容許應力（4.3、4.4，長期；短期為長期之 2 倍）</h5>
fc_out = ru4(fc_L)'- <i>容許壓應力 f_c（N/mm²）</i>
ft_out = ru4(ft_L)'- <i>容許拉應力 f_t（N/mm²）</i>
fb_out = ru4(fb_L)'- <i>容許撓曲應力 f_b（N/mm²）</i>
fs_out = ru4(fs_L)'- <i>容許剪應力 f_s（N/mm²；未採 4.3.4(4) 之 1.5 倍提高）</i>
E_out = ru(E_L)'- <i>設計用彈性模數 E（N/mm²；已含 4.4.1 之 80% 調整）</i>

<h5>4. 受拉構材（5.2.1 式 5.1）</h5>
#if N_t > 0
sig_t_out = ru(sig_t*100)/100'- <i>拉應力 N/A_e（N/mm²）</i>
'<b style="color:'kleur(UC_t)'">受拉：N/A_e = 'ru(sig_t*100)/100' N/mm² ≤ f_t = 'ru4(ft_L)' N/mm²，UC = 'ru(UC_t)' → 'oordeel(UC_t)'</b>
#else
'<span>未輸入軸拉力，不檢核受拉。</span>
#end if

<h5>5. 受壓構材（5.3.2 式 5.5、5.6、5.8、5.9）</h5>
#if N_c > 0
lk_out = ru(lk_use*10)/10'- <i>挫屈長度 l_k（mm；已依式 5.9 考量兩端軸力差）</i>
lam_out = ru(lam*100)/100'- <i>細長比 λ = l_k/i（i = h/3.46）</i>
eta_out = ru(eta*1000)/1000'- <i>挫屈折減係數 η</i>
fk_out = ru4(f_k)'- <i>容許挫屈應力 f_k = η·f_c（N/mm²）</i>
sig_c_out = ru(sig_c*100)/100'- <i>壓應力 N/A_g（N/mm²）</i>
#if lam > 150
'<b style="color:#b91c1c">細長比 λ = 'ru(lam*100)/100' > 150，不符 5.3.2(3) 之規定（λ 應在 150 以下）。</b>
#else
'<b style="color:'kleur(UC_c)'">受壓：N/A_g = 'ru(sig_c*100)/100' N/mm² ≤ f_k = 'ru4(f_k)' N/mm²，UC = 'ru(UC_c)' → 'oordeel(UC_c)'</b>
#end if
#else
'<span>未輸入軸壓力，不檢核受壓。</span>
#end if

<h5>6. 受彎構材（5.4.3 式 5.14、5.17、5.19～5.21）</h5>
#if M_b > 0
Cf_out = ru(Cf*1000)/1000'- <i>尺寸調整係數 C_f（梁深 ≤ 30 cm 取 1.00；否則 C_l·C_h·(30/h)^(1/9)）</i>
Cs_out = ru(Cs*100)/100'- <i>橫向挫屈細長比 C_s = l_e·h/b²</i>
Ck_out = ru(Ck*1000)/1000'- <i>橫向挫屈係數 C_k = 0.8·√(E/f_b)</i>
Cb_out = Cb'- <i>橫向挫屈調整係數 C_b（表 5.4-5；-1 表示 C_s > 50 不容許）</i>
fb_d_out = ru4(fb_d)'- <i>折減後容許撓曲應力 f_b′ = C_b·f_b（N/mm²）</i>
sig_b_out = ru(sig_b*100)/100'- <i>撓曲應力 M/Z_e（N/mm²）</i>
#if Cb < 0
'<b style="color:#b91c1c">橫向挫屈細長比 C_s = 'ru(Cs*100)/100' > 50，依表 5.4-5 不容許；應縮短側撐間距或加大梁寬。</b>
#else
'<b style="color:'kleur(UC_b)'">撓曲：M/Z_e = 'ru(sig_b*100)/100' N/mm² ≤ f_b′·C_f = 'ru4(fb_d*Cf)' N/mm²，UC = 'ru(UC_b)' → 'oordeel(UC_b)'</b>
#end if
d_i_out = ru(d_i*10)/10'- <i>初期（短期）最大撓度 δ（mm）</i>
d_l_out = ru(d_l*10)/10'- <i>潛變後撓度（長期；氣乾 ×'creep'、濕潤或乾濕反覆 ×'creep'）</i>
d_allow_out = ru(d_allow*10)/10'- <i>容許撓度（mm；依表 5.4-1）</i>
'<b style="color:'kleur(UC_d)'">撓度：δ = 'ru(d_check*10)/10' mm ≤ 'ru(d_allow*10)/10' mm，UC = 'ru(UC_d)' → 'oordeel(UC_d)'</b>
'<span>側撐材需求（表 5.4-4，h/b = 'ru(hb*100)/100'）：'stut_tekst'</span>
#else
'<span>未輸入彎矩，不檢核受彎撓曲應力與撓度。</span>
#end if

#if Q_b > 0
tau_b_out = ru(tau_b*100)/100'- <i>剪應力 1.5·Q/A_g（N/mm²）</i>
'<b style="color:'kleur(UC_v)'">剪力：1.5·Q/A_g = 'ru(tau_b*100)/100' N/mm² ≤ f_s = 'ru4(fs_L)' N/mm²，UC = 'ru(UC_v)' → 'oordeel(UC_v)'</b>
#else
'<span>未輸入剪力，不檢核剪應力。</span>
#end if

<h5>7. 總結</h5>
'<i>本表未涵蓋：切口構材（有效斷面模數、有效斷面積）、結構用集成材（4.5）、結構用合板（4.6）、接合（第 6 章）、框組式剪力牆與橫隔板（第 7 章）、受彎拉與受彎壓複合應力（5.5）、複合受壓構材（5.3.3）、重疊梁（5.4.4）與桁架梁（5.4.5）；容許剪應力未採 4.3.4(4) 之 1.5 倍提高，屬保守。短期應力檢核（風力、地震力）須以長期容許應力之 2 倍另行覆核。</i><span class="alleen-scherm"></span>
#if UC_max >= 99
'<b>控制 UC = 99</b> → <b>木構造構材檢核不合格</b>（細長比 λ > 150 或橫向挫屈 C_s > 50 不容許，詳見第 5、6 節）
#else
#if UC_max ≤ 1.0
'<b>控制 UC = 'UC_max'</b> ≤ 1.0 → <b>木構造構材檢核合格</b>
#else
'<b>控制 UC = 'UC_max'</b> > 1.0 → <b>木構造構材檢核不合格</b>
#end if
#end if
#else
'<b>總結：無效輸入，未檢核</b>。樹種群、材等、使用環境與下拉選項須為有效值；寬度與深度須為正且寬度不大於深度；跨度與側撐間距須為正；受拉時有效淨斷面積須為正且不大於全斷面積；受壓時挫屈長度須為正且 N2/N1 在 0～1；受彎時剪力不得為負；且軸拉力、軸壓力、彎矩至少一項大於零。
#end if
`;
