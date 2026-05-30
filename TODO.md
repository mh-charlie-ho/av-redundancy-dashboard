# 待辦清單

## 已知 UI 問題（下次回來繼續）

### 1. 視覺化畫面字體太小
- canvas 內的 SVG 文字（感測器標籤、比例尺）在手機上顯示過小
- 目前字體大小為固定 px 值，未隨裝置縮放調整
- 可考慮依 `viewBox` 比例或 `ppm`（pixels per meter）動態計算字體大小

### 2. 背景網格未填滿全畫面
- 手機上移除 `p-4` 後，SVG 雖然 `w-full h-full`，但網格 pattern 的 rect 僅覆蓋固定 `width=1200 height=600` 的 viewBox 範圍
- 當螢幕比例與 viewBox 不符（尤其直式手機）時，網格會有空白邊緣
- 修法：將填充 pattern 的 `<rect>` 改為遠超 viewBox 的尺寸（如 `width=9999 height=9999 x=-4000 y=-4000`），讓 pattern 真正無限延伸

### 3. 設定面板（手機全螢幕覆蓋層）內容過多，感測器列表在短螢幕上無法捲到
- 覆蓋層目前結構：覆蓋層 Header → Actions bar（Import/Export/Reset）→ SensorControlPanel
- SensorControlPanel 內部由上到下：View Controls → System Status → Vehicle Settings → Sensors 列表
- 感測器列表（最下方）在 View Controls 等區塊佔用過多空間後，可能超出畫面
- 可考慮方向：
  - 將 View Controls 等非感測器設定摺疊預設關閉，除了 system 之外其他東西都要預設關閉
  - 或把 Actions bar 移進 SensorControlPanel 頂部，減少覆蓋層固定高度的佔用
  - 或確保整個 SensorControlPanel 的 scroll 正確運作（目前 `h-full` 高度鏈在 iOS Safari 上可能有差異）
