export interface CWOPSdlcConfig {
  gateway: {
    port: number;
    host: string;
  };
  ollama: {
    baseUrl: string;
    defaultModel: string;
    codeModel: string;
    reviewModel: string;
  };
  cwop: {
    defaultBudget: number;
    overflowStrategy: "truncate" | "drop-low-priority" | "summarize";
  };
  techStack: {
    primary: string[];
    secondary: string[];
  };
}

export const defaultConfig: CWOPSdlcConfig = {
  gateway: {
    port: 18790,
    host: "127.0.0.1",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    defaultModel: "qwen2.5-coder:7b",
    codeModel: "qwen2.5-coder:7b",
    reviewModel: "qwen2.5-coder:7b",
  },
  cwop: {
    defaultBudget: 6000,
    overflowStrategy: "drop-low-priority",
  },
  techStack: {
    primary: ["C# 12", ".NET 8", "Azure SQL", "Azure Functions v4", "Microsoft Teams", "Azure DevOps"],
    secondary: ["TypeScript", "Python", "Go", "Rust", "PostgreSQL"],
  },
};

export function loadConfig(): CWOPSdlcConfig {
  // Deep copy to avoid mutating defaultConfig
  const config: CWOPSdlcConfig = {
    gateway: { ...defaultConfig.gateway },
    ollama: { ...defaultConfig.ollama },
    cwop: { ...defaultConfig.cwop },
    techStack: {
      primary: [...defaultConfig.techStack.primary],
      secondary: [...defaultConfig.techStack.secondary],
    },
  };

  if (process.env.OLLAMA_BASE_URL) {
    config.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
  }
  if (process.env.OLLAMA_MODEL) {
    config.ollama.defaultModel = process.env.OLLAMA_MODEL;
    config.ollama.codeModel = process.env.OLLAMA_MODEL;
    config.ollama.reviewModel = process.env.OLLAMA_MODEL;
  }
  if (process.env.CWOP_GATEWAY_PORT) {
    const port = parseInt(process.env.CWOP_GATEWAY_PORT, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.gateway.port = port;
    }
  }
  if (process.env.CWOP_BUDGET) {
    const budget = parseInt(process.env.CWOP_BUDGET, 10);
    if (!isNaN(budget) && budget > 0) {
      config.cwop.defaultBudget = budget;
    }
  }

  return config;
}
