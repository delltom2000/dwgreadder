---
title: 图阅 DWG / 3DM
emoji: 📐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: gpl-3.0
short_description: 本机解析 DWG / 3DM，支持结构定位、三维旋转和部件聚焦
---

# 图阅 · DWG / 3DM 阅读器

打开 DWG 浏览二维图纸，打开 Rhino 3DM 旋转查看三维模型。

- 左侧：最近打开的文件，可展开或收起。
- 中间：DWG 平移缩放；3DM 左键旋转、右键或 Shift 拖动平移、滚轮缩放。
- 右侧：图层、对象/部件目录和属性，可展开或收起。点击目录项目或三维几何对象自动聚焦。

**文件仅在你的浏览器中解析，不上传到此 Space 的服务器。** 最近打开记录保存于当前浏览器本机存储，可单条移除或清空。Space 不包含用户的私有图纸、模型、历史副本或截图。

支持 100 MB 以内的 DWG / 3DM。部分 CAD 自定义对象、图案填充和没有显示网格的 Rhino 曲面可能不能完整显示；需要时请在 Rhino 中保存显示网格后另存。

源码及构建说明：[GitHub](https://github.com/delltom2000/dwgreadder)。部署仓库包含同版程序源码与 GPL 许可证，技术说明见 `PROJECT_README.md`。
