/**
 * 樓版／屋頂單位面積靜活載重彙整（btr_struct）— 依據《建築技術規則建築構造編》（112年5月10日版）。
 * 已驗證庫：第 26 條屋頂最小活載重表（btr_struct_roof_live_T26）、第 25 條活載重折減式 R = 23(1 + D/L)。
 * B 級官方條文（law.moj.gov.tw 第 17 條）：停車場／人群聚集公共走廊樓梯不得少於 500 kgf/m²。
 * 第 17 條樓地板用途活載重表未入庫：一般樓板活載重 L 由使用者依該表自行輸入，模組不代查。
 * 第 25 條折減率「每平方公尺樓地板面積 0.85%」之基準面積條文未明載：本模組保守採超過 14 m² 之部分計，R = 0.85(A − 14)，為工程判讀而非條文逐字。
 * 載重產生器，結尾行為「總結：未檢核」。
 */
export const twDeadLiveLoads = `"樓版與屋頂單位面積靜載重與活載重彙整（btr_struct）

'<i>依據《建築技術規則建築構造編》（112年5月10日版）第 11 條單位體積重量、第 17 條樓地板活載重、第 25 條活載重折減、第 26 條屋頂活載重，彙整單位面積靜載重 D 與設計活載重 L，並以 rc112 載重組合 U = 1.4D、1.2D + 1.6L 求單位面積因數化載重。第 17 條各用途活載重表未入已驗證庫，一般樓板之 L 須由使用者依該表輸入；折減率之基準面積為保守判讀（見各列說明）。</i><span class="alleen-scherm"></span>

#hide
ru(u) = ceil(u*100)/100
#show

'<h3>一、輸入參數</h3>
t_s = 0.15'm <i>樓版厚度 t_s</i>
gam_c = 2400'kgf/m^3 <i>鋼筋混凝土單位體積重量（第 11 條，使用者核對）</i>
w_fin = 100'kgf/m^2 <i>面層、粉刷、地坪（第 14、15 條或使用者實量）</i>
w_oth = 60'kgf/m^2 <i>天花板、管線、固定設備與活動隔間（≥ 75 kgf/m² 之隔間另計入此項）</i>
cat = 1'- <i>活載重類別：1 = 一般樓地板（L 由使用者輸入）；2 = 車庫及停車場；3 = 人群聚集之公共走廊、樓梯；4 = 屋頂（第 26 條）</i>
L_in = 200'kgf/m^2 <i>使用者依第 17 條表輸入之活載重 L（類別 1 必填；其餘取與規範最小值之較大者）</i>
roof = 1'- <i>屋頂形式（類別 4）：1 = 平頂或 1/8 以上拱頂；2 = 1/6～1/2 坡頂或 1/8～3/8 拱頂；3 = 1/2 以上披頂或 3/8 以上拱頂</i>
A_t = 30'm^2 <i>構材載重面積 A</i>
crowd = 0'- <i>人群聚集場所（第 17 條 A、B-2、B-3、D、E、F、G-1、G-3 等）：1 = 是（不得折減）；0 = 否</i>

#hide
ok_in = if(t_s > 0 and gam_c > 0 and w_fin ≥ 0 and w_oth ≥ 0 and A_t > 0 and L_in ≥ 0 and (cat ≡ 1 or cat ≡ 2 or cat ≡ 3 or cat ≡ 4) and (cat ≠ 1 or L_in > 0) and (cat ≠ 4 or roof ≡ 1 or roof ≡ 2 or roof ≡ 3) and (crowd ≡ 0 or crowd ≡ 1); 1; 0)
#show

#if ok_in > 0.5
'<h3>二、單位面積靜載重 D</h3>
#hide
D_s_calc = t_s * gam_c
D_calc = D_s_calc + w_fin + w_oth
#show
D_slab = D_s_calc'kgf/m^2 <i>樓版自重 t_s·γ_c</i>
D = D_calc'kgf/m^2 <i>靜載重 D = 樓版 + 面層 + 天花管線隔間</i>

'<h3>三、設計活載重 L</h3>
#hide
Lroof_calc = if(roof ≡ 1; if(A_t ≤ 20; 100; if(A_t ≤ 60; 80; 60)); if(roof ≡ 2; if(A_t ≤ 20; 80; if(A_t ≤ 60; 70; 60)); 60))
L_calc = if(cat ≡ 1; L_in; if(cat ≡ 4; max(L_in; Lroof_calc); max(L_in; 500)))
#show
L = L_calc'kgf/m^2 <i>設計活載重 L（類別 2、3 不得少於 500；類別 4 不得少於第 26 條表值）</i>

'<h3>四、活載重折減（第 25 條）</h3>
#hide
elig = if(L_calc ≤ 500 and crowd ≡ 0 and cat ≠ 3 and A_t > 14; 1; 0)
R1_calc = 0.85 * (A_t - 14)
R2_calc = 23 * (1 + D_calc / L_calc)
R_calc = if(elig > 0.5; min(R1_calc; min(R2_calc; 60)); 0)
L_red_calc = L_calc * (1 - R_calc / 100)
L_col_calc = if(L_calc > 500 and cat ≠ 4; L_calc * 0.8; L_red_calc)
#show
R_pct = R_calc'- <i>折減百分值 R（%）= min(0.85(A − 14), 23(1 + D/L), 60)；超過 500 kgf/m² 或人群聚集場所不折減</i>
L_red = L_red_calc'kgf/m^2 <i>梁、牆、屋架可用折減後活載重 L_red</i>
L_col = L_col_calc'kgf/m^2 <i>柱與基礎用活載重（L > 500 時僅柱及基礎得減 20%）</i>

'<h3>五、單位面積因數化載重（rc112 載重組合）</h3>
w_u1 = 1.4 * D_calc'kgf/m^2 <i>U = 1.4D</i>
w_u2 = 1.2 * D_calc + 1.6 * L_red_calc'kgf/m^2 <i>U = 1.2D + 1.6L（梁、牆用折減活載重）</i>
w_u2c = 1.2 * D_calc + 1.6 * L_col_calc'kgf/m^2 <i>U = 1.2D + 1.6L（柱與基礎用）</i>

'<h3>六、總結</h3>
'<b>總結：未檢核</b>。本模組為載重產生器；D = 'ru(D_calc)' kgf/m²，設計 L = 'ru(L_calc)' kgf/m²。第 17 條各用途活載重請自行核對，不代查。
#else
'<b>總結：無效輸入，未檢核</b>。厚度、重量、面積須為有效值，類別與屋頂形式須在選項內，類別 1 須輸入活載重。
#end if
`;
