# 当前优先决定：复用酒馆原生请求与凭据能力

状态：用户确认的改造要求，替代 v0.2.x 默认要求安装 npc-independent-api 服务器模块的路径。本文件不是新版本发布说明，现有运行代码未因本文自动改变。

## 用户目标
用户以手机操作酒馆为主，电脑暂不在身边。要求像普通网页扩展一样安装和调用辅助 API，不额外安装服务端模块、不手动改 config.yaml，同时担心 API Key 泄露。

## 必须保留
插件内渠道管理、常用官方地址预设、接口实际返回的模型列表、不同阶段选择模型；不强制使用正文模型、不把 Connection Profiles 变回唯一的界面入口。默认每次必要判断尽量只发一次辅助请求，不自动审核重Roll。

## 调用与凭据方向
优先复用酒馆现有的同源后端请求与凭据管理。已核对 release/public/scripts/extensions/shared.js：单次 ChatCompletionService 请求可指定 model、source、secret_id、自定义地址等。但这只证明请求层有参数覆盖能力，不代表完整渠道保存、模型发现和所有协议都已经验证。

Key 不写入 extensionSettings、localStorage、聊天、世界书、提示词、普通导出、日志、错误文本或 GitHub。正常请求优先用已保存密钥的引用，不回读完整 Key，不要求开启 allowKeysExposure。

新增独立密钥必须验证：原正文的活动密钥、模型、地址与连接选择不变。原生 secrets write 会改变同类活动项，不能默默采用“先切换再切回”并宣传原子隔离。仍需确定可靠的保存方案；验证不通过就明确限制，不回退为明文普通设置存储或额外安装服务的强制要求。

调用目标只允许用户明确配置的提供商。不能悄悄增加开发者转发服务器、上传遥测中的凭据、让 Key 进入模型输入。保留官方地址校验和必要的脱敏检查。

## 安全解释
额外的本地服务器模块不等于已经发生泄露；不需要额外安装的网页扩展也不自动安全。不要指称未审计的其他插件泄露或安全。

API 地址和 API Key 不是一回事。固定官方 Base URL 可以公开，Key 是认证秘密。真正风险包括普通前端配置明文存储、第三方扩展读取、日志或公开仓库泄露，以及手机到酒馆经公网 HTTP 明文传输。服务商 HTTPS 不会自动保护前一段 HTTP 链路。

服务端保存也不是对服务器管理员的隔离，不能承诺零泄露。只向用户说明代码实际做到的保护与剩余风险。发现明确泄露时才建议吊销/重建 Key，不以一个界面报错推断已泄露。

## 当前安排
用户暂停配套服务安装，不再要求其继续 clone、开启 enableServerPlugins 或清缓存。完成原生请求、密钥和主配置不变的兼容测试后再发布替代版本。不得声称这份要求文档已让当前 0.2.1 变成免安装版。

参考：
- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://docs.sillytavern.app/for-contributors/provider-integrations/
- https://docs.sillytavern.app/usage/faq/
- https://docs.sillytavern.app/usage/remoteconnections/
- https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/shared.js
- https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/secrets.js
