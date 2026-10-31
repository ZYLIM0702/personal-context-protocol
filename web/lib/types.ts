import type { Candidate } from "./pcp";

export type Unresolved = {
  input: string;
  field: "options" | "signals" | string;
  kind?: string;
  candidates?: string[];
};

export type QlooMeta = {
  status?: string;
  summary?: string;
  error?: { code?: string; message?: string } | string | null;
  unresolved?: Unresolved[];
  correlation_id?: string;
};

export type Inferred = { type: string; confidence: number } | null;

export type ProposeResult = {
  protocol?: string;
  task?: string;
  type: string;
  inferred?: Inferred;
  engine?: string;
  reply?: string;
  model?: string;
  provider?: string;
  candidates: Candidate[];
  qloo: QlooMeta;
};

export type UserTurn = { role: "user"; text: string; type?: string };
export type AgentTurn = { role: "agent"; task: string; result: ProposeResult };
export type ErrorTurn = { role: "error"; text: string };

export type ToolCall = {
  name: string;
  args?: { type?: string; count?: number };
  result?: {
    type?: string;
    qloo_status?: string;
    results?: { name: string; qloo_affinity?: number | null; because_you_love?: string | null; pc_score?: number | null }[];
  };
};

export type AssistantTurn = {
  role: "assistant";
  text: string;
  format: "openui-lang" | "markdown";
  model?: string;
  provider?: string;
  tools?: ToolCall[];
  usage?: { input: number; output: number };
  example?: boolean;
};

export type Turn = UserTurn | AgentTurn | ErrorTurn | AssistantTurn;

export type MemoryItem = {
  name: string;
  type: string;
  liked: boolean;
  source: string;
  evidence?: string;
  verified?: boolean;
  at: string;
};

export type ChatResult = {
  model?: string;
  provider?: string;
  format?: "openui-lang" | "markdown";
  reply: string;
  tools?: ToolCall[];
  usage?: { input: number; output: number };
  memory?: Omit<MemoryItem, "at">[];
};

export type Conversation = {
  id: string;
  title: string;
  demo: boolean;
  created_at: string;
  updated_at: string;
  messages?: Turn[];
};

export type ServerStatus = {
  qloo_ready: boolean;
  qloo_byok: boolean;
  llm_ready: boolean;
  default_provider: string;
  model: string;
  providers: Record<string, boolean>;
};

export type ProviderChoice = "default" | "anthropic" | "openai" | "ollama";

export type AgentSettings = { provider: ProviderChoice; model: string; baseUrl: string; memory: boolean };

export type AgentSpec = { provider: Exclude<ProviderChoice, "default">; model?: string; baseUrl?: string };

export type DiscoverCard = {
  name: string;
  type: string;
  qloo?: number | null;
  qloo_kind?: string | null;
  graph?: number | null;
  because?: string | null;
  qloo_match?: string | null;
  qloo_entity_id?: string | null;
};

export type DiscoverResult = {
  engine?: string;
  llm_tokens?: number;
  types?: string[];
  cards: DiscoverCard[];
};
