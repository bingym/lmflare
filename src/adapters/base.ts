export interface ProxyTarget {
  endpoint: string;
  apiKey: string;
  providerType: "openai" | "anthropic";
  modelId: string;
}

export interface ProxyResult {
  response: Response;
}
