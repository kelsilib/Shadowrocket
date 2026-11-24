# Shadowrocket 个人定制配置

基于 [LOWERTOP/Shadowrocket](https://github.com/LOWERTOP/Shadowrocket) 的 `lazy_group.conf`，在 `custom` 分支维护。

## 导入与更新

在 Shadowrocket 的“配置 → 右上角 +”粘贴以下地址下载，然后选择“使用配置”。首页全局路由选择“配置”。

```text
https://raw.githubusercontent.com/kelsilib/Shadowrocket/custom/lazy_group.conf
```

已设置 `update-url` 为上述固定地址。之后可点击该配置的“更新配置”，或在 Shadowrocket 中打开配置自动后台更新（按需选择 1–7 天）。配置更新会覆盖本地对配置文件的修改；长期修改应保存在本分支。

节点订阅继续在 Shadowrocket 首页管理，本仓库不包含机场地址、节点密码、订阅令牌或解密证书。

## 定制内容

- **Apple TV**：独立手选组，覆盖 Apple TV / TV+ 服务；这不是将 Apple TV 硬件上的全部应用流量归为一组。
- **谷歌服务**：Gemini、AI Studio、NotebookLM、DeepMind、Antigravity、Jules 及源规则中的其他 Google AI 服务从 AI 规则中移出，统一走此组。`GoogleAI.list` 已去重，不再引用未过滤的 AI 总规则。
- **低倍率节点**：手选组，匹配节点名中的“实验”、`0.1x`、`0.6x`，兼容大写 X，避免误收 `10.1x`、`10.6x`。在各服务组中选择“低倍率节点”即可使用，组内再手动选具体节点。
- **小红书与 rednote**：专用直连规则置于最前，包括国内域名、海外域名 `rednote.com`、海外 CDN `rednotecdn.com`、国内 CDN 和分享短链。海外 CDN 来自两个官网页面的实际资源引用。
- **直连解析失败不回退代理**：`dns-direct-fallback-proxy = false`，防止小红书、淘宝等直连请求因 DNS 失败改走代理；解析失败时应检查直连网络或 DNS。
- **国内 DNS 与 IPv6 优化**：关闭 `ipv6 = false` 避免国内大厂 CDN 在不稳定 IPv6 环境下图片加载卡死；开启 `dns-direct-system = true` 让直连域名使用本地运营商 DNS 保证 CDN 就近调度；`dns-server` 改为国内纯 IP DNS 优先并给 DoH 附加 `#no-h3` 避免 UDP/443 QoS 卡顿。
- **全量原生 Shadowrocket 规则集**：将上游配置中混用的 4 条 `QuantumultX` 规则集（`Apple`、`WeChat`、`Global`、`China`）替换为 `Shadowrocket` 原生格式（大列表采用官方推荐的 `DOMAIN-SET` + `RULE-SET` 组合），补齐全部 IP/ASN 规则的 `no-resolve` 标记并大幅降低内存与规则体积。
- **修改前备份**：原 `custom` 分支状态已完整保留在远端分支 `backup/custom-20261124`，同时在本分支 `backups/lazy_group.conf.2026-11-24.bak` 留存文件备份。
- 修正原配置中部分服务规则的策略名大小写，使其与组名严格一致。

本分支按 LOWERTOP 原方案定制，未增加 Sukka 广告规则或静态资源分流。

`DIRECT` 使用当前网络出口，人在海外时不会自动获得国内 IP。模块规则优先于配置文件；如有模块覆盖这些域名，需同时检查模块。域名会随应用更新变化，新增漏网域名可以补入 `overrides/xiaohongshu.list`。

## 更新规则源

`main` 保留 Fork 的上游内容。请勿用“丢弃本地提交/强制同步”覆盖 `custom`。普通远程规则由 Shadowrocket 的“使用配置/编译配置”更新；本分支生成的 AI 拆分、Apple TV 和小红书规则则通过下面的脚本刷新后提交。

需要 Node.js 22 或更新版本，不需要安装第三方依赖。

```shell
git clone --branch custom https://github.com/kelsilib/Shadowrocket.git
cd Shadowrocket
node scripts/update.mjs
node scripts/check.mjs
git add lazy_group.conf rules sources
git commit -m "Refresh upstream configuration and custom rules"
git push origin custom
```

刷新会下载原配置、原 AI 规则、blackmatrix7 的 Gemini / AppleTV / XiaoHongShu 规则，重新执行定制并检查。如果源文件下载失败或关键格式变化，脚本报错，不发布未验证的配置。不会自动推送提交。

使用已保存源文件离线重建：`node scripts/update.mjs --offline`。`sources/manifest.json` 记录每份源文件的地址与 SHA-256，便于核对。自定义小红书域名请编辑 `overrides/xiaohongshu.list`，然后重新生成，避免直接改生成文件被覆盖。

## 验证范围

已提供策略引用和默认值检查、倍率筛选边界检查、AI / Google 分离检查，以及国内和海外小红书、Google AI、Apple TV 等域名的自定义规则命中检查。可执行 `node scripts/check.mjs` 重跑。

这些是本机静态和规则匹配检查，尚未在 iPhone / iPad / Apple TV 的 Shadowrocket 内实测编译、节点解锁和实际播放。导入后可用“测试规则”和代理日志检查命中情况。

## 来源

- 配置与使用手册：[LOWERTOP/Shadowrocket](https://github.com/LOWERTOP/Shadowrocket)
- AI 原规则：[iab0x00/ProxyRules / Rule/AI.txt](https://raw.githubusercontent.com/iab0x00/ProxyRules/main/Rule/AI.txt)
- 服务规则：[blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)，原项目采用 GPL-2.0 协议，保留在 `licenses/blackmatrix7-GPL-2.0.txt`。
- 本分支保留原文件来源，不改变上游材料各自的授权条款。完整原版手册可查看 [main 分支](https://github.com/kelsilib/Shadowrocket/tree/main)。
