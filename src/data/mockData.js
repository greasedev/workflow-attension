// Mock data for AI Agent Attention Portfolio Demo

export const mockSources = [
  {
    id: "source_001",
    name: "LangChain",
    handle: "@LangChainAI",
    avatar: "L",
    description: "Open-source framework for building LLM applications and agents. Core infrastructure for the AI Agent ecosystem.",
    portfolioType: "Core",
    role: ["Open Source Project"],
    contentType: ["Framework", "Tool Use", "Developer Ecosystem"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 88,
    focusScore: 92,
    diversityContribution: 40,
    redundancyRisk: "Medium",
    reason: "A core source for tracking AI Agent frameworks and developer ecosystem.",
    detailedReason: [
      "Your focus is on technical learning",
      "LangChain is the most widely used Agent framework",
      "It provides tutorials, updates, and community discussions"
    ],
    status: "recommended"
  },
  {
    id: "source_002",
    name: "Anthropic Engineering",
    handle: "@AnthropicAI",
    avatar: "A",
    description: "Company engineering blog sharing research on LLM safety, Claude capabilities, and agent best practices.",
    portfolioType: "Core",
    role: ["Company Blog"],
    contentType: ["Research", "Safety", "Best Practices"],
    stance: "Balanced",
    language: "English",
    region: "US",
    qualityScore: 95,
    focusScore: 90,
    diversityContribution: 55,
    redundancyRisk: "Low",
    reason: "High-quality technical source with unique safety perspective.",
    detailedReason: [
      "Anthropic leads in Agent safety research",
      "Your portfolio lacks safety/alignment perspectives",
      "Their engineering posts are practical and deep"
    ],
    status: "recommended"
  },
  {
    id: "source_003",
    name: "Agent Reliability Notes",
    handle: "@AgentReliability",
    avatar: "R",
    description: "Focuses on analyzing AI Agent failures in long-task execution, tool calling, and enterprise deployment.",
    portfolioType: "Diversity",
    role: ["Critical Observer"],
    contentType: ["Failure Cases", "Reliability", "Enterprise Deployment"],
    stance: "Cautious",
    language: "English",
    region: "Global",
    qualityScore: 82,
    focusScore: 75,
    diversityContribution: 95,
    redundancyRisk: "Low",
    reason: "Adds skeptical and practical perspective to balance optimistic sources.",
    detailedReason: [
      "Your portfolio lacks critical perspectives",
      "Understanding failure modes is crucial for practitioners",
      "This source challenges the hype cycle"
    ],
    status: "recommended"
  },
  {
    id: "source_004",
    name: "AutoGPT",
    handle: "@AutoGPT",
    avatar: "G",
    description: "Experimental autonomous Agent project that sparked the Agent autonomy movement.",
    portfolioType: "Radar",
    role: ["Open Source Project"],
    contentType: ["Autonomous Agents", "Experiments"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 72,
    focusScore: 85,
    diversityContribution: 45,
    redundancyRisk: "Medium",
    reason: "Historically significant project worth monitoring for community developments.",
    detailedReason: [
      "AutoGPT pioneered autonomous Agent concepts",
      "Community activity indicates emerging trends",
      "Worth 30-day observation for new developments"
    ],
    status: "recommended"
  },
  {
    id: "source_005",
    name: "Simon Willison",
    handle: "@simonw",
    avatar: "S",
    description: "Developer and blogger sharing practical LLM applications, tools, and sharp technical analysis.",
    portfolioType: "Core",
    role: ["Developer", "Blogger"],
    contentType: ["Tutorials", "Tools", "Analysis"],
    stance: "Balanced",
    language: "English",
    region: "UK",
    qualityScore: 91,
    focusScore: 88,
    diversityContribution: 65,
    redundancyRisk: "Low",
    reason: "Practitioner with hands-on experience and honest, hype-free analysis.",
    detailedReason: [
      "Simon builds real tools, not just theory",
      "His blog covers practical implementation details",
      "Provides European perspective on AI development"
    ],
    status: "recommended"
  },
  {
    id: "source_006",
    name: "AI Enterprise Deploy",
    handle: "@AIEnterprise",
    avatar: "E",
    description: "Newsletter tracking real enterprise AI deployments, ROI analysis, and production challenges.",
    portfolioType: "Diversity",
    role: ["Newsletter"],
    contentType: ["Enterprise", "ROI", "Case Studies"],
    stance: "Pragmatic",
    language: "English",
    region: "US",
    qualityScore: 86,
    focusScore: 70,
    diversityContribution: 88,
    redundancyRisk: "Low",
    reason: "Fills the enterprise deployment gap in your portfolio.",
    detailedReason: [
      "Your portfolio lacks enterprise perspectives",
      "Real deployment stories are rare but valuable",
      "Helps distinguish hype from reality"
    ],
    status: "recommended"
  },
  {
    id: "source_007",
    name: "Hugging Face",
    handle: "@huggingface",
    avatar: "H",
    description: "Open-source AI community. Models, datasets, and Agent tools for builders.",
    portfolioType: "Core",
    role: ["Platform"],
    contentType: ["Models", "Datasets", "Tools"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 92,
    focusScore: 90,
    diversityContribution: 50,
    redundancyRisk: "Medium",
    reason: "Central hub for open-source AI Agent development.",
    detailedReason: [
      "Hugging Face hosts key Agent models",
      "Community discussions reveal emerging trends",
      "Essential for technical learning"
    ],
    status: "recommended"
  },
  {
    id: "source_008",
    name: "Lilian Weng",
    handle: "@lilianweng",
    avatar: "W",
    description: "Deep technical blog posts on Agent architectures, reasoning, and LLM engineering.",
    portfolioType: "Core",
    role: ["Researcher"],
    contentType: ["Architecture", "Deep Dive", "Technical"],
    stance: "Balanced",
    language: "English",
    region: "US",
    qualityScore: 94,
    focusScore: 95,
    diversityContribution: 45,
    redundancyRisk: "Low",
    reason: "One of the best technical deep-dive sources on Agent internals.",
    detailedReason: [
      "Lilian's posts are technically rigorous",
      "Covers Agent architecture in depth",
      "Essential for understanding Agent internals"
    ],
    status: "recommended"
  },
  {
    id: "source_009",
    name: "Agent Critic Weekly",
    handle: "@AgentCritic",
    avatar: "C",
    description: "Weekly analysis of Agent hype vs reality. Separates marketing claims from actual capabilities.",
    portfolioType: "Diversity",
    role: ["Media"],
    contentType: ["Analysis", "Critique", "Reality Check"],
    stance: "Critical",
    language: "English",
    region: "Global",
    qualityScore: 78,
    focusScore: 65,
    diversityContribution: 92,
    redundancyRisk: "Low",
    reason: "Counterbalance to optimistic product marketing.",
    detailedReason: [
      "Your portfolio has many optimistic sources",
      "Critical analysis prevents overhype",
      "Helps maintain realistic expectations"
    ],
    status: "recommended"
  },
  {
    id: "source_010",
    name: "Composio",
    handle: "@composio",
    avatar: "Co",
    description: "New Agent tool-calling platform. Connects Agents to 100+ apps with reliable execution.",
    portfolioType: "Radar",
    role: ["Startup"],
    contentType: ["Tools", "Integration", "Product"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 75,
    focusScore: 82,
    diversityContribution: 55,
    redundancyRisk: "Medium",
    reason: "Emerging tool-calling solution worth monitoring.",
    detailedReason: [
      "New player in Agent tool integration",
      "Solves practical connectivity problems",
      "Worth 30-day observation for maturity"
    ],
    status: "recommended"
  },
  {
    id: "source_011",
    name: "Andrew Ng",
    handle: "@AndrewYNg",
    avatar: "Ng",
    description: "AI educator and investor. Shares Agent course updates and industry insights.",
    portfolioType: "Core",
    role: ["Educator", "Investor"],
    contentType: ["Education", "Industry"],
    stance: "Optimistic",
    language: "English",
    region: "US",
    qualityScore: 90,
    focusScore: 80,
    diversityContribution: 60,
    redundancyRisk: "Low",
    reason: "Educational perspective from a trusted AI leader.",
    detailedReason: [
      "Andrew Ng's courses are foundational",
      "Provides investor perspective on Agent market",
      "Trusted voice in AI education"
    ],
    status: "recommended"
  },
  {
    id: "source_012",
    name: "MemGPT",
    handle: "@MemGPT",
    avatar: "M",
    description: "Research on Agent memory systems. Long-term memory for autonomous Agents.",
    portfolioType: "Radar",
    role: ["Research Project"],
    contentType: ["Memory", "Research", "Architecture"],
    stance: "Optimistic",
    language: "English",
    region: "US",
    qualityScore: 82,
    focusScore: 88,
    diversityContribution: 50,
    redundancyRisk: "Low",
    reason: "Cutting-edge research on Agent memory architecture.",
    detailedReason: [
      "Memory is key to long-running Agents",
      "MemGPT shows novel architecture approaches",
      "Emerging research worth tracking"
    ],
    status: "recommended"
  },
  {
    id: "source_013",
    name: "Karpathy",
    handle: "@karpathy",
    avatar: "K",
    description: "AI researcher and builder. Shares insights on Agent training, LLM internals, and future directions.",
    portfolioType: "Core",
    role: ["Researcher", "Builder"],
    contentType: ["Training", "Insights", "Future"],
    stance: "Balanced",
    language: "English",
    region: "US",
    qualityScore: 96,
    focusScore: 92,
    diversityContribution: 55,
    redundancyRisk: "Low",
    reason: "Top-tier technical insights from a leading AI mind.",
    detailedReason: [
      "Karpathy explains concepts clearly",
      "Combines research and practical building",
      "His Agent training videos are essential"
    ],
    status: "recommended"
  },
  {
    id: "source_014",
    name: "中国AI Agent观察",
    handle: "@AIAgent_CN",
    avatar: "CN",
    description: "中文视角的AI Agent动态。跟踪国内Agent创业项目和落地案例。",
    portfolioType: "Diversity",
    role: ["Media"],
    contentType: ["Regional", "Startups", "Cases"],
    stance: "Balanced",
    language: "Chinese",
    region: "China",
    qualityScore: 80,
    focusScore: 75,
    diversityContribution: 85,
    redundancyRisk: "Low",
    reason: "Non-English perspective fills language gap in your portfolio.",
    detailedReason: [
      "Your portfolio lacks non-English sources",
      "Chinese Agent market is rapidly developing",
      "Provides regional perspective on trends"
    ],
    status: "recommended"
  },
  {
    id: "source_015",
    name: "Agent Voice",
    handle: "@AgentVoice",
    avatar: "V",
    description: "Voice-enabled Agent research and demos. Multimodal Agent interactions.",
    portfolioType: "Radar",
    role: ["Research"],
    contentType: ["Voice", "Multimodal", "Research"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 78,
    focusScore: 80,
    diversityContribution: 60,
    redundancyRisk: "Medium",
    reason: "Emerging multimodal Agent capability worth tracking.",
    detailedReason: [
      "Voice is emerging Agent interface",
      "Multimodal Agents are growing trend",
      "Worth monitoring for 30 days"
    ],
    status: "recommended"
  },
  {
    id: "source_016",
    name: "OpenAI Agents",
    handle: "@OpenAI",
    avatar: "O",
    description: "Official updates on GPT models, Agent capabilities, and API releases.",
    portfolioType: "Core",
    role: ["Company"],
    contentType: ["Announcements", "API", "Research"],
    stance: "Optimistic",
    language: "English",
    region: "US",
    qualityScore: 93,
    focusScore: 94,
    diversityContribution: 40,
    redundancyRisk: "High",
    reason: "Primary source for GPT-based Agent capabilities.",
    detailedReason: [
      "OpenAI leads GPT-based Agent development",
      "API updates directly impact Agent builders",
      "Essential for staying current"
    ],
    status: "recommended"
  },
  {
    id: "source_017",
    name: "AI Safety Newsletter",
    handle: "@AISafetyNews",
    avatar: "Sa",
    description: "Weekly coverage of AI safety research, Agent alignment, and risk analysis.",
    portfolioType: "Diversity",
    role: ["Newsletter"],
    contentType: ["Safety", "Alignment", "Risk"],
    stance: "Cautious",
    language: "English",
    region: "Global",
    qualityScore: 85,
    focusScore: 68,
    diversityContribution: 90,
    redundancyRisk: "Low",
    reason: "Safety perspective often missing from technical portfolios.",
    detailedReason: [
      "Safety considerations are crucial for Agents",
      "Your portfolio lacks alignment perspectives",
      "Balances pure technical focus"
    ],
    status: "recommended"
  },
  {
    id: "source_018",
    name: "Agent Tools Weekly",
    handle: "@AgentTools",
    avatar: "T",
    description: "Weekly roundup of new Agent tools, frameworks, and developer resources.",
    portfolioType: "Radar",
    role: ["Newsletter"],
    contentType: ["Tools", "Frameworks", "Resources"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 75,
    focusScore: 85,
    diversityContribution: 45,
    redundancyRisk: "Medium",
    reason: "Good source for discovering emerging tools.",
    detailedReason: [
      "Rapidly tracks new Agent tools",
      "Helps discover early-stage projects",
      "Some overlap with other sources"
    ],
    status: "recommended"
  },
  {
    id: "source_019",
    name: "Sam Altman",
    handle: "@sama",
    avatar: "Sam",
    description: "OpenAI CEO. Shares vision for AI future, AGI perspectives, and company direction.",
    portfolioType: "Core",
    role: ["Executive"],
    contentType: ["Vision", "Strategy", "Industry"],
    stance: "Optimistic",
    language: "English",
    region: "US",
    qualityScore: 88,
    focusScore: 70,
    diversityContribution: 65,
    redundancyRisk: "Medium",
    reason: "Industry leader perspective on AI direction.",
    detailedReason: [
      "Sam shares strategic vision",
      "Provides industry-level perspective",
      "Some overlap with OpenAI announcements"
    ],
    status: "recommended"
  },
  {
    id: "source_020",
    name: "Agent Startup Radar",
    handle: "@AgentStartups",
    avatar: "St",
    description: "Tracking new Agent startups, funding rounds, and market opportunities.",
    portfolioType: "Radar",
    role: ["Newsletter"],
    contentType: ["Startups", "Funding", "Market"],
    stance: "Optimistic",
    language: "English",
    region: "Global",
    qualityScore: 77,
    focusScore: 72,
    diversityContribution: 70,
    redundancyRisk: "Low",
    reason: "Startup discovery for entrepreneurship-oriented users.",
    detailedReason: [
      "Tracks emerging Agent startups",
      "Funding news indicates market trends",
      "Worth monitoring for 30-day review"
    ],
    status: "recommended"
  }
];

export const goalOptions = [
  {
    id: "tech",
    title: "技术学习",
    titleEn: "Technical Learning",
    description: "我想学习技术实现、框架、代码和开源项目",
    tags: ["Engineering", "Open Source", "Tutorials"],
    icon: "⚙️"
  },
  {
    id: "product",
    title: "产品机会",
    titleEn: "Product Opportunities",
    description: "我想发现新产品、新工具和应用场景",
    tags: ["Product", "Tools", "Use Cases"],
    icon: "🎯"
  },
  {
    id: "startup",
    title: "创业与商业化",
    titleEn: "Startup & Business",
    description: "我想观察创业机会、商业模式和市场趋势",
    tags: ["Startup", "Market", "GTM"],
    icon: "🚀"
  },
  {
    id: "invest",
    title: "投资研究",
    titleEn: "Investment Research",
    description: "我想跟踪赛道趋势、公司动态和投资机会",
    tags: ["VC", "Trends", "Companies"],
    icon: "📊"
  },
  {
    id: "enterprise",
    title: "企业应用",
    titleEn: "Enterprise Applications",
    description: "我想了解企业真实落地、ROI 和部署案例",
    tags: ["Enterprise", "Case Study", "ROI"],
    icon: "🏢"
  },
  {
    id: "balanced",
    title: "综合关注",
    titleEn: "Balanced Coverage",
    description: "我想保持全面了解",
    tags: ["Balanced"],
    icon: "🌐"
  }
];

export const exampleDomains = [
  "AI Agent",
  "Crypto",
  "Indie Hacking",
  "Robotics",
  "Climate Tech",
  "Longevity"
];

export const roleFilters = [
  "研究者",
  "工程师",
  "开源作者",
  "创业者",
  "投资人",
  "产品经理",
  "企业用户",
  "批判者",
  "媒体 / Newsletter"
];

export const contentTypeFilters = [
  "技术教程",
  "产品 Demo",
  "论文 / Benchmark",
  "商业分析",
  "失败案例",
  "开源项目",
  "观点评论",
  "行业新闻"
];

export const stanceFilters = [
  "乐观",
  "中立",
  "谨慎",
  "批判"
];

export const languageFilters = [
  "英文",
  "中文",
  "日文",
  "欧洲",
  "全球"
];

export const portfolioDistribution = {
  "技术深度来源": 35,
  "产品和工具来源": 25,
  "开源项目来源": 15,
  "创业和商业化来源": 10,
  "批判性观点来源": 10,
  "跨领域来源": 5
};

export const defaultHealthMetrics = {
  focusScore: 87,
  diversityScore: 64,
  redundancyRisk: "Medium",
  cocoonRisk: "Medium",
  qualityScore: 78,
  noveltyScore: 65,
  summary: "你的 AI Agent 关注组合非常聚焦，但目前偏向产品和创业内容，缺少批判性观点和企业落地案例。"
};

export const listSuggestions = {
  core: { selected: 0, suggested: 25 },
  diversity: { selected: 0, suggested: 12 },
  radar: { selected: 0, suggested: 20 }
};

export const healthReportTemplate = {
  totalScore: 82,
  summary: "你的关注组合整体较健康，能够保持 AI Agent 领域聚焦，同时具备一定多元视角。",
  scores: {
    focus: 88,
    diversity: 76,
    quality: 81,
    redundancy: "Low",
    cocoon: "Low",
    novelty: 73
  },
  advantages: [
    "AI Agent 领域聚焦度高",
    "技术、产品、开源信息源覆盖较好",
    "Core List 中有较多高质量长期来源",
    "Radar List 能帮助你发现新项目和新趋势"
  ],
  risks: [
    "批判性观点略少",
    "企业落地案例不足",
    "非英语来源覆盖偏低",
    "部分产品 Demo 类账号内容重复"
  ],
  suggestions: [
    "增加 3 个企业应用信息源",
    "增加 2 个批判性观点来源",
    "移除或静音 4 个重复产品资讯账号",
    "保留当前开源项目来源",
    "每 30 天复查 Radar List"
  ]
};