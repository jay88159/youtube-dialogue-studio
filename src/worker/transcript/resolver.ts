import type {
  HttpTransport,
  ResolvedTranscript,
  TranscriptFixture,
  TranscriptProvider,
  VideoTranscriptFallback,
} from "./types";
import { CaptionsNotFoundError } from "./youtube";

interface TranscriptResolverOptions {
  provider: TranscriptProvider;
  directTransport: HttpTransport;
  proxyTransport?: HttpTransport;
  fixtures: Map<string, TranscriptFixture>;
  videoFallback?: VideoTranscriptFallback;
}

export class TranscriptResolver {
  constructor(private readonly options: TranscriptResolverOptions) {}

  async resolve(videoId: string): Promise<ResolvedTranscript> {
    let liveError: unknown;

    try {
      const transcript = await this.options.provider.fetch(videoId, this.options.directTransport);
      return { source: "direct", transcript };
    } catch (error) {
      liveError = error;
    }

    if (this.options.proxyTransport && !(liveError instanceof CaptionsNotFoundError)) {
      try {
        const transcript = await this.options.provider.fetch(videoId, this.options.proxyTransport);
        return { source: "proxy", transcript };
      } catch (error) {
        liveError = error;
      }
    }

    const fixture = this.options.fixtures.get(videoId);
    if (fixture) return { source: "fixture", transcript: fixture };

    if (this.options.videoFallback) {
      const transcript = await this.options.videoFallback.fetch(videoId);
      return { source: "gemini", transcript };
    }

    throw liveError;
  }
}
