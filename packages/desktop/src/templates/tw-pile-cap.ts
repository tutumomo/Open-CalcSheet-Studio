/**
 * 三樁／四樁樁帽壓拉桿模型檢核（rc112 第 13.2.6.3、23 章）— 取代上游歐規雙樁樁帽之台灣版。
 *
 * 模型：柱載重集中於柱心節點，經 n 根壓桿傳至各樁頂節點，底部沿樁中心連線設拉桿。
 * 三樁（正三角形）：T = (Pu/3)·(R/z)/√3，R = s/√3；四樁（正方形）：T = (Pu/4)·(R/z)/√2，R = s/√2。
 * 檢核：壓桿與拉桿夾角 ≥ 25°（23.2.7）、拉桿 φFnt（23.7.2）、壓桿 fce = 0.85βcβs·f'c（23.4.3）、
 * 節點區 fce = 0.85βcβn·f'c（23.9.2）、樁中心間距（found112 5.4.1 場鑄樁）。φ = 0.75（表 21.2.1(g)）。
 * 依 13.4.6.3，依 13.2.6.3 壓拉桿法設計之樁帽免做梁式剪力檢核。
 * 節點面積（23.9.4）：樁頂節點取垂直壓桿軸線之面，w_s = a_p·sinθ + w_t·cosθ（a_p 為等面積方形邊長，w_t 為拉桿有效高度 2(c + d_b/2)）；
 * 柱底節點以承壓區 φ·0.85·f'c·b_c² ≥ P_u 檢核。
 * 保守假設：βc = 1.0；βs 由使用者宣告（0.4 或 0.75，後者須符合 23.5）；柱底節點 βn = 1.0，樁頂節點 βn = 0.60。
 * 僅適用集中軸壓（無彎矩）、各樁等載；拉桿錨定須另行檢核。
 */
export const twPileCap = `"三樁／四樁樁帽壓拉桿模型設計與檢核（rc112）

'<i>依據內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）第 13.2.6.3、13.4.6、21.2、23 章，以壓拉桿模型檢核三樁（正三角形）或四樁（正方形）樁帽之壓桿夾角、拉桿、壓桿與節點區強度；樁間距依《建築物基礎構造設計規範》（112年6月20日版）5.4.1 場鑄樁。僅適用集中軸壓、各樁等載；拉桿錨定須另行檢核。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
f_c = 28'- <i>混凝土規定抗壓強度 f'c（MPa）</i>
f_y = 420'- <i>拉桿鋼筋降伏強度 f_y（MPa）</i>
n_p = 4'- <i>樁數（3 = 正三角形；4 = 正方形）</i>
s = 2400'- <i>樁中心間距 s（mm；三樁為三角形邊長，四樁為方形邊長）</i>
d_p = 800'- <i>樁徑 d_p（mm）</i>
b_c = 700'- <i>方形柱邊長 b_c（mm）</i>
h = 1600'- <i>樁帽厚度 h（mm）</i>
cover = 75'- <i>拉桿鋼筋重心至底面之淨保護層 c（mm；貼地澆置 75）</i>
bar = 32'- <i>拉桿鋼筋號數 D（19、22、25、29、32、36）</i>
n_bar = 10'- <i>每條拉桿鋼筋根數</i>
z_r = 0.85'- <i>桁架力臂比 z/d（工程假設，0.50～0.95）</i>
beta_s = 0.4'- <i>壓桿係數 β_s（表 23.4.3(a)：0.4 或 0.75；0.75 須符合 23.5 配筋）</i>
P_u = 6000'- <i>柱因數化軸壓力 P_u（kN）</i>

#hide
db_m = if(bar ≡ 19; 19.1; if(bar ≡ 22; 22.2; if(bar ≡ 25; 25.4; if(bar ≡ 29; 28.7; if(bar ≡ 32; 32.2; if(bar ≡ 36; 35.8; 0))))))
Ab_m = if(bar ≡ 19; 286.5; if(bar ≡ 22; 387.1; if(bar ≡ 25; 506.7; if(bar ≡ 29; 646.9; if(bar ≡ 32; 814.3; if(bar ≡ 36; 1007; 0))))))
ok_in = if(f_c ≥ 21 and f_c ≤ 70 and abs(f_y - 420) < 0.5 and (n_p ≡ 3 or n_p ≡ 4) and s > 0 and d_p > 0 and b_c > 0 and h > 0 and cover > 0 and db_m > 0 and n_bar ≥ 2 and n_bar ≡ round(n_bar) and z_r ≥ 0.5 and z_r ≤ 0.95 and (abs(beta_s - 0.4) < 0.001 or abs(beta_s - 0.75) < 0.001) and P_u > 0 and b_c ≤ s and d_p ≤ s/2 and h - cover - db_m/2 > 0; 1; 0)
#show

#if ok_in > 0.5
'<h3>二、壓拉桿模型幾何與桿件力</h3>
#hide
d_eff = h - cover - db_m/2
z_arm = z_r*d_eff
R_h = if(n_p ≡ 3; s/sqrt(3); s/sqrt(2))
theta = atan(z_arm/R_h)*180/pi
sin_t = sin(theta*pi/180)
C_strut = (P_u/n_p)/sin_t
H_pile = (P_u/n_p)*R_h/z_arm
T_tie = if(n_p ≡ 3; H_pile/sqrt(3); H_pile/sqrt(2))
UC_ang = 25/theta
#show
d_out = d_eff'- <i>有效深度 d = h − c − d_b/2（mm）</i>
z_out = z_arm'- <i>桁架力臂 z = (z/d)·d（mm）</i>
R_out = R_h'- <i>柱心至樁心水平距離 R（mm）</i>
theta_out = theta'- <i>壓桿與水平拉桿夾角 θ = atan(z/R)（度）</i>
C_out = C_strut'- <i>每根壓桿壓力 C = (P_u/n)/sinθ（kN）</i>
T_out = T_tie'- <i>每條拉桿拉力 T（kN）</i>
'<b style="color:'kleur(UC_ang)'">壓桿拉桿夾角（≥ 25°，23.2.7）：UC_ang = 'ru(UC_ang)' → 'oordeel(UC_ang)'</b>

'<h3>三、拉桿強度（23.7.2）</h3>
#hide
T_cap = 0.75*f_y*n_bar*Ab_m/1000
UC_tie = T_tie/T_cap
#show
Tcap_out = T_cap'- <i>拉桿設計強度 φF_nt = 0.75·f_y·A_ts（kN）</i>
'<b style="color:'kleur(UC_tie)'">拉桿檢核：UC_tie = 'ru(UC_tie)' → 'oordeel(UC_tie)'</b>

'<h3>四、壓桿與節點區強度（23.4.3、23.9.2）</h3>
#hide
a_p = d_p*sqrt(pi)/2
w_t = 2*(cover + db_m/2)
ws_p = a_p*sin_t + w_t*cos(theta*pi/180)
Anz_pile = ws_p*a_p
phiF_np = 0.75*0.85*1.0*0.60*f_c*Anz_pile/1000
phiF_nc = 0.75*0.85*1.0*1.0*f_c*b_c^2/1000
phiF_st = 0.75*0.85*1.0*beta_s*f_c*Anz_pile/1000
UC_np = C_strut/phiF_np
UC_nc = P_u/phiF_nc
UC_st = C_strut/phiF_st
#show
Fnp_out = phiF_np'- <i>樁頂節點設計強度 φF_nn（β_n = 0.60，錨定兩條以上拉桿；節點面寬 w_s = a_p·sinθ + w_t·cosθ；kN）</i>
Fnc_out = phiF_nc'- <i>柱底節點（承壓區）設計強度 φ·0.85·f'c·b_c²（β_n = 1.0；kN）</i>
Fst_out = phiF_st'- <i>壓桿設計強度 φF_ns（kN）</i>
'<b style="color:'kleur(UC_np)'">樁頂節點區：UC_np = 'ru(UC_np)' → 'oordeel(UC_np)'</b>
'<b style="color:'kleur(UC_nc)'">柱底節點區（柱載重承壓）：UC_nc = 'ru(UC_nc)' → 'oordeel(UC_nc)'</b>
'<b style="color:'kleur(UC_st)'">壓桿（以樁頂端面計）：UC_st = 'ru(UC_st)' → 'oordeel(UC_st)'</b>

'<h3>五、樁間距（found112 5.4.1，場鑄混凝土樁）</h3>
#hide
s_min = max(2.5*d_p; d_p + 1000)
UC_sp = s_min/s
#show
smin_out = s_min'- <i>最小樁中心間距 = max(2.5d_p, d_p + 1000 mm)</i>
'<b style="color:'kleur(UC_sp)'">樁間距：UC_sp = 'ru(UC_sp)' → 'oordeel(UC_sp)'</b>

#hide
UC_max = ru(max(max(UC_ang; UC_tie); max(max(UC_np; UC_nc); max(UC_st; UC_sp))))
#show
UC_max'<span class="alleen-afdruk"></span>'

'<h3>六、總結</h3>
'<i>依 13.4.6.3，壓拉桿法設計之樁帽免做梁式剪力檢核；拉桿錨定長度（23.8）、樁頂埋入與樁帽配筋細節須另行檢核。</i>
#if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>樁帽檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>樁帽檢核不合格</b>
#end if
#else
'<b>總結：無效輸入，未檢核</b>。樁數須為 3 或 4，f_y = 420 MPa，鋼筋號數 D19～D36，z/d 0.50～0.95，β_s 0.4 或 0.75，且 b_c ≤ s、d_p ≤ s/2。
#end if
`;
