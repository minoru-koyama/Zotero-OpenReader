import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeepgramProvider, type DeepgramConfig, type DeepgramDeps } from '../../../src/core/providers/deepgram';
import { createProvider } from '../../../src/core/providers/factory';
import { DEFAULTS } from '../../../src/core/settings';

const MODELS_URL = 'https://api.deepgram.com/v1/models';
const SPEAK_URL = 'https://api.deepgram.com/v1/speak';
const cfg: DeepgramConfig = { apiKey: 'dg-test-key' };

const provider = (fetchImpl: unknown, over: Partial<DeepgramDeps> = {}) =>
  createDeepgramProvider(cfg, { fetch: fetchImpl as typeof fetch, ...over });
const opts = (over: { voice?: string; signal?: AbortSignal } = {}) => ({
  voice: 'aura-2-thalia-en',
  signal: new AbortController().signal,
  ...over,
});

type Row = Record<string, unknown>;
const catalog = (rows: unknown[]) => new Response(JSON.stringify({ tts: rows }));

/** An MPEG-1 Layer III frame header, 128 kbit/s at 44.1 kHz, no padding: 417 bytes a frame. */
const FRAME_HEADER = [0xff, 0xfb, 0x90, 0x00];
const FRAME_BYTES = 417;
function frame(fill: number, tag?: 'Xing' | 'Info'): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(FRAME_BYTES).fill(fill);
  out.set(FRAME_HEADER, 0);
  // The VBR tag sits after the side information: 32 bytes for MPEG-1 stereo
  if (tag) out.set([...tag].map((c) => c.charCodeAt(0)), 4 + 32);
  return out;
}
function id3(size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, 4, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f], 0);
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const mp3 = (bytes: Uint8Array<ArrayBuffer>, type: string | null = 'audio/mpeg') =>
  new Response(new Blob([bytes]), { headers: type ? { 'content-type': type } : {} });

/** The provider's synthesis probe, which the interface makes optional; Deepgram has one. */
function probe(fetchImpl: unknown, over: Partial<DeepgramDeps> & { cfg?: DeepgramConfig } = {}, voice = 'aura-2-thalia-en'): Promise<void> {
  const { cfg: config = cfg, ...deps } = over;
  const provider = createDeepgramProvider(config, { fetch: fetchImpl as typeof fetch, ...deps });
  if (!provider.checkSynthesis) throw new Error('the Deepgram provider must offer a synthesis probe');
  return provider.checkSynthesis(voice);
}

/** The error a promise rejects with; a fulfilled promise fails the test. */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

/**
 * A Deepgram look-alike that refuses anything but the request the adapter
 * was specified to send: the speak route, `Token` auth, an mp3 with
 * `mip_opt_out`, and a JSON body holding the text alone.
 */
function speakRoute(reply: (n: number) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit; body: Row }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.origin + parsed.pathname !== SPEAK_URL) return new Response('', { status: 404 });
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (init.method !== 'POST') return new Response('', { status: 405 });
    if (headers.Authorization !== `Token ${cfg.apiKey}`) return new Response('', { status: 401 });
    if (headers['Content-Type'] !== 'application/json') return new Response('', { status: 415 });
    if (parsed.searchParams.get('model') !== 'aura-2-thalia-en') return new Response('', { status: 400 });
    if (parsed.searchParams.get('encoding') !== 'mp3') return new Response('', { status: 400 });
    if (parsed.searchParams.get('mip_opt_out') !== 'true') return new Response('', { status: 400 });
    const body = JSON.parse(String(init.body)) as Row;
    if (Object.keys(body).join() !== 'text' || typeof body.text !== 'string') return new Response('', { status: 400 });
    calls.push({ url: parsed, init, body });
    return reply(calls.length);
  });
  return { fetchImpl, calls };
}

describe('the Deepgram voice list (Aura-2, English)', () => {
  it('keeps English Aura-2 voices only, one locale each, sorted by canonical id', async () => {
    const fetchImpl = vi.fn(async () =>
      catalog([
        { architecture: 'riva', canonical_name: 'nova-3-general', name: 'Nova', languages: ['en-US'] },
        { architecture: 'aura', canonical_name: 'aura-asteria-en', name: 'Asteria', languages: ['en-US'] },
        { architecture: 'aura-2', canonical_name: 'aura-2-thalia-en', name: 'Thalia', languages: ['en', 'en-US'], metadata: { tags: ['feminine'] } },
        { architecture: 'aura-2', canonical_name: 'aura-2-draco-en', name: 'Draco', languages: ['en-GB'], metadata: { tags: ['masculine'] } },
        { architecture: 'aura-2', canonical_name: 'aura-2-luna-en', name: 'Luna', languages: ['en-AU'] },
        { architecture: 'aura-2', canonical_name: 'aura-2-amalthea-en', name: 'Amalthea', languages: ['en-PH'], metadata: { tags: ['feminine'] } },
        { architecture: 'aura-2', canonical_name: 'aura-2-celeste-es', name: 'Celeste', languages: ['es'] },
        { architecture: 'flux', canonical_name: 'flux-haley-en', name: 'Haley', languages: ['en'] },
        // One row per voice: the first of two records for the same id stands
        { architecture: 'aura-2', canonical_name: 'aura-2-thalia-en', name: 'Thalia again', languages: ['en-GB'], metadata: { tags: ['masculine'] } },
        null,
        {},
        { architecture: 'aura-2', canonical_name: 42 },
        { architecture: 'aura-2', canonical_name: 'aura-2-unspoken-en', languages: 'en-US' },
        { architecture: 'aura-2', canonical_name: 'aura-2-mute-en', languages: ['not a tag'] },
      ]),
    );
    const voices = await provider(fetchImpl).listVoices();
    expect(voices).toEqual([
      { id: 'aura-2-amalthea-en', label: 'Aura-2 Amalthea (female)', locale: 'en-PH' },
      { id: 'aura-2-draco-en', label: 'Aura-2 Draco (male)', locale: 'en-GB' },
      { id: 'aura-2-luna-en', label: 'Aura-2 Luna', locale: 'en-AU' },
      { id: 'aura-2-thalia-en', label: 'Aura-2 Thalia (female)', locale: 'en-US' },
    ]);
  });

  it('names a voice without a name by its id', async () => {
    const fetchImpl = vi.fn(async () => catalog([{ architecture: 'aura-2', canonical_name: 'aura-2-orpheus-en', name: '  ', languages: ['en'] }]));
    expect(await provider(fetchImpl).listVoices()).toEqual([{ id: 'aura-2-orpheus-en', label: 'Aura-2 Orpheus', locale: 'en' }]);
  });

  it('fails rather than inventing voices when nothing English is listed', async () => {
    for (const rows of [[], [{ architecture: 'aura', canonical_name: 'aura-asteria-en', languages: ['en-US'] }], [{ architecture: 'aura-2', canonical_name: 'aura-2-celeste-es', languages: ['es'] }]]) {
      const fetchImpl = vi.fn(async () => catalog(rows));
      await expect(provider(fetchImpl).listVoices()).rejects.toMatchObject({ kind: 'unknown', message: 'Deepgram returned no English Aura-2 voices' });
    }
  });

  it.each([
    ['a body that is not JSON', new Response('<html>oops</html>', { status: 200 })],
    ['a missing tts list', Response.json({ models: [] })],
    ['a tts field that is not a list', Response.json({ tts: {} })],
  ])('fails on %s', async (_why, reply) => {
    await expect(provider(vi.fn(async () => reply)).listVoices()).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('needs a key before it reaches the network', async () => {
    const fetchImpl = vi.fn();
    await expect(createDeepgramProvider({ apiKey: '   ' }, { fetch: fetchImpl as unknown as typeof fetch }).listVoices()).rejects.toMatchObject({
      kind: 'no-key',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks the public models route with no credential, and forwards the caller signal', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => catalog([]));
    await provider(fetchImpl).listVoices({ signal: controller.signal }).catch(() => {});
    const [url, init] = fetchImpl.mock.calls[0] ?? ['', {}];
    expect(url).toBe(MODELS_URL);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers ?? {}).not.toHaveProperty('Authorization');
    expect(init.signal).toBe(controller.signal);
  });
});

describe('Deepgram synthesis', () => {
  it('sends the specified request and returns the reply bytes, without timestamps', async () => {
    const reply = join(id3(20), frame(7));
    const { fetchImpl, calls } = speakRoute(() => mp3(reply));
    const result = await provider(fetchImpl).synthesize('Hello there.', opts());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ text: 'Hello there.' });
    expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(reply);
    expect(result.audio.type).toBe('audio/mpeg');
    expect(result.timestamps).toBeUndefined();
    expect(result.note).toBe('audio from aura-2-thalia-en');
  });

  it('uses the Deepgram section alone when other sections hold keys of their own', async () => {
    const reply = frame(3);
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => mp3(reply));
    const settings = {
      ...DEFAULTS,
      'openai-official': { ...DEFAULTS['openai-official'], apiKey: 'sk-openai' },
      speechify: { ...DEFAULTS.speechify, apiKey: 'speechify-key' },
      deepgram: { enabled: true, apiKey: 'dg-own-key' },
    };
    const p = createProvider('deepgram', settings, {
      fetch: fetchImpl as unknown as typeof fetch,
      getWebSocket: vi.fn() as unknown as () => typeof WebSocket,
      newRequestId: () => 'r',
    });
    expect(p.id).toBe('deepgram');
    expect(p.capabilities.wordTimestamps).toBe(false);
    const result = await p.synthesize('Hello', { voice: 'aura-2-thalia-en', signal: new AbortController().signal });
    const [url, init] = fetchImpl.mock.calls[0] ?? ['', {}];
    expect(url).toBe(`${SPEAK_URL}?model=aura-2-thalia-en&encoding=mp3&mip_opt_out=true`);
    expect(init.headers).toMatchObject({ Authorization: 'Token dg-own-key' });
    expect(result.note).toBe('audio from aura-2-thalia-en');
  });

  it.each([['an Aura-1 voice', 'aura-asteria-en'], ['a non-English Aura-2 voice', 'aura-2-celeste-es'], ['a bare model name', 'aura-2-thalia'], ['a provider-prefixed id', 'deepgram::aura-2-thalia-en']])(
    'refuses %s before spending',
    async (_why, voice) => {
      const fetchImpl = vi.fn();
      await expect(provider(fetchImpl).synthesize('Hello', opts({ voice }))).rejects.toMatchObject({ kind: 'unknown' });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([['empty', ''], ['whitespace only', ' \n\t ']])('refuses %s text before spending', async (_why, text) => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl).synthesize(text, opts())).rejects.toMatchObject({ kind: 'unknown' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('needs a key for synthesis and for the probe', async () => {
    const fetchImpl = vi.fn();
    const keyless = createDeepgramProvider({ apiKey: '' }, { fetch: fetchImpl as unknown as typeof fetch });
    await expect(keyless.synthesize('Hello', opts())).rejects.toMatchObject({ kind: 'no-key' });
    await expect(probe(fetchImpl, { cfg: { apiKey: '' } })).rejects.toMatchObject({ kind: 'no-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a web page', null, '<html>Sign in</html>', 'text/html; charset=utf-8'],
    ['JSON', null, '{"text":"hi"}', 'application/json'],
    ['a WAV', null, 'RIFF', 'audio/wav'],
  ])('refuses %s handed back as audio', async (_why, _x, body: string, type: string) => {
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': type } }));
    await expect(provider(fetchImpl).synthesize('Hello', opts())).rejects.toMatchObject({ kind: 'unknown' });
    await expect(probe(fetchImpl)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('refuses an empty success, at reading and at the probe alike', async () => {
    const fetchImpl = vi.fn(async () => mp3(new Uint8Array(0)));
    await expect(provider(fetchImpl).synthesize('Hello', opts())).rejects.toMatchObject({ kind: 'unknown' });
    await expect(probe(fetchImpl)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it.each(['audio/mpeg', 'audio/mp3', 'application/octet-stream', null])('takes %s as MP3', async (type) => {
    const fetchImpl = vi.fn(async () => mp3(frame(5), type));
    const result = await provider(fetchImpl).synthesize('Hello', opts());
    expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(frame(5));
  });
});

describe('a Segment over the 2,000-code-unit cap', () => {
  it('sends 2,000 characters as one request', async () => {
    const text = 'x'.repeat(2000);
    const { fetchImpl, calls } = speakRoute(() => mp3(frame(1)));
    await provider(fetchImpl).synthesize(text, opts());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body.text).toBe(text);
  });

  it('splits 2,001 characters into pieces that make up the text, and joins their audio', async () => {
    const text = 'x'.repeat(2000) + 'y';
    const { fetchImpl, calls } = speakRoute((n) => mp3(join(id3(20), frame(0, 'Info'), frame(n), frame(n))));
    const result = await provider(fetchImpl).synthesize(text, opts());
    expect(calls.length).toBeGreaterThan(1);
    const pieces = calls.map((call) => call.body.text as string);
    expect(pieces.every((piece) => piece.length <= 2000)).toBe(true);
    expect(pieces.join('')).toBe(text);
    expect(result.note).toBe(`audio from aura-2-thalia-en in ${pieces.length} pieces`);
    // Every piece's audio frames survive the join; its ID3 tag and VBR frame do not
    const bytes = new Uint8Array(await result.audio.arrayBuffer());
    expect(bytes.length).toBe(pieces.length * 2 * FRAME_BYTES);
    expect(Array.from({ length: pieces.length }, (_, i) => bytes[(i * 2 + 1) * FRAME_BYTES + 10])).toEqual(pieces.map((_, i) => i + 1));
    expect(result.timestamps).toBeUndefined();
  });

  it('cuts a long multi-sentence Segment at its sentences, in order', async () => {
    const long = Array.from({ length: 90 }, (_, i) => `Sentence number ${i} runs on for a while here.`).join(' ');
    expect(long.length).toBeGreaterThan(2000);
    const { fetchImpl, calls } = speakRoute(() => mp3(frame(1)));
    await provider(fetchImpl).synthesize(long, opts());
    const pieces = calls.map((call) => call.body.text as string);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(long);
    expect(pieces.slice(0, -1).every((piece) => piece.trimEnd().endsWith('.'))).toBe(true);
  });

  it('never splits the two halves of an astral character across requests', async () => {
    const text = 'x'.repeat(1999) + '𝛼' + 'tail';
    const { fetchImpl, calls } = speakRoute(() => mp3(frame(1)));
    await provider(fetchImpl).synthesize(text, opts());
    const pieces = calls.map((call) => call.body.text as string);
    expect(pieces.map((piece) => piece.length)).toEqual([1999, 6]);
    expect(pieces.join('')).toBe(text);
    for (const piece of pieces) {
      expect(/[\uD800-\uDBFF]$/.test(piece)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(piece)).toBe(false);
    }
  });

  it('fails the whole Segment when a later piece fails, and asks for nothing after it', async () => {
    const text = 'x'.repeat(6000);
    let calls = 0;
    const fetchImpl = vi.fn(async () => (++calls === 2 ? new Response('', { status: 500 }) : mp3(frame(1))));
    await expect(provider(fetchImpl).synthesize(text, opts())).rejects.toMatchObject({ kind: 'unknown' });
    expect(calls).toBe(2);
  });

  it('spends nothing when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl).synthesize('x'.repeat(6000), opts({ signal: controller.signal }))).rejects.toMatchObject({ kind: 'network' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks for no further pieces once the caller cancels between them', async () => {
    const controller = new AbortController();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      controller.abort();
      return mp3(frame(1));
    });
    await expect(provider(fetchImpl).synthesize('x'.repeat(6000), opts({ signal: controller.signal }))).rejects.toMatchObject({ kind: 'network' });
    expect(calls).toBe(1);
  });
});

describe('Deepgram failures', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [429, 'rate-limit'],
    [413, 'unknown'],
    [500, 'unknown'],
    [503, 'unknown'],
  ])('HTTP %i is a %s error, asked once and not again', async (status, kind) => {
    const fetchImpl = vi.fn(async () => new Response('{"err":"body never surfaced"}', { status }));
    await expect(provider(fetchImpl).synthesize('Hello', opts())).rejects.toMatchObject({ kind });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('names the operation and the status without echoing the server body or the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('secret server text', { status: 401 }));
    const error = await rejectionOf(provider(fetchImpl).synthesize('Hello', opts()));
    expect(error.message).toMatch(/^Deepgram /);
    expect(error.message).toContain('401');
    expect(error.message).not.toContain('secret server text');
    expect(error.message).not.toContain(cfg.apiKey);
    expect(error.message).not.toContain('Hello');
  });

  it('reads an unreachable host and an unreadable body as network errors', async () => {
    await expect(provider(vi.fn(async () => Promise.reject(new TypeError('connection refused')))).synthesize('Hello', opts())).rejects.toMatchObject({
      kind: 'network',
    });
    const brokenBody = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: () => Promise.reject(new Error('connection reset')),
    };
    await expect(provider(vi.fn(async () => brokenBody as unknown as Response)).synthesize('Hello', opts())).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports a failing listing as an error, never as no voices', async () => {
    const failed = await rejectionOf(provider(vi.fn(async () => new Response('', { status: 502 }))).listVoices());
    expect(failed).toMatchObject({ kind: 'unknown' });
    expect(failed.message).toContain('502');
    await expect(provider(vi.fn(async () => Promise.reject(new TypeError('offline')))).listVoices()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('the Deepgram probe', () => {
  afterEach(() => vi.useRealTimers());

  it('asks for "Hi" once, on the voice it was given', async () => {
    const { fetchImpl, calls } = speakRoute(() => mp3(frame(1)));
    await probe(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ text: 'Hi' });
  });

  it('rejects at its own deadline, aborting the request it started', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = probe(vi.fn(async () => new Promise<Response>(() => {})), { newAbortController: () => controller });
    const settled = pending.catch((e: unknown) => e);
    vi.advanceTimersByTime(15_000);
    expect(await settled).toMatchObject({ kind: 'network' });
    expect(controller.signal.aborted).toBe(true);
  });

  it('rejects at its deadline without a controller to abort', async () => {
    vi.useFakeTimers();
    const pending = probe(vi.fn(async () => new Promise<Response>(() => {})), { newAbortController: () => null });
    const settled = pending.catch((e: unknown) => e);
    vi.advanceTimersByTime(15_000);
    expect(await settled).toMatchObject({ kind: 'network' });
  });
});
