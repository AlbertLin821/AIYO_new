# 第三方來源與授權邊界

本文件提供來源導覽，不取代各套件的授權全文或完整 SBOM。自有程式碼尚未指定儲存庫層級的統一授權；本次文件整理不新增或變更授權。

## npm 依賴

直接依賴與版本範圍列於 [package.json](aiyo/package.json)，包含 Next.js、React、Prisma、NextAuth、MapLibre GL、BullMQ、Zustand 等。精確解析版本與間接依賴以 [package-lock.json](aiyo/package-lock.json) 為準。重新散布應檢查實際安裝版本的 LICENSE，不以本文件概括授權所有依賴。

## 隨儲存庫保存的原始碼

Mem0 原始碼位於 [archive/legacy/20260605-005529/vendor/mem0](archive/legacy/20260605-005529/vendor/mem0)，其 [LICENSE](archive/legacy/20260605-005529/vendor/mem0/LICENSE) 保留上游授權。目錄雖名為 archive，現行 [Mem0 Dockerfile](docker/mem0-service/Dockerfile) 仍使用它建置服務。

AIYO 的環境整合修正集中於 [docker/mem0](docker/mem0)。引用第三方專案不代表該專案為 AIYO 撰寫或認可本系統。vendor 內子專案可能另有授權，不能只檢查最外層檔案。

## 映像、模型與外部資料

[docker-compose.yml](docker-compose.yml) 指定 PostgreSQL／pgvector、Redis、Open WebUI 等映像；[Dockerfile](aiyo/Dockerfile) 安裝 yt-dlp。容器映像及其包含套件具有各自授權。

Ollama 使用的模型、Mem0 embedder 權重、YouTube 內容、地圖圖資與搜尋供應者回傳資料，亦受各自條件約束。程式碼授權不涵蓋影片內容或地圖資料。展示與再散布時應保留來源、地圖 attribution，並避免把第三方內容當成專案自有素材。

模型與服務名稱在本儲存庫中用於描述實際整合，不構成商標所有權或合作關係聲明。
