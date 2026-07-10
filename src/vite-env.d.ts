declare module '@anna-ai/app-runtime' {
  export interface AnnaAppStorageApi {
    get(key: string): Promise<{ value: unknown | undefined }>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  }

  export interface AnnaAppToolsApi {
    invoke(params: {
      tool_id: string;
      name: string;
      arguments: Record<string, unknown>;
    }): Promise<{ result: Record<string, unknown> } | { error: { code: number; message: string } }>;
  }

  export interface AnnaAppLLMApi {
    complete(params: { messages: Array<{ role: string; content: string }> }): Promise<{ content: string }>;
  }

  export interface AnnaAppRuntime {
    storage?: AnnaAppStorageApi;
    tools?: AnnaAppToolsApi;
    llm?: AnnaAppLLMApi;
  }

  export const AnnaAppRuntime: {
    connect(): Promise<AnnaAppRuntime>;
  };
}

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
