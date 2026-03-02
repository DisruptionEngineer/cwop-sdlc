import type { CWOPConfig } from "./cwop.js";

export interface ExtensionRegistration {
  id: string;
  name: string;
  description: string;
  version: string;
  cwopPreset: CWOPConfig;
  defaultModel: string;
  capabilities: ExtensionCapability[];
}

export type ExtensionCapability =
  | "code-generation"
  | "code-review"
  | "azure-devops"
  | "visualization"
  | "chat";
