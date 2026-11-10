export const twSedimentBasin = `"沉砂池設計與檢核（swc_tech 第 35、92、93 條）

'<i>依據農業部《水土保持技術規範》（114年5月7日修正，swc_tech）第 35 條（通用土壤流失公式 USLE）、第 92 條（泥砂生產量之估計）與第 93 條（沉砂池設計容量與深度），計算臨時性或永久性沉砂設施之泥砂生產量與設計容量，並檢核池體容積、沉砂設施深度、溢流口通水能力與池頂出水高。溢流口設計流量以合理化公式（第 17 條）計算。另列《下水道工程設施標準》第 12 條之單位面積沉砂量供複核，不納入檢核。堰係數與出水高下限為工程慣用值，非規範明文，已於輸入列標示。</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "合格"; "不合格")
ru(u) = ceil(u*100)/100
#show

'<h3>一、設計條件與輸入參數</h3>

'<h4>1. 開發基地與沉砂設施型式</h4>
is_perm = 0'- <i>沉砂設施型式：0 = 臨時性（施工期間）；1 = 永久性</i>
A_dev = 2.0'ha <i>計畫開發面積（集水面積）A</i>
A_exc = 1.2'ha <i>其中開挖整地部分面積 A_exc</i>
A_imp = 0.2'ha <i>不透水鋪面面積 A_imp（第 92 條末項得扣除；先扣未開挖部分，不足再扣開挖部分）</i>
n_years = 1.0'- <i>泥砂生產量估算年期（年）；條文未定年期，依施工期或清除週期填寫並於報告寫明</i>

'<h4>2. 通用土壤流失公式參數（swc_tech 第 35 條：應使用台灣各地區之參數值）</h4>
Rm = 15000'- <i>降雨沖蝕指數 Rm（百萬焦耳·公釐/公頃·小時·年）</i>
Km = 0.030'- <i>土壤沖蝕指數 Km（公噸·公頃·年/公頃·百萬焦耳·公釐）</i>
L_fac = 1.50'- <i>坡長因子 L</i>
S_fac = 2.00'- <i>坡度因子 S</i>
C_exc = 0.05'- <i>開挖整地部分覆蓋與管理因子 C（第 35 條二：不得小於 0.05）</i>
P_exc = 0.50'- <i>開挖整地部分水土保持處理因子 P（第 35 條二：不得小於 0.5）</i>
C_oth = 0.01'- <i>未開挖或已完成水土保持處理部分之 C</i>
P_oth = 1.00'- <i>未開挖或已完成水土保持處理部分之 P</i>

'<h4>3. 沉砂池池體幾何（矩形底、四面等坡度）</h4>
L0_pond = 20.0'm <i>池底長度 L0</i>
B0_pond = 10.0'm <i>池底寬度 B0</i>
z_pond = 1.0'- <i>池邊坡比 1:z（水平/垂直；RC 直立池壁填 0）</i>
H_pond = 2.0'm <i>沉砂設施深度 H（自池底至溢流口底緣，沉砂容積計算深度）</i>
co_located = 0'- <i>是否與滯洪設施垂直共構：0 = 否；1 = 是（第 93 條一但書：設計具合理性者深度不受 1.5～3.5 m 限制）</i>

'<h4>4. 溢流口與池頂（溢流口設計流量 Q = C·I·A/360）</h4>
C_run = 0.95'- <i>逕流係數 C（臨時性取開發中、永久性取開發後；swc_tech 第 18 條表）</i>
I_rain = 120.0'mm/h <i>設計降雨強度 I（依主管機關審查要求之重現期距）</i>
L_weir = 3.0'm <i>溢流口寬度 L_w</i>
h_weir = 0.30'm <i>溢流口設計溢流水深 h_w</i>
Cw_weir = 1.84'- <i>矩形堰係數 Cw（SI，工程慣用值，非規範明文）</i>
H_crest = 2.80'm <i>池頂高程（自池底起算）</i>
fb_min = 0.30'm <i>池頂最小出水高（工程慣例值，非規範明文，由設計者自訂）</i>

#hide
'輸入合法性與適用範圍防護（第 35 條二之 C、P 下限不符時拒算）
input_ok = if((is_perm == 0 or is_perm == 1) and A_dev > 0 and A_exc ≥ 0 and A_exc ≤ A_dev and A_imp ≥ 0 and A_imp ≤ A_dev and n_years > 0 and Rm ≥ 0 and Km ≥ 0 and L_fac ≥ 0 and S_fac ≥ 0 and C_exc ≥ 0.05 and C_exc ≤ 1 and P_exc ≥ 0.5 and P_exc ≤ 1 and C_oth ≥ 0 and C_oth ≤ 1 and P_oth ≥ 0 and P_oth ≤ 1 and L0_pond > 0 and B0_pond > 0 and z_pond ≥ 0 and H_pond > 0 and (co_located == 0 or co_located == 1) and C_run > 0 and C_run ≤ 1 and I_rain > 0 and L_weir > 0 and h_weir > 0 and Cw_weir > 0 and fb_min ≥ 0; 1; 0)
UC_geom = if(input_ok == 1; 0.0; 999.0)
#show

'<h3>二、土壤流失量（swc_tech 第 35 條）</h3>
'<i>Am = Rm × Km × L × S × C × P（公噸/公頃/年）；換算成體積以每立方公尺 1.4 公噸計。</i>

Am_exc = Rm * Km * L_fac * S_fac * C_exc * P_exc'- <i>開挖整地部分土壤流失量 Am（公噸/公頃/年）</i>
Am_oth = Rm * Km * L_fac * S_fac * C_oth * P_oth'- <i>未開挖或已處理部分土壤流失量 Am（公噸/公頃/年）</i>
v_exc = Am_exc / 1.4 * n_years'- <i>開挖整地部分單位面積泥砂體積（m³/公頃，含年期）</i>
v_oth = Am_oth / 1.4 * n_years'- <i>未開挖或已處理部分單位面積泥砂體積（m³/公頃，含年期）</i>

'<h3>三、泥砂生產量（swc_tech 第 92 條）</h3>
'<i>臨時性：USLE 估算值之 1/2，但開挖整地部分每公頃不得小於 250 m³、未開挖整地或完成水土保持處理部分每公頃不得小於 30 m³。永久性：完成水土保持處理或未開挖整地部分每公頃不得小於 30 m³。下限按分區各自比較後相加；不透水鋪面面積得扣除。</i>

#hide
A_oth0 = A_dev - A_exc
d_oth = min(A_imp; A_oth0)
d_exc = min(A_imp - d_oth; A_exc)
f_usle = if(is_perm == 1; 1.0; 0.5)
floor_exc = if(is_perm == 1; 0.0; 250.0)
floor_oth = 30.0
#show

A_exc_net = A_exc - d_exc'ha <i>扣除不透水面積後之開挖整地部分</i>
A_oth_net = A_oth0 - d_oth'ha <i>扣除不透水面積後之未開挖或已處理部分</i>

#hide
V_usle_exc = f_usle * v_exc * A_exc_net
V_floor_exc = floor_exc * A_exc_net
V_usle_oth = f_usle * v_oth * A_oth_net
V_floor_oth = floor_oth * A_oth_net
#show

V_sed_exc = max(V_usle_exc; V_floor_exc)'m^3 <i>開挖整地部分泥砂生產量（USLE 'ru(V_usle_exc)' m³ 與下限 'ru(V_floor_exc)' m³ 取大值）</i>
V_sed_oth = max(V_usle_oth; V_floor_oth)'m^3 <i>未開挖或已處理部分泥砂生產量（USLE 'ru(V_usle_oth)' m³ 與下限 'ru(V_floor_oth)' m³ 取大值）</i>
V_sed = V_sed_exc + V_sed_oth'm^3 <i>泥砂生產量合計 V_sed</i>

'<h3>四、沉砂設施設計容量（swc_tech 第 93 條）</h3>
'<i>沉砂設施容量以泥砂生產量計算；臨時性沉砂設施容量以泥砂生產量 1.5 倍計算。</i>

#hide
f_cap = if(is_perm == 1; 1.0; 1.5)
#show
V_req = f_cap * V_sed'm^3 <i>沉砂設施設計容量 V_req</i>

'<h3>五、池體容積</h3>
'<i>矩形底、四面等坡度邊坡之容積：V(H) = B0·L0·H + z·(B0 + L0)·H² + (4/3)·z²·H³</i>
V_prov = B0_pond * L0_pond * H_pond + z_pond * (B0_pond + L0_pond) * H_pond^2 + (4/3) * z_pond^2 * H_pond^3'm^3 <i>溢流口底緣以下池體容積 V_prov</i>

'<h3>六、溢流口通水能力與池頂出水高</h3>
'<i>溢流口設計流量 Q = C·I·A/360（swc_tech 第 17 條，A 以公頃計）；矩形堰 Q_w = Cw·L_w·h_w^(3/2)；出水高 = 池頂 − 沉砂設施深度 − 溢流水深。</i>
Q_design = C_run * I_rain * A_dev / 360'm^3/s <i>溢流口設計流量 Q</i>
Q_weir = Cw_weir * L_weir * h_weir^1.5'm^3/s <i>溢流口通水能力 Q_w</i>
fb_act = H_crest - H_pond - h_weir'm <i>實際池頂出水高</i>

'<h3>七、檢核比（Unity Checks）</h3>

'<h4>1. 沉砂容量</h4>
UC_vol = V_req / V_prov
'<b style="color:'kleur(UC_vol)'">沉砂容積檢核（V_req ≤ V_prov）：UC = 'ru(UC_vol)' ≤ 1.0 → 'oordeel(UC_vol)'</b>

'<h4>2. 沉砂設施深度（第 93 條一：1.5～3.5 m 為宜）</h4>
UC_depth = if(co_located == 1; 0.0; max(1.5 / H_pond; H_pond / 3.5))
#if co_located == 1
'<i>沉砂與滯洪設施垂直共構：依第 93 條一但書不受深度範圍限制，設計者須另行說明其合理性。</i>
#else
'<b style="color:'kleur(UC_depth)'">深度檢核（1.5 m ≤ H ≤ 3.5 m）：UC = 'ru(UC_depth)' ≤ 1.0 → 'oordeel(UC_depth)'</b>
#end if

'<h4>3. 溢流口與出水高</h4>
UC_weir = Q_design / Q_weir
'<b style="color:'kleur(UC_weir)'">溢流口通水能力檢核（Q ≤ Q_w）：UC = 'ru(UC_weir)' ≤ 1.0 → 'oordeel(UC_weir)'</b>

UC_fb = if(fb_act > 0; fb_min / fb_act; 99.0)
'<b style="color:'kleur(UC_fb)'">池頂出水高檢核：UC = 'ru(UC_fb)' ≤ 1.0 → 'oordeel(UC_fb)'</b>

'<h4>4. 複核參考（不納入 UC）</h4>
rate_req = V_req / A_dev'- <i>單位開發面積沉砂容量（m³/公頃）</i>
#if is_perm == 0
'<i>《下水道工程設施標準》第 12 條：山坡地開發施工期間，臨時沉砂池以計畫開發面積每公頃 20～150 m³ 之沉砂量估算。本案 'ru(rate_req)' m³/公頃，僅供複核；水土保持計畫仍以水土保持技術規範第 92、93 條為準，兩者不一致時於報告說明。</i>
#else
'<i>《下水道工程設施標準》第 12 條：沉砂量以計畫開發面積每公頃 30 m³ 估算。本案 'ru(rate_req)' m³/公頃，僅供複核；水土保持計畫仍以水土保持技術規範第 92、93 條為準。</i>
#end if

'<h4>5. 設計者另行確認項目（不納入 UC 計算）</h4>
#if is_perm == 0
'<i>第 93 條二：臨時性沉砂設施以就地取材、施作簡易、方便清除為原則；第 93 條末項：臨時性沉砂設施應於每次豪雨後立即清除。第 93 條四：清淤道路以機械直接清除及搬運為原則，並防止洪水經由道路溢流。</i>
#else
'<i>第 93 條二：永久性沉砂設施之池壁以穩定之材料構築（RC 池壁可另以擋土牆或排水溝模組檢核）；第 93 條末項：應隨時檢視其功能並至少每年清除一次。第 93 條四：清淤道路以機械直接清除及搬運為原則，並防止洪水經由道路溢流。</i>
#end if

'<h3>八、檢核總結與控制項目</h3>

#hide
UC_max_raw = max(UC_vol; UC_depth; UC_weir; UC_fb)
UC_max = ru(if(UC_geom > 1.0; UC_geom; UC_max_raw))
#show

UC_max'<span class="alleen-afdruk"></span>'

'<h3>九、總結</h3>
#if UC_geom > 1.0
    '<b>總結：無效輸入，未檢核</b>
#else if UC_max ≤ 1.0
    '<b>控制 UC = 'ru(UC_max)'</b> ≤ 1.0 → <b>沉砂池設計與檢核合格</b>
#else
    '<b>控制 UC = 'ru(UC_max)'</b> > 1.0 → <b>沉砂池設計與檢核不合格</b>
#end if
`;
