# OpenClaw Exposure Watchboard

一个纯前端表格页面，用于展示仓库内 `data/exposure_watchboard_data.csv` 的数据。

## 使用方式

```bash
python -m http.server 8000
```

浏览器打开：`http://localhost:8000`

## 功能

- 固定列顺序展示字段。
- 读取 CSV 数据集并渲染为表格。
- 每页 100 行。
- 支持上一页 / 下一页翻页。
