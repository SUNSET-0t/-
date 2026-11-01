# 自动运行接线 v0.4.0

用户确认的默认流程：配置API和最多一个辅助模型后直接正常游玩。高级设置可以存在，但不是完成基础功能所需步骤。

## 实现

入口release-0.4.0.js加载automatic/entry.mjs，在UI操作之前注册npcR2BInterceptor。复用0.3.1简单设置与0.3.0凭据模块，不重填Key；辅助生成使用取消感知的原生同源transport。

interceptor只处理normal/swipe/regenerate；quiet/impersonate/continue不另开判断。原生hook由酒馆await，失败显式abort(true)，不能只抛异常，因为宿主会捕获后继续。

材料读取用ctx.chat的当前mes（不是swipes全集或屏幕渲染HTML）。swipe排除正在重生成的末条助手消息，regenerate按宿主已删后的记录。规划标签剔除，内心与离场事件独立类型。当前玩家输入标planned_not_observed。卡片从当前角色及启用群成员读取；世界书从全局选中、角色主/辅助书、聊天和persona的关联名称读取。只调用loadWorldInfo，不调用getWorldInfoPrompt/getSortedEntries重新触发世界书事件。

一个辅助请求同时识别人和立场。解析JSON并校验证据ID、人物名出现于所引用证据、最多4人和长度上限。结构通过不等于语义正确，不预定拒绝、嫉妒、玩家成功或失败。

使用setExtensionPrompt自身命名空间、in-chat depth0 system、scan=false；不替换主预设或其它扩展注入。监听实际最终prompt事件仅用于确认，不重写模型响应。停止/聊天切换/编辑使epoch失效，取消正在进行的helper fetch；对原聊天及路由指纹作二次检查。

缓存只在当前页面内保留16项，包含聊天ID、材料、模型配置。相同上下文手工重生成可复用，不扩大成跨档记忆。没有生成后辅助调用，也不把人物意向保存为既成事件。

## 默认策略

多数剧情互动会调用一次辅助模型；只把明确状态/背包查看本地跳过。不得宣传300轮只需要极少调用或延迟为零。复杂/快进按已配置高级路由直接选择一个模型，资料整理合并，不先轻量再升级。未知价格不估作零。

辅助失败停在正文前，提供明确的一次跳过操作。不自动重试、不把错误当通过。不声称AbortController能撤销服务商已执行的推理费用。

## 限制

最近8条历史、约18000字符总材料预算、最多12本书/10个条目候选、最多4个NPC。不是完整持久记忆、不是完整世界书激活语义。复杂未适配触发条目跳过有提示，原著未来秘密仍可能出现在设定材料中，提示词要求限知但无法形式保证语义不泄漏。

真实宿主事件顺序和其他扩展可影响提示词；最终标记确认是诊断而非完全兼容保证。输入/注入不会写回原聊天或修改角色卡、好感、世界书；UI消息状态只是DOM元素，刷新不持久。

## 上游依据

固定版本06bde939fb1e9c4c8d8641d810f0a916b5bce127的public/scripts/extensions.js包含await的runGenerationInterceptors；public/script.js在该hook之后才构造正文，提供setExtensionPrompt和getExtensionPrompt；public/scripts/world-info.js提供选中书元数据；public/scripts/st-context.js提供loadWorldInfo等读取入口。

浏览器测试执行上述hook/收集器和原生密钥路由的实际源码，其余宿主与模型响应模拟，不冒充用户Android与真实模型实测。
