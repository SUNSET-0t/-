# 渠道预设与阶段模型 · 开发中

用户基于柏宝书界面确认：常用渠道自动内置官方地址，普通使用不必寻找或填写 Base URL；第三方中转则用自定义渠道。2026-10-31。

## 本提交实际完成范围

`connections/providers.mjs` 为纯函数基础模块：官方地址预设、协议区分、Vertex 项目/区域地址生成、自定义地址检查、无密钥渠道元数据、模型响应分页整理、单次任务路由。

`tests/providers.test.mjs` 为无网络单元测试。**本提交没有接入现有界面，没有保存或调用真实 API Key，没有实现独立服务端传输，也没有修改 main 的可安装版本。**测试通过不能当作所有渠道已连通。

## 正常操作设计

设置页分成「阶段使用模型」和「渠道」两区，参考用户截图的交互而非复制其源码。

阶段：资料整理／常规人物判断／复杂人物判断／累积变化检查。每一行选择一个渠道和该渠道的一个模型，可使用同一渠道的不同模型，也可全部共用。阶段是路由设置，不是每次依次请求四次。

渠道列表：显示自定义名称、提供商、默认模型、连接状态，提供添加/编辑/复制/删除。复制渠道只复制非秘密配置；删除时检查阶段引用，不暗中替换为主正文接口。

新增/编辑：
1. 渠道类型（提供商），与模型名称分开。
2. 渠道名称，可同时创建同一提供商的多个连接。
3. 官方 Base URL 默认固定、只读或收在详情中；自定义渠道才提供编辑。
4. API Key 眼睛按钮仅局部临时显示。安全保存需独立凭据服务；不得塞入聊天、世界书、普通扩展设置或导出文件。
5. 获取模型列表 → 可搜索模型选择器；手动 ID 作为明确标记的未验证选项。
6. 高级：输出预算、超时、温度（可省略）、思考参数（跟随提供商，不能把 auto/max 当所有模型通用值）、流式开关与可选参数排除。
7. 「保存」「获取模型」「测试生成」分开。保存不发生成请求；模型查询不发正文；生成测试明确提示可能收费且使用极小固定测试，不带真实聊天。

更换提供商、地址或凭据版本后使原模型列表失效。变更官方提供商时不得静默沿用另一家密钥。首次选择的模型不默认选最贵项，列表和价格未知就明确显示未知。

## 预设来源与适配边界

- OpenAI（GPT）：https://api.openai.com/v1 。https://developers.openai.com/api/reference/resources/models/methods/list
- Google AI Studio（Gemini）：https://generativelanguage.googleapis.com/v1beta ，使用 Gemini 原生协议；有分页的 models.list。https://ai.google.dev/api/models
- Anthropic（Claude）：https://api.anthropic.com/v1 ，使用原生 Messages 适配，不冒充 OpenAI 兼容。https://platform.claude.com/docs/en/api/models/list
- DeepSeek 官方：https://api.deepseek.com 。https://api-docs.deepseek.com/api/list-models/
- OpenRouter：https://openrouter.ai/api/v1 。模型目录不保证账户权限、余额或模型调用成功。https://openrouter.ai/developers
- 硅基流动：https://api.siliconflow.cn/v1 。https://docs.siliconflow.cn/docs/userguide/quickstart 。本提交未核实其模型发现路由，标记需适配，不猜测成功。
- 火山方舟（北京·按量 API）：https://ark.cn-beijing.volces.com/api/v3 。https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=zh 。此地址不是 Coding Plan；模型发现/开通状态需单独适配，当前不可假设通用 GET /models 完全适用。
- Google Vertex AI：标准项目模式依据 project/location 拼接，不用 AI Studio 的地址/认证混充。global 为 aiplatform.googleapis.com，区域主机按官方模板生成。https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations 。Express 等其它模式如需支持，应另设适配入口。
- 自定义（兼容 OpenAI）：手工 Base URL，用于第三方中转或本地服务。

官方预设不硬编码永久模型名单。模型由实际响应产生，保留提供商的原始 ID。能力字段缺失为未知，列表存在并不证明支持 JSON 输出、当前请求协议或密钥有调用权限。分页须完整处理；错误返回不能当作空列表，更不能填充内置推荐型号冒充请求成功。

## 不照搬截图中的默认值

初始预算使用 2048 输出 token、120 秒超时、非流式；这是可调的起点而非通用上限。思考预算与可见输出是否共用额度取决于具体适配器，必须在显示预算时说清楚，截断报错不自动重试。

不强制温度=1，不给所有模型发送 reasoning_effort=auto/max，不把 65535 作为所有辅助任务的默认输出预算。参数排除只能删除适配器允许的可选字段，不得移除模型、输入、认证或必需协议字段。高级请求参数不得覆盖固定官方 URL 或注入额外认证目标。

## 接入与验收

密钥隔离、服务端访问控制、SSRF/重定向限制与具体模型请求适配完成后再接 UI。仅检查 URL 的纯函数不是网络安全边界。模型列表只显示已接入适配的渠道能力；未支持的功能明确禁用。

开发分支中验证 → 小额用户自选接口实测 → 合并 main。正常酒馆安装地址不变，不能让用户再次为中间状态反复更新。
