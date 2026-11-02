import { withTimeout } from '../timeout';
import { SynthesisError } from './errors';
import { joinMp3, splitText } from './split-text';
import type { ListVoicesOptions, SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from './types';

/**
 * Deepgram's text-to-speech REST API: the public model list
 * documents every voice, synthesis returns MP3 bytes. Aura-2 is the family
 * this provider offers, in English only; Aura-1, Flux, the speech-to-text
 * models and the other languages are out of scope. The account link lives in
 * the pane, the key in the settings section (core/settings.ts).
 */
export const DEEPGRAM_API = 'https://api.deepgram.com';
/** Aura-2's input cap, in UTF-16 code units: over it the route answers 413 (Aura REST quickstart). */
export const MAX_INPUT_CHARS = 2000;
/** How long the probe may take: `checkSynthesis` has no signal of its own to be given one. */
export const PROBE_TIMEOUT_MS = 15_000;
/**
 * `mip_opt_out=true` on every synthesis, the probe included: without it
 * Deepgram keeps the request text and the audio for model improvement
 * (Your Data, trust-security/your-data). Not a setting — a document read
 * aloud is not training material the reader can be asked about mid-read.
 */
const MODEL_IMPROVEMENT_OPT_OUT = 'true';

/** A canonical English Aura-2 voice: the model string `POST /v1/speak` takes. */
const ENGLISH_AURA_2 = /^aura-2-[a-z0-9-]+-en$/;
/** What a successful reply may be: MP3, which Deepgram names either way, or an unlabelled binary. */
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'application/octet-stream']);

export type DeepgramConfig = { apiKey: string };

export type DeepgramDeps = {
  fetch: typeof fetch;
  /** A controller from a chrome window; the plugin sandbox has no AbortController. */
  newAbortController?: () => AbortController | null;
};

/** A JSON object's fields by key: any object reads as one, anything else as nothing. */
const fields = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);

/** A language tag in its canonical casing; null for anything BCP-47 does not accept. */
function canonicalTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const [tag] = Intl.getCanonicalLocales(value);
    return tag ?? null;
  } catch {
    return null;
  }
}

/**
 * The one language a voice is filed under: its first regional English tag
 * (`en-US`, `en-GB`, `en-AU`, `en-PH`), else the base `en`. A voice is never
 * listed twice, and no region is invented for one that has none (ADR 0019).
 */
function localeOf(languages: unknown): string | null {
  if (!Array.isArray(languages)) return null;
  const tags = languages
    .map(canonicalTag)
    .filter((tag): tag is string => tag !== null && (tag === 'en' || tag.startsWith('en-')));
  return tags.find((tag) => tag !== 'en') ?? (tags.includes('en') ? 'en' : null);
}

/** `Aura-2 Thalia (female)`: the published name, else the voice's own slug, and the gender its tags state. */
function labelOf(id: string, name: unknown, tags: unknown): string {
  const given = typeof name === 'string' ? name.trim() : '';
  const slug = id.slice('aura-2-'.length, -'-en'.length);
  const base = given || slug.charAt(0).toUpperCase() + slug.slice(1);
  const tagged = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase()) : [];
  const gender = tagged.includes('feminine') ? ' (female)' : tagged.includes('masculine') ? ' (male)' : '';
  return `Aura-2 ${base}${gender}`;
}

/** The English Aura-2 voices of a models reply, one row per canonical id, sorted so the first probe voice is fixed. */
function voicesOf(reply: unknown): VoiceInfo[] {
  const tts = fields(reply)?.tts;
  if (!Array.isArray(tts)) throw new SynthesisError('unknown', 'Deepgram voice list: the reply was not a voice list');
  const voices = new Map<string, VoiceInfo>();
  for (const row of tts) {
    const record = fields(row);
    if (!record || record.architecture !== 'aura-2') continue;
    const id = record.canonical_name;
    if (typeof id !== 'string' || !ENGLISH_AURA_2.test(id)) continue;
    const locale = localeOf(record.languages);
    if (!locale || voices.has(id)) continue;
    voices.set(id, { id, label: labelOf(id, record.name, fields(record.metadata)?.tags), locale });
  }
  return [...voices.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function createDeepgramProvider(cfg: DeepgramConfig, deps: DeepgramDeps): TTSProvider {
  const apiKey = () => cfg.apiKey.trim();

  /** Both requests need the key, and discovery is where the pane's line says so first. */
  function requireKey(): void {
    if (!apiKey()) throw new SynthesisError('no-key', 'Deepgram API key is not set');
  }

  async function request(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await deps.fetch(url, init);
    } catch {
      // The transport's own words are a URL and a socket; the operation and
      // the host are what the reader can act on
      throw new SynthesisError('network', `${what}: cannot reach api.deepgram.com`);
    }
  }

  /**
   * The refusal as the pane and the reader understand it. Deepgram answers
   * a wrong key and a wrong permission alike with 401/403, so the message
   * names both; 402 is the account's credits, 413 the input cap. The
   * server's body is never quoted: it can hold the request text back.
   */
  function refusal(response: Response, what: string): SynthesisError {
    const { status } = response;
    if (status === 401 || status === 403) return new SynthesisError('auth', `${what}: Deepgram rejected the API key or its permission (${status})`);
    if (status === 402) return new SynthesisError('quota', `${what}: Deepgram has no credits left (402)`);
    if (status === 429) return new SynthesisError('rate-limit', `${what}: Deepgram is rate limiting (429)`);
    if (status === 413) return new SynthesisError('unknown', `${what}: the text is over Deepgram's input limit (413)`);
    return new SynthesisError('unknown', `${what}: HTTP ${status}`);
  }

  /**
   * The reply's bytes, and only bytes: a gateway's login page or a JSON
   * error answers 200 often enough that an unread type would be handed to
   * the decoder as audio. An empty success is no audio either.
   */
  async function audioBytes(response: Response, what: string): Promise<Uint8Array<ArrayBuffer>> {
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (type && !AUDIO_TYPES.has(type)) throw new SynthesisError('unknown', `${what}: the reply was ${type}, not audio`);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new SynthesisError('network', `${what}: the reply broke off`);
    }
    if (!bytes.length) throw new SynthesisError('unknown', `${what}: the reply carried no audio`);
    return bytes;
  }

  /**
   * One Segment, asked for in pieces of at most the input cap and played as
   * one clip. The pieces go in turn rather than together: the reading's own
   * prefetch already holds requests open, and Deepgram's limits are per
   * project. A failure or a cancellation rejects the whole Segment, so half
   * a sentence is never handed on as if it were the sentence.
   */
  async function speak(text: string, voice: string, signal?: AbortSignal): Promise<SynthesisResult> {
    requireKey();
    if (!ENGLISH_AURA_2.test(voice)) throw new SynthesisError('unknown', `Unknown Deepgram voice: ${voice}`);
    if (!text.trim()) throw new SynthesisError('unknown', 'Deepgram speech: there is no text to say');
    const what = 'Deepgram speech';
    const pieces = splitText(text, MAX_INPUT_CHARS);
    const audio: Uint8Array<ArrayBuffer>[] = [];
    for (const piece of pieces) {
      if (signal?.aborted) throw new SynthesisError('network', `${what}: cancelled`);
      const query = new URLSearchParams({ model: voice, encoding: 'mp3', mip_opt_out: MODEL_IMPROVEMENT_OPT_OUT });
      const response = await request(
        `${DEEPGRAM_API}/v1/speak?${query}`,
        {
          method: 'POST',
          headers: { Authorization: `Token ${apiKey()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: piece.text }),
          signal,
        },
        what,
      );
      if (!response.ok) throw refusal(response, what);
      audio.push(await audioBytes(response, what));
    }
    const note = pieces.length === 1 ? `audio from ${voice}` : `audio from ${voice} in ${pieces.length} pieces`;
    // A voice that reports no word timing: remote-interface falls back to the sentence (never estimated)
    return { audio: new Blob([joinMp3(audio) as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' }), note };
  }

  const provider: TTSProvider = {
    id: 'deepgram',
    capabilities: { wordTimestamps: false },

    /**
     * The public model list, filtered to the English Aura-2 voices. It needs
     * no credential — the key is demanded here because the pane draws this
     * request as the provider's own, and an empty key would list voices the
     * reader could never hear. A listed voice proves neither the key nor
     * the account's credits; Test connection synthesizes as well.
     */
    async listVoices(options?: ListVoicesOptions): Promise<VoiceInfo[]> {
      requireKey();
      const what = 'Deepgram voice list';
      const response = await request(`${DEEPGRAM_API}/v1/models`, { signal: options?.signal }, what);
      if (!response.ok) throw refusal(response, what);
      let reply: unknown;
      try {
        reply = await response.json();
      } catch {
        throw new SynthesisError('unknown', `${what}: the reply was not JSON`);
      }
      const voices = voicesOf(reply);
      if (!voices.length) throw new SynthesisError('unknown', 'Deepgram returned no English Aura-2 voices');
      return voices;
    },

    /**
     * One `Hi` through the same route: proves the key, the account's credits
     * and the voice, which a public list cannot. The deadline is its own
     * because this interface takes no signal to be handed the reading's.
     */
    async checkSynthesis(voice: string): Promise<void> {
      const controller = deps.newAbortController?.() ?? null;
      const probe = speak('Hi', voice, controller?.signal ?? undefined);
      await withTimeout(
        probe,
        PROBE_TIMEOUT_MS,
        () => new SynthesisError('network', 'Deepgram check: no answer within 15 seconds'),
        () => controller?.abort(),
      );
    },

    synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      return speak(text, o.voice, o.signal);
    },
  };
  return provider;
}
