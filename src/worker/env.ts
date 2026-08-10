export interface AppEnv {
  ASSETS: Fetcher;
  GENERATION_SESSION: DurableObjectNamespace;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  WEBSHARE_PROXY_HOST?: string;
  WEBSHARE_PROXY_PORT?: string;
  WEBSHARE_PROXY_USERNAME?: string;
  WEBSHARE_PROXY_PASSWORD?: string;
}
