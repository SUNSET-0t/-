# 原生调用决定 · v0.3.0 实现说明

用户最终强调的是安装与使用简单，而非怀疑已有密钥泄露。正常使用不允许强制安装配套服务、修改 config.yaml 或维护两个副本。独立渠道、官方地址预设、动态模型与阶段选择仍保留。

本版活动入口为 release-0.3.0.js → native/entry.mjs，不导入旧固定样本/服务器入口。所有辅助调用经酒馆同源原生后端；元数据与 Key 引用保存在插件设置，明文 Key 仅在输入时提交原生 secrets/write，不写普通设置、聊天、世界书、日志或代码库。

## 先前“完全不改变活动项”的约束需如实限定

核对的原生 secrets/write 必定将新项设为 active；目前没有非活动追加接口。不能假装传 active:false 就能解决，也不能把 write→rotate 说成原子隔离。本版实施新增后恢复原默认并验证；复用已有 ID 不进行 write/rotate。不存在旧默认时创建空默认，以保持默认有效值为空。

本页面保存串行化，已在生成时禁止保存，生成拦截等待进行中的保存。记录无密钥的恢复信息，异常时校验并暂停辅助请求；不覆盖另一窗口的显式默认切换。Web Locks 可用时串行本插件多个窗口操作，但酒馆其它界面/插件不一定遵守锁，故仍不是全服务器事务。

正常保存完成后，正文的 model/source/url 与原默认有效密钥保持原样；保存过程中在其它窗口启动同类默认请求仍有竞态风险，应避免。这个限制写入界面与 README，不声称零风险。

## 费用与未实现范围

读取本地设置/密钥元数据、保存、模型列表不触发生成。测试生成必须确认，固定短输入，一次请求，无自动重试或正文重Roll。原生宿主和服务商可能对思考预算有自身处理，实际费用仍以服务商计量。

当前聊天自动取材和人物决策流程后续接入。通用界面不再以测试角色和日期填空，正常使用不需要手写人物 JSON。当前版本只承诺已经实现的渠道流程。

## 来源

- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/secrets.js
- https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/backends/chat-completions.js
