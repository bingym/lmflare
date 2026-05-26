export interface ProxyTarget {
  endpoint: string;
  apiKey: string;
  providerType: "openai" | "openai-responses" | "anthropic";
  modelId: string;
}

export interface ProxyResult {
  response: Response;
}
