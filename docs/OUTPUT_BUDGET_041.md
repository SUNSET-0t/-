# 0.4.1-r2b：辅助输出长度截断修复

用户截图显示0.4.0已读取5条聊天、9条世界书、16244字符，模型deepseek/deepseek-v4.1-flash-1017返回“输出被额度截断”。这表明返回的finish_reason是length等长度终止标志，不等于账户余额不足。截图没有返回usage，不能确定当时到底用了多少思考token或设置上限。

## 已核对的缺口

旧简单设置默认2048输出额度且思考跟随接口。思考与可见JSON可能共享输出上限；把reasoning从返回中隐藏不等于关闭思考。0.4.0先抛出长度错误再提取usage，因而丢失了最重要的诊断数据。

## 本补丁行为

新增纯请求规划：自动人物判断遇到已识别的DeepSeek V4.1 Flash/官方deepseek-flash别名，且配置仍为旧2048+provider-default组合时，本次请求使用8192总生成上限。对已核对的OpenRouter原生源、OpenRouter官方自定义地址、DeepSeek官方地址，明确请求low思考；不关闭思考、不切模型、不重试。

自定义中转不能只根据模型ID就认定参数协议；未核对地址只调整上述旧默认上限，不注入专有思考参数，并标记未知。其它模型、非默认额度或显式思考设置按原参数运行。被用户排除的reasoning_effort不重新发送。

旧格式未记录2048到底是默认还是用户特意设置，因此默认适配会处理这一个歧义组合；进阶“严格使用接口中保存的参数”可完全关闭适配，包括保留2048。不会改写渠道、Key、原正文参数或持久配置，不要求重新填写。新策略只作用于自动判断，不改变单独的64-token连接探针。

8192是总生成请求上限，不是要求生成8192，也不是预估费用；可能提高最坏情况下的辅助费用。low是给提供商的请求值，不能保证模型在固定思考token数以内结束，也不能保证任何输入都不再截断。未默认给65535，也不无限增加上限。

## 可见诊断

运行页显示本次有效上限与思考控制，返回后显示总输出/思考token（接口提供时）及可见文本字符数；进阶有数字详情。缺失数据为null/未知，不当作0。只保留数字和受控结束原因，不保存/显示思考原文、密钥或原始响应。

仍然拒绝finish_reason=length/max_tokens的响应，即使文本偶然能JSON解析；不修补半截JSON作为有效决定，不自动续写。失败调用宿主中止回调，昂贵正文不发送；辅助请求已执行可能已经计费。既有单次跳过与停止功能不变。

缓存包含策略版本/模式，切换策略使缓存失效。复用时明确提示显示的是原请求用量而非新费用。

## 测试

增加旧2048→8192/low请求、用户自定参数保留、未知中转不猜协议、源代码中OpenRouter参数转发、缺失usage、思考吃满预算、JSON看似完整仍拒绝截断、一次辅助/零正文失败路径的测试。浏览器以用户截图型号运行模拟服务商，检查手机和桌面的用量展示。

真实API密钥未使用、服务商响应模拟。这个补丁修复默认策略和诊断缺口，不宣称真实模型已通过或low不会影响拟真质量；人物效果仍须后续实际观察。

## 核对资料（2026-11-01）

- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens ：reasoning占用输出上限，隐藏不同于禁用，降低effort或留足预算。
- https://api-docs.deepseek.com/guides/thinking_mode/ ：默认思考high，low/high/max与关闭思考的协议分别定义。
- https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017 ：截图型号与官方deepseek-flash的对应说明。
- https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/backends/chat-completions.js ：原生OpenRouter将reasoning_effort转入reasoning.effort；include_reasoning只控制exclude。
