# AIYO 影片景點擷取與重點片段重構規格

## 1. 文件目的

本文件定義 AIYO_new 專案中 YouTube 旅遊影片分析流程的重構方向。

目前系統對影片字幕的處理過度依賴 AI 直接閱讀整段 transcript，再由 AI 自由擷取景點、產生重點片段與摘要。這種方式在實際旅遊影片上會出現下列問題：

- 擷取出太多籠統地點，例如「嘉義」、「嘉義市」、「東京」、「大阪」。
- 把搜尋分類詞當成景點，例如「嘉義美食」、「東京旅遊」、「台南小吃」。
- 景點名稱重複，例如「嘉義文化路夜市」、「文化路夜市」、「文化夜市」同時出現。
- 將字幕前贅字誤判為景點名稱，例如「我們現在來到文化路夜市」。
- 重點片段標題不準確。
- 說明欄位變成逐字稿複製貼上。
- timestamp 無法穩定對應到實際介紹景點或美食的片段。
- AI 呼叫過多，速度慢且品質不穩定。

本重構目標是建立一個更穩定、更快速、更適合旅遊產品的影片分析流程。

核心原則：

AI 不應該是主要擷取器。  
AI 應該只負責最後的小標題與短描述潤飾。

---

## 2. 舊流程問題

舊流程大致如下：

1. 取得 YouTube metadata。
2. 取得 YouTube transcript。
3. 將 transcript 切成 chunks。
4. 把 chunks 丟給 AI。
5. AI 產生 summary、segments、extractedLocations。
6. 後處理嘗試清理結果。
7. geocode 驗證部分地點。
8. 輸出 VideoSummaryResult。

問題是 AI 在第 4 至第 5 步承擔太多責任，包括：

- 判斷哪些字是景點。
- 判斷哪些是美食。
- 決定 timestamp。
- 產生 segment title。
- 產生 segment description。
- 決定 extractedLocations。

這會導致模型輸出不穩定，而且錯誤會一路傳到地圖與行程規劃功能。

---

## 3. 新流程總覽

新流程改為 deterministic-first：

1. 取得 YouTube metadata。
2. 取得 YouTube transcript。
3. transcript preprocessing。
4. 選擇 TravelExtractionProfile。
5. timestamp-aware POI / food mention extraction。
6. generic location filtering。
7. normalize and dedupe。
8. Google Geocoding / Places verification。
9. deterministic moment segment generation。
10. AI polishing。
11. 輸出 VideoSummaryResult。
12. 快取結果。

流程圖：

YouTube Transcript  
↓  
Transcript Preprocessing  
↓  
TravelExtractionProfile Selection  
↓  
Timestamp-aware PlaceMention Extraction  
↓  
Generic Location Filter  
↓  
Normalize and Dedupe  
↓  
Geocode / Places Verification  
↓  
Moment Segment Builder  
↓  
AI Title / Description Polishing  
↓  
VideoSummaryResult

---

## 4. Transcript Preprocessing

### 4.1 目的

字幕資料通常包含：

- 重複字幕
- 太短的片段
- 口語填充詞
- 開場寒暄
- 無意義轉場句

這些內容如果直接交給 AI 或 regex，會污染景點名稱與片段說明。

### 4.2 輸入

TranscriptEntry[]，來源為 YouTube transcript provider。

原始欄位通常包含：

- startSeconds
- durationSeconds
- text

### 4.3 輸出

建議型別：

~~~ts
type NormalizedTranscriptLine = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  rawText: string;
};
~~~

### 4.4 處理規則

- normalize whitespace。
- 移除重複字幕。
- 合併過短且時間相近的字幕。
- 保留 startSeconds / endSeconds。
- 不可丟失 timestamp。
- 移除常見 filler prefix。

### 4.5 常見 filler

繁體中文：

- 哈囉大家好
- 今天我們要
- 我們現在來到
- 接下來
- 然後
- 好那
- 這邊可以看到
- 這間就是
- 這家就是
- 下一站
- 我們要去

英文：

- today we are
- we are now at
- right now we are
- next we are going to
- this place is
- let me show you
- here you can see

日文：

- やってきました
- こちらは
- 次は
- 今日は
- 見てください

韓文：

- 여기는
- 다음은
- 오늘은
- 지금
- 보시면

---

## 5. TravelExtractionProfile

### 5.1 目的

不同國家、語言、旅遊影片的景點與美食命名方式不同。

台灣中文影片會出現：

- 夜市
- 市場
- 老街
- 火雞肉飯
- 砂鍋魚頭

日本影片會出現：

- 神社
- 寺
- 駅
- 市場
- 拉麵
- 壽司

英文影片會出現：

- Market
- Station
- Temple
- Castle
- Tower
- Restaurant
- Cafe

因此不能只用台灣規則。

### 5.2 建議型別

~~~ts
type TravelExtractionProfile = {
  id: string;
  country: string;
  supportedLanguages: string[];
  genericLocationNames: string[];
  genericTravelTerms: string[];
  placeSuffixes: string[];
  foodTerms: string[];
  fillerPrefixes: string[];
  poiPatterns: RegExp[];
};
~~~

### 5.3 Profile 選擇

建議函式：

~~~ts
selectTravelExtractionProfile(input: {
  destinationHint?: string;
  transcriptLanguage?: string;
  title?: string;
  description?: string;
}): TravelExtractionProfile
~~~

判斷依據：

1. destinationHint。
2. transcriptLanguage。
3. video title。
4. description metadata。
5. fallback defaultGlobalProfile。

### 5.4 必備 profiles

至少建立：

- taiwanProfile
- japanProfile
- koreaProfile
- thailandProfile
- englishGlobalProfile
- defaultGlobalProfile

---

## 6. PlaceMention

### 6.1 目的

景點擷取不能只輸出字串陣列。

錯誤設計：

~~~ts
string[]
~~~

正確方向是每個景點都要保留 timestamp、上下文、信心分數與來源。

### 6.2 建議型別

~~~ts
type PlaceMention = {
  rawText: string;
  name: string;
  normalizedName: string;
  startSeconds: number;
  endSeconds: number;
  context: string;
  source: "regex" | "chapter" | "title" | "ai" | "profile-pattern";
  confidence: number;
  matchedPattern?: string;
  foods?: string[];
};
~~~

### 6.3 為什麼 timestamp 很重要

旅遊影片的重點片段必須支援：

- 點擊 timestamp 跳到該景點介紹。
- 地圖標記知道這個景點在哪段影片出現。
- 行程規劃知道影片中哪些地方值得加入。
- 使用者可以看到「這段出現哪些景點／美食」。

如果只保留名稱，後續無法穩定建立 key moments。

---

## 7. POI 與美食抽取規則

### 7.1 台灣中文 pattern

支援：

- 「OO」
- 『OO』
- 這間 OO
- 這家 OO
- 來到 OO
- 下一站 OO
- 推薦 OO
- 必吃 OO
- 必去 OO
- OO夜市
- OO市場
- OO老街
- OO公園
- OO博物館
- OO美術館
- OO車站
- OO火車站
- OO宮
- OO廟
- OO寺
- OO咖啡
- OO咖啡廳
- OO餐廳
- OO飯店
- OO小吃
- OO火雞肉飯
- OO砂鍋魚頭
- OO牛肉湯
- OO豆花
- OO冰店

### 7.2 日本 pattern

支援：

- OO駅
- OO寺
- OO神社
- OO市場
- OO公園
- OO城
- OO商店街
- OO温泉
- OO溫泉
- OO Tower
- OO Station
- OO Temple
- OO Shrine
- OO Castle
- OO Market

### 7.3 韓國 pattern

支援：

- OO시장
- OO궁
- OO타워
- OO공원
- OO역
- OO거리
- OO Market
- OO Palace
- OO Tower
- OO Park
- OO Street
- OO Station

### 7.4 英文 pattern

支援：

- at OO
- visit OO
- next stop is OO
- famous for OO
- OO Market
- OO Station
- OO Temple
- OO Shrine
- OO Castle
- OO Tower
- OO Park
- OO Museum
- OO Street
- OO Restaurant
- OO Cafe

---

## 8. Generic Location Filter

### 8.1 目的

Generic filter 是整個系統最重要的品質控制之一。

它要避免「城市名、國家名、旅遊分類詞」進入 extractedLocations。

### 8.2 建議函式

~~~ts
isGenericTravelLocation(input: {
  name: string;
  destinationHint?: string;
  profile: TravelExtractionProfile;
}): boolean
~~~

### 8.3 要拒絕的類型

1. 純國家名。
2. 純城市名。
3. 純區域名。
4. 城市 + 美食。
5. 城市 + 景點。
6. 城市 + 旅遊。
7. 城市 + 行程。
8. 城市 + 攻略。
9. 純分類詞。
10. filler-like phrase。

### 8.4 範例

Reject：

- 嘉義
- 嘉義市
- 嘉義美食
- 台南小吃
- 東京
- 東京旅遊
- 大阪攻略
- Japan
- Tokyo food guide
- Korea travel
- downtown
- city center

Keep：

- 嘉義公園
- 文化路夜市
- 林聰明砂鍋魚頭
- 台南市美術館
- 東京鐵塔
- 東京車站
- 大阪城
- Kuromon Market
- Seoul Tower
- Taipei 101

### 8.5 核心規則

Reject exact generic names。  
Do not reject specific POIs that contain generic names。

---

## 9. Normalize and Dedupe

### 9.1 目的

同一個景點在字幕中可能有多種講法。

例如：

- 嘉義文化路夜市
- 文化夜市
- 文化路夜市

應合併成：

- 文化路夜市

### 9.2 建議函式

~~~ts
normalizePlaceMentionName(
  name: string,
  profile: TravelExtractionProfile
): string

dedupePlaceMentions(
  mentions: PlaceMention[]
): PlaceMention[]
~~~

### 9.3 Dedupe 策略

- normalize whitespace。
- normalize 臺/台。
- 移除 filler prefix。
- 移除過度泛用的 destination prefix。
- 同名或高度相似名稱合併。
- 時間相近且名稱相同者合併。
- 保留 confidence 較高者。
- 合併 foods。
- 保留最乾淨 context。
- 保留最早有效 timestamp。

---

## 10. Geocode / Places Verification

### 10.1 目的

並非所有抽出的候選詞都應進入地圖。

只有 map-ready POI 應該進入 extractedLocations。

### 10.2 查詢策略

查詢 Google 時應加入 destinationHint。

例如：

- 文化路夜市 嘉義
- 林聰明砂鍋魚頭 嘉義
- Tokyo Tower Tokyo
- Osaka Castle Osaka
- Myeongdong Seoul

不要只查：

- 文化路夜市
- Tower
- Market

### 10.3 驗證條件

一個地點能進入 final extractedLocations，至少應符合下列之一：

1. Google geocode / Places 驗證成功。
2. local catalog fallback 有可靠座標。
3. 高信心具體 POI，且具明確 suffix 與 timestamp evidence。

### 10.4 API 不可用時

如果 Google API key 不存在或請求失敗：

- 不要讓整個影片摘要失敗。
- 回傳 fallback moments。
- 標記 geocodeWarnings。
- 不要把 generic city names 放進 extractedLocations。

---

## 11. Moment Segment Builder

### 11.1 目的

重點片段不應該只是 transcript chunk。

重點片段應該代表：

某段時間內影片正在介紹一個可行程化的地點、美食、店家、景點或活動。

### 11.2 建議型別

~~~ts
type TravelMomentSegment = {
  id: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  text: string;
  summary: string;
  highlights: string[];
  locationHints: string[];
  foods?: string[];
  sourceTranscriptLineIds?: string[];
  confidence?: number;
};
~~~

### 11.3 建立規則

以 PlaceMention 為中心建立 segment。

預設 window：

- startSeconds = mention.startSeconds - 10
- endSeconds = mention.endSeconds + 45 到 90 秒

需要 clamp 到影片有效範圍。

如果附近有同一地點或相關美食，可以合併。

如果兩個不同 POI 太接近，但內容相關，可以保留同一 segment。  
如果 POI 不同且介紹內容不同，應拆成不同 segment。

### 11.4 排名規則

如果候選太多，優先保留：

1. geocode verified。
2. 有具體 POI suffix。
3. 有 food terms。
4. 重複提及。
5. timestamp context 清楚。
6. confidence 高。
7. 對旅客有實際幫助。

---

## 12. Segment Title Rules

### 12.1 目標

標題要短、準確、可行程化。

不要複製字幕。

### 12.2 格式

主要地點 + 旅遊意圖

範例：

- 文化路夜市小吃散步
- 林聰明砂鍋魚頭重點
- 民主火雞肉飯必吃
- 東京鐵塔拍照視角
- 大阪城景點介紹
- 明洞夜市美食散步

### 12.3 禁止

- 嘉義美食介紹
- 旅遊重點
- 這段影片介紹
- 目的地規劃
- 在地美食
- 我們現在來到文化路夜市

---

## 13. Segment Description Rules

### 13.1 目標

描述應該說明使用者點擊這個 timestamp 會看到什麼。

### 13.2 規則

- 一句話。
- 繁體中文最多約 80 字。
- 不貼逐字稿。
- 不出現冗長口語。
- 不出現大量「然後、就是、這邊」。
- 不編造 transcript 沒有的資訊。

### 13.3 Good Examples

- 這段介紹文化路夜市周邊小吃與晚間散步動線。
- 這段聚焦砂鍋魚頭的排隊情況與招牌料理。
- 這段整理東京鐵塔周邊視角與適合拍照的位置。

### 13.4 Bad Examples

- 我們現在來到文化路夜市然後這邊可以看到很多吃的然後等一下會去吃火雞肉飯。
- 這支影片介紹了嘉義美食，很適合旅遊規劃。
- This part of the video provides useful travel context.

---

## 14. AI Polishing Layer

### 14.1 AI 的責任

AI 只能做：

- 潤飾短標題。
- 壓縮短描述。
- 根據候選 moments 排序。
- 修正不自然語句。

### 14.2 AI 不可以做

AI 不可以：

- 自由新增地點。
- 自由新增 timestamp。
- 把 generic city 當 POI。
- 把 transcript 原文貼進 description。
- 輸出未驗證或不在候選中的 locationHints。
- 改掉 startSeconds / endSeconds。

### 14.3 AI Prompt 要求

AI prompt 應明確要求：

- Return valid JSON only。
- Preserve startSeconds。
- Preserve endSeconds。
- Preserve locationHints。
- Preserve foods。
- Do not invent locations。
- Do not output raw transcript。
- Title must be short。
- Text must be concise。
- No generic travel wording。

---

## 15. VideoSummaryResult Integration

最後輸出仍需符合現有前端需求。

VideoSummaryResult 應包含：

- title
- summary
- segments
- extractedLocations
- video
- debug
- geocodeWarnings
- mapsProvenance

VideoRecommendation 應包含：

- id
- videoId
- title
- thumbnail
- url
- duration
- summary
- description
- source
- channelTitle
- publishedAt
- timestamps
- summarySegments
- extractedLocations

timestamps 應由 final segments 產生：

~~~ts
timestamps = segments.map(segment => ({
  time: segment.timestamp,
  label: segment.title
}))
~~~

---

## 16. Frontend Display

VideoSummaryDrawer 應清楚呈現：

- timestamp
- short title
- short description
- 出現的景點
- 出現的美食

建議顯示：

03:20 文化路夜市小吃散步  
這段介紹夜市周邊小吃與晚間散步動線。  

出現的景點／美食：
- 文化路夜市
- 火雞肉飯
- 砂鍋魚頭

不應顯示整段逐字稿。

---

## 17. 測試策略

### 17.1 Unit Tests

應測試：

- transcript preprocessing
- filler prefix removal
- profile selection
- generic location filtering
- POI extraction
- food extraction
- mention normalization
- dedupe
- moment segment generation
- AI polishing fallback
- no raw transcript dumping

### 17.2 Fixture Scenarios

#### Scenario A: 嘉義美食

Transcript 包含：

- 嘉義
- 嘉義市
- 嘉義美食
- 文化路夜市
- 林聰明砂鍋魚頭
- 民主火雞肉飯
- 火雞肉飯
- 砂鍋魚頭

Expected：

- final extractedLocations 不應只有嘉義、嘉義市、嘉義美食。
- generic city names 應被過濾。
- 具體 POI 應被保留。
- foods 應被標記。
- segment title 應短且具體。
- segment text 不應是逐字稿。
- timestamp 應接近實際提及時間。

#### Scenario B: 東京自由行

Transcript 包含：

- 東京
- 東京旅遊
- 東京鐵塔
- 東京車站
- 淺草寺
- 拉麵

Expected：

- 東京、東京旅遊被過濾。
- 東京鐵塔、東京車站、淺草寺被保留。
- 拉麵作為 food。
- 不把拉麵當成地圖 POI，除非有具體店名。

#### Scenario C: English Osaka Video

Transcript 包含：

- Osaka
- Osaka travel guide
- Osaka Castle
- Dotonbori
- Kuromon Market
- takoyaki

Expected：

- Osaka、Osaka travel guide 被過濾。
- Osaka Castle、Dotonbori、Kuromon Market 被保留。
- takoyaki 作為 food。
- segments 有 timestamp、title、description、locationHints。

---

## 18. 驗收標準

完成後應符合：

1. 影片景點擷取不再主要依賴 AI 自由判斷。
2. 具體 POI 優先於城市名。
3. generic city names 不會進入 final extractedLocations。
4. 地點 mention 保留 timestamp。
5. 重點片段由 timestamp-aware mentions 產生。
6. segment title 短且具體。
7. segment text 不再是逐字稿 dump。
8. 支援台灣、日本、韓國、英文通用影片。
9. Google geocode / Places 驗證整合正常。
10. API 不可用時有 fallback，不會 crash。
11. 前端可以清楚顯示景點與美食。
12. lint/build/test 通過或阻礙被記錄。

---

## 19. 已知限制

1. 沒有 transcript 時，不能產生精準 timestamp。
2. 只有 description 時，不應假造時間戳。
3. Google API 不可用時，地圖驗證準確度會下降。
4. 美食名稱不一定是 map-ready POI。
5. 沒有具體店名時，食物應標記為 food，而不是 extractedLocation。
6. 多語字幕可能需要更完整的 profile 與 alias table。
7. 自動字幕錯字會影響 POI extraction。

---

## 20. 後續可擴充方向

1. 加入 Google Places Details 取得營業時間、電話、照片。
2. 加入 Wikidata / OpenStreetMap 補充驗證。
3. 建立台灣、日本、韓國常見 POI alias table。
4. 建立 food-to-place relation。
5. 對 transcript 做更細的 sliding window ranking。
6. 對同一影片快取 verified places。
7. 建立影片分析品質分數。
8. 在 UI 顯示 confidence 或 verified badge。
9. 加入人工修正 extractedLocations 的介面。
10. 將使用者修正回饋寫入 local alias / correction table。

---

## 21. Implementation Checklist

- [x] Create transcriptProcessing.ts
- [x] Create travelExtractionProfiles.ts
- [x] Create placeMentionExtractor.ts
- [x] Create genericLocationFilter.ts
- [x] Create placeMentionNormalizer.ts
- [x] Create momentSegmentBuilder.ts
- [x] Update geocode integration
- [x] Update videoSummaryService.ts
- [x] Update promptBuilder.ts
- [x] Update responseParser.ts if needed
- [x] Update types/index.ts with optional fields if needed
- [x] Update VideoSummaryDrawer display if needed
- [x] Add unit tests
- [x] Add fixture transcripts
- [x] Run npm run lint
- [x] Run npm run build
- [x] Run npm test
- [x] Document remaining limitations
