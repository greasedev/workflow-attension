# MVP PRD：关注组合管理 Agent 网页 DEMO

## 1. 产品名称

**Attention Portfolio Agent**
中文名：**关注组合管理 Agent**

## 2. MVP 目标

帮助用户围绕一个兴趣领域，建立一个：

```text
高聚焦、低茧房、多视角的关注列表
```

例如用户输入：

```text
AI Agent
```

系统不是简单推荐热门账号，而是帮助用户生成一个结构化关注组合：

```text
核心关注 Core
多元视角 Diversity
趋势雷达 Radar
```

并通过 UI 告诉用户：

```text
你现在的信息源是否过于单一？
缺少哪些视角？
应该新增、保留、静音或移除哪些关注对象？
```

---

# 3. MVP 用户路径总览

网页 DEMO 只需要完成这条主流程：

```text
用户输入兴趣领域
↓
选择关注目标
↓
生成关注组合结构
↓
查看推荐关注列表
↓
查看关注组合健康度
↓
调整关注列表
↓
生成最终关注方案
```

---

# 4. 页面结构

MVP 建议做成一个单页 Web App，分成 5 个主要页面 / 状态：

```text
1. Landing / 输入兴趣领域
2. 目标选择页
3. 关注组合生成页
4. 关注列表管理页
5. 健康度报告页
```

---

# 5. 页面一：Landing / 输入兴趣领域

## 页面目标

让用户输入自己想长期关注的领域。

## 页面标题

```text
Build a focused but diverse attention portfolio
```

中文：

```text
建立一个既聚焦、又不形成信息茧房的关注列表
```

## 页面元素

### 1. 兴趣领域输入框

Placeholder：

```text
请输入你感兴趣的领域，例如：AI Agent、Web3、量化交易、独立开发
```

示例：

```text
AI Agent
```

### 2. 示例标签

用户可以直接点击：

```text
AI Agent
Crypto
Indie Hacking
Robotics
Climate Tech
Longevity
```

### 3. 主按钮

```text
Start Building
```

中文：

```text
开始生成关注组合
```

## 用户操作流程

```text
用户输入：AI Agent
↓
点击：开始生成关注组合
↓
进入目标选择页
```

## 空状态 / 错误状态

如果用户没有输入内容，点击按钮后提示：

```text
请先输入一个你感兴趣的领域
```

---

# 6. 页面二：目标选择页

## 页面目标

让用户告诉系统：他关注这个领域的主要目的是什么。

因为不同目标会影响关注列表配比。

比如同样是 AI Agent：

```text
技术学习型用户
创业机会型用户
投资研究型用户
产品经理型用户
```

需要的关注源不同。

---

## 页面标题

```text
你关注「AI Agent」的主要目的是什么？
```

## 页面说明

```text
我们会根据你的目标，为你生成不同的信息源组合。
```

## 目标选项

使用卡片形式展示。

### 选项 1：技术学习

```text
我想学习技术实现、框架、代码和开源项目
```

标签：

```text
Engineering / Open Source / Tutorials
```

### 选项 2：产品机会

```text
我想发现新产品、新工具和应用场景
```

标签：

```text
Product / Tools / Use Cases
```

### 选项 3：创业与商业化

```text
我想观察创业机会、商业模式和市场趋势
```

标签：

```text
Startup / Market / GTM
```

### 选项 4：投资研究

```text
我想跟踪赛道趋势、公司动态和投资机会
```

标签：

```text
VC / Trends / Companies
```

### 选项 5：企业应用

```text
我想了解企业真实落地、ROI 和部署案例
```

标签：

```text
Enterprise / Case Study / ROI
```

### 选项 6：综合关注

```text
我想保持全面了解
```

标签：

```text
Balanced
```

---

## 交互规则

用户可以单选，也可以多选。

MVP 建议：

```text
最多选择 3 个目标
```

选择后，页面右侧或底部显示当前选择：

```text
当前关注目标：
- 技术学习
- 产品机会
- 创业与商业化
```

## 主按钮

```text
Generate Portfolio
```

中文：

```text
生成关注组合
```

---

# 7. 页面三：关注组合生成页

## 页面目标

展示系统为用户生成的关注组合结构。

这一步不直接展示账号，而是先展示“信息摄入结构”。

---

## 页面标题

```text
你的 AI Agent 关注组合建议
```

## 页面核心模块一：组合配比图

可以用环形图、柱状图或简单卡片展示。

示例：

```text
技术深度来源：35%
产品和工具来源：25%
开源项目来源：15%
创业和商业化来源：10%
批判性观点来源：10%
跨领域来源：5%
```

## 页面核心模块二：三层关注结构

用三列卡片展示。

---

## A. Core List 核心关注

说明：

```text
长期关注的高质量信息源，帮助你保持领域聚焦。
```

内容类型：

```text
研究者
开源项目维护者
大模型公司工程师
高质量技术博客
深度产品构建者
```

建议数量：

```text
20 - 30 个
```

---

## B. Diversity List 多元视角

说明：

```text
帮助你避免只看到同一类观点，补充反方、实践和边缘视角。
```

内容类型：

```text
批判者
失败案例分析者
企业用户
安全研究者
监管 / 伦理观察者
非英语来源
```

建议数量：

```text
10 - 15 个
```

---

## C. Radar List 趋势雷达

说明：

```text
临时观察新项目、新账号和新趋势，30 天后复查是否值得长期关注。
```

内容类型：

```text
新创业者
新开源项目
新工具发布账号
早期社区
新 benchmark
```

建议数量：

```text
15 - 30 个
```

---

## 主按钮

```text
View Recommended Sources
```

中文：

```text
查看推荐关注源
```

---

# 8. 页面四：推荐关注列表管理页

## 页面目标

让用户查看、筛选、添加、移除、保留不同信息源。

这是 DEMO 的核心页面。

---

## 页面布局

建议分为左右结构：

```text
左侧：筛选器
右侧：推荐关注源列表
顶部：当前组合健康度简报
```

---

## 顶部健康度简报

展示 4 个核心分数：

```text
Focus Score：87
Diversity Score：64
Redundancy Risk：Medium
Cocoon Risk：Medium
```

中文展示：

```text
聚焦度：87 / 100
多元度：64 / 100
重复风险：中
信息茧房风险：中
```

下面给一句系统判断：

```text
你的 AI Agent 关注组合非常聚焦，但目前偏向产品和创业内容，缺少批判性观点和企业落地案例。
```

---

## 左侧筛选器

### 1. 列表类型

```text
全部
Core 核心关注
Diversity 多元视角
Radar 趋势雷达
```

### 2. 信息源角色

```text
研究者
工程师
开源作者
创业者
投资人
产品经理
企业用户
批判者
媒体 / Newsletter
```

### 3. 内容类型

```text
技术教程
产品 Demo
论文 / Benchmark
商业分析
失败案例
开源项目
观点评论
行业新闻
```

### 4. 观点倾向

```text
乐观
中立
谨慎
批判
```

### 5. 地区 / 语言

```text
英文
中文
日文
欧洲
全球
```

---

# 9. 推荐关注源卡片

每个推荐对象用一张卡片展示。

## 卡片结构

```text
账号 / 信息源名称
一句话介绍
推荐列表类型：Core / Diversity / Radar
角色标签
内容标签
观点标签
推荐理由
操作按钮
```

---

## 示例卡片

```text
LangChain

开源 AI Agent 框架与生态项目，适合跟踪 Agent 工具调用、工作流和开发框架。

推荐列表：Core
角色：开源项目
内容：框架 / 工具调用 / 开发生态
观点：偏乐观
语言：英文

推荐理由：
这是 AI Agent 开发生态中的核心项目之一，适合作为长期关注源。

[加入关注组合] [暂时忽略] [查看原因]
```

---

## 另一个示例

```text
Agent Reliability Notes

专注分析 AI Agent 在长任务执行、工具调用和企业部署中的失败案例。

推荐列表：Diversity
角色：批判性观察者
内容：失败案例 / 可靠性 / 企业部署
观点：谨慎

推荐理由：
你的当前组合中缺少对 Agent 可靠性和失败案例的关注，因此建议加入。

[加入关注组合] [暂时忽略] [查看原因]
```

---

# 10. 卡片操作

每张卡片有 4 个操作。

## 1. 加入关注组合

按钮：

```text
加入关注组合
```

点击后状态变成：

```text
已加入
```

同时顶部健康度分数更新。

例如：

```text
Diversity Score：64 → 69
Cocoon Risk：Medium → Low
```

---

## 2. 暂时忽略

按钮：

```text
暂时忽略
```

点击后卡片变灰，移到底部。

提示：

```text
已忽略。我们会减少类似推荐。
```

---

## 3. 查看推荐原因

按钮：

```text
查看原因
```

点击后展开说明：

```text
为什么推荐它？

- 你的当前关注源中缺少企业应用视角
- 该信息源经常发布真实部署案例
- 它可以补充你当前过度偏向产品 Demo 的信息结构
```

---

## 4. 调整分类

按钮：

```text
调整分类
```

用户可以把某个来源从：

```text
Radar
```

调整为：

```text
Core
```

或者从：

```text
Core
```

调整为：

```text
Diversity
```

---

# 11. 已选关注组合区域

页面右侧或底部可以有一个固定区域：

```text
我的 AI Agent 关注组合
```

分三组展示：

## Core

```text
已选 18 / 建议 25
```

## Diversity

```text
已选 6 / 建议 12
```

## Radar

```text
已选 14 / 建议 20
```

每组可以折叠展开。

---

## 每个已选来源支持操作

```text
移除
移动到 Core
移动到 Diversity
移动到 Radar
标记为重复
```

---

# 12. 页面五：健康度报告页

## 页面目标

在用户完成选择后，展示最终关注组合是否健康。

---

## 入口按钮

在列表管理页底部：

```text
Generate Health Report
```

中文：

```text
生成健康度报告
```

---

## 页面标题

```text
AI Agent 关注组合健康度报告
```

---

## 总分模块

```text
Attention Portfolio Health Score

82 / 100
```

中文：

```text
关注组合健康度：82 / 100
```

一句话总结：

```text
你的关注组合整体较健康，能够保持 AI Agent 领域聚焦，同时具备一定多元视角。
```

---

## 分项评分

```text
Focus Score：88 / 100
Diversity Score：76 / 100
Source Quality：81 / 100
Redundancy Risk：Low
Cocoon Risk：Low
Novelty Score：73 / 100
```

中文：

```text
领域聚焦度：88 / 100
视角多元度：76 / 100
来源质量：81 / 100
重复风险：低
信息茧房风险：低
新颖度：73 / 100
```

---

# 13. 报告内容模块

## A. 当前优势

```text
你的关注组合有以下优势：

1. AI Agent 领域聚焦度高
2. 技术、产品、开源信息源覆盖较好
3. Core List 中有较多高质量长期来源
4. Radar List 能帮助你发现新项目和新趋势
```

---

## B. 当前风险

```text
仍然存在以下风险：

1. 批判性观点略少
2. 企业落地案例不足
3. 非英语来源覆盖偏低
4. 部分产品 Demo 类账号内容重复
```

---

## C. 建议调整

```text
建议你：

1. 增加 3 个企业应用信息源
2. 增加 2 个批判性观点来源
3. 移除或静音 4 个重复产品资讯账号
4. 保留当前开源项目来源
5. 每 30 天复查 Radar List
```

---

## D. 最终关注组合

分三栏展示：

```text
Core List
Diversity List
Radar List
```

每栏展示已选信息源。

---

# 14. 最终导出功能

MVP 可以提供一个导出按钮。

## 按钮

```text
Export Portfolio
```

中文：

```text
导出关注组合
```

## 点击后弹窗

```text
请选择导出格式：
- Markdown
- CSV
- JSON
```

MVP 推荐先做 Markdown。

---

## Markdown 导出示例

```markdown
# AI Agent Attention Portfolio

## Core List

1. LangChain
- Role: Open Source Project
- Content: Agent Framework / Tool Use
- Reason: Core infrastructure source

2. Anthropic Engineering Blog
- Role: Company Engineering Blog
- Content: LLM / Agent Safety / Tool Use
- Reason: High-quality technical source

## Diversity List

1. Agent Reliability Notes
- Role: Critical Observer
- Content: Failure Cases / Reliability
- Reason: Adds skeptical and practical perspective

## Radar List

1. New Agent Startup A
- Role: Early Product
- Content: Product Demo / Workflow Automation
- Reason: Worth observing for 30 days
```

---

# 15. DEMO 所需的核心数据结构

前端可以先用假数据，不需要真实接入 SNS。

每个信息源对象可以这样设计：

```json
{
  "id": "source_001",
  "name": "LangChain",
  "description": "Open-source framework for building LLM applications and agents.",
  "portfolioType": "Core",
  "role": ["Open Source Project"],
  "contentType": ["Framework", "Tool Use", "Developer Ecosystem"],
  "stance": "Optimistic",
  "language": "English",
  "region": "Global",
  "qualityScore": 88,
  "focusScore": 92,
  "diversityContribution": 40,
  "redundancyRisk": "Medium",
  "reason": "A core source for tracking AI Agent frameworks and developer ecosystem.",
  "status": "recommended"
}
```

---

# 16. MVP 页面状态

至少需要这些状态：

```text
未开始
已输入领域
已选择目标
正在生成
已生成推荐
用户已加入部分来源
健康度报告已生成
已导出
```

---

# 17. 关键交互细节

## 1. 健康度分数实时变化

当用户加入一个 Diversity 来源时：

```text
Diversity Score 上升
Cocoon Risk 下降
```

当用户只加入 Core 产品类账号时：

```text
Focus Score 上升
但 Redundancy Risk 也可能上升
```

---

## 2. 推荐理由必须可见

每个推荐关注源都要解释：

```text
为什么推荐给我？
它补充了什么视角？
它会不会让我信息过载？
```

这是产品信任感的关键。

---

## 3. 不要只推荐“热门账号”

UI 上要强调：

```text
推荐原因不是因为它最火，而是因为它补齐了你的关注组合。
```

可以在页面放一句：

```text
We optimize for information balance, not popularity.
```

中文：

```text
我们优化的是信息结构，而不是单纯的热度排名。
```

---

# 18. MVP 不做的功能

第一版 DEMO 暂时不做：

```text
1. 真实连接 Twitter / X
2. 自动关注 / 取消关注
3. 读取用户真实浏览历史
4. 复杂推荐算法
5. 多用户协作
6. 账号可信度实时验证
7. 自动抓取所有平台数据
```

MVP 只需要模拟：

```text
输入兴趣领域
选择目标
生成关注组合
管理推荐列表
查看健康度报告
导出结果
```

---

# 19. 推荐的 DEMO 页面顺序

可以按这个顺序实现：

```text
/ 
首页，输入兴趣领域

/goals
选择关注目标

/portfolio
展示关注组合结构

/sources
管理推荐关注源

/report
查看健康度报告
```

也可以做成一个单页多步骤向导：

```text
Step 1: Interest
Step 2: Goal
Step 3: Portfolio
Step 4: Sources
Step 5: Report
```

MVP 更推荐单页向导，开发成本更低。

---

# 20. 最小可用版本验收标准

DEMO 完成后，用户应该能完成以下操作：

```text
1. 输入一个兴趣领域，例如 AI Agent
2. 选择 1 - 3 个关注目标
3. 看到系统生成的关注组合配比
4. 看到 Core / Diversity / Radar 三类关注列表
5. 点击加入或忽略推荐来源
6. 查看每个来源的推荐理由
7. 看到健康度分数变化
8. 生成最终健康度报告
9. 导出关注组合
```

---

# 21. 一句话产品说明

```text
Attention Portfolio Agent 是一个帮助用户围绕兴趣领域建立高质量关注列表的网页工具。它通过 Core、Diversity、Radar 三层结构，让用户既能保持领域聚焦，又能避免信息茧房。
```

中文更产品化一点：

```text
它不是帮用户关注更多信息，而是帮用户管理信息摄入结构。
```
