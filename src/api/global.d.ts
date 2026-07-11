/** Type declarations for the Anna App Runtime host API. */

interface AnnaStorage {
  get<T = unknown>(params: { key: string }): Promise<{ value: T; exists: boolean }>;
  set<T = unknown>(params: { key: string; value: T }): Promise<{ ok: boolean }>;
  list(params: { prefix: string }): Promise<{ keys: string[] }>;
  delete(params: { key: string }): Promise<{ ok: boolean }>;
}

interface AnnaTools {
  invoke(params: {
    tool_id: string;
    method: string;
    args: Record<string, unknown>;
  }): Promise<{ success: boolean; data: unknown; error?: string }>;
}

interface AnnaWindow {
  set_title(params: { title: string }): Promise<void>;
}

interface AnnaAgent {
  session: {
    get_id(): Promise<string>;
  };
}

interface Anna {
  storage: AnnaStorage;
  tools: AnnaTools;
  window: AnnaWindow;
  agent: AnnaAgent;
}

interface AnnaAppRuntime {
  connect(): Promise<{ anna: Anna }>;
}

interface Window {
  AnnaAppRuntime?: AnnaAppRuntime;
}
