# 自托管字体来源与许可

本目录下的 woff2 文件从 Google Fonts 下载后自托管，未做任何修改（含裁剪、重命名字体族名）。
文件名按「家族-字形-unicode 分片」重排，便于人读；字节内容与上游一致。

| 文件 | 家族 | 上游版本 |
|---|---|---|
| `plus-jakarta-sans-latin.woff2` / `-latin-ext.woff2` | Plus Jakarta Sans | v12 |
| `newsreader-latin.woff2` / `-latin-ext.woff2` | Newsreader | v26 |
| `newsreader-italic-latin.woff2` / `-italic-latin-ext.woff2` | Newsreader Italic | v26 |

两个家族均以 **SIL Open Font License 1.1** 发布，允许自由使用、嵌入、再分发与自托管，
条件是保留版权与许可声明（即本文件），且不得单独售卖字体本身。

- Plus Jakarta Sans — © Tokotype, https://github.com/tokotype/PlusJakartaSans
- Newsreader — © Production Type, https://github.com/productiontype/Newsreader
- OFL 1.1 全文 — https://openfontlicense.org/

升级字体时须同步更新 `src/client/styles/fonts.css` 里的 `unicode-range`：
它必须与上游 Google Fonts 下发的分片定义逐字一致，否则部分字符会落到错误的分片、
或者干脆不触发下载。
