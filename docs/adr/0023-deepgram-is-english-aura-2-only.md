---
status: accepted
date: 2026-11-01
---

# Deepgram is English Aura-2 only, as a provider of its own

## What there was

- No Deepgram adapter. Cloudflare's Aura models are a different service on a
  different route, and the OpenAI Compatible section speaks a different
  address, authentication, payload and catalog shape.
- `POST https://api.deepgram.com/v1/speak?model=…&encoding=mp3` with
  `Authorization: Token <key>` and `{ text }` returns MP3 bytes (Aura REST
  quickstart). Aura-1 and Aura-2 cap the input at 2,000 characters and answer
  413 above it.
- `GET https://api.deepgram.com/v1/models` needs no credential and lists
  Aura-2 voices with `canonical_name`, `languages` and `metadata.tags`; a real
  request on 2026-11-01 returned 103 TTS models, 91 of them Aura-2, with
  English entries under `en-US`, `en-GB`, `en-AU` and `en-PH`. Neither the
  REST reference nor the quickstart documents word timestamps.
- Deepgram keeps request text and synthesized audio for model improvement
  unless the request carries `mip_opt_out=true` (Your Data at Deepgram).

## Decision

- **A provider of its own.** `src/core/providers/deepgram.ts` implements
  `TTSProvider` with `capabilities.wordTimestamps: false`, one section
  (`deepgram.apiKey`, `deepgram.enabled`), and a factory case that forwards
  nothing from another section.
- **English Aura-2 only.** A row is taken when `architecture === 'aura-2'`,
  `canonical_name` matches `^aura-2-[a-z0-9-]+-en$` and a language tag is
  English; a voice is filed under its first regional English tag, else `en`,
  once per canonical id (ADR 0019). Aura-1, Flux and other languages are not
  listed, and an empty result is an error rather than a static list.
- **Synthesis is bytes, not JSON.** Success must be `audio/mpeg`,
  `audio/mp3`, `application/octet-stream` or unlabelled, and non-empty; a
  gateway's HTML or JSON answer with HTTP 200 fails synthesis and the probe
  alike.
- **`mip_opt_out=true` on every request**, probes included, and not a
  setting: the reader cannot be asked about model training mid-read, so the
  provider never quietly turns it off. No price is promised, since the opt-out
  premium is not published.
- **Over the cap, pieces in turn.** `splitText(text, 2000)` cuts at the last
  sentence end, else the last whitespace, else the cap; the pieces are
  requested one after another (the reading's prefetch already holds requests
  open against project-wide limits), checked against the caller's signal
  before each, and joined with `joinMp3`. A failed piece rejects the whole
  Segment, so no half sentence is played.
- **The splitter never halves an astral character.** `splitText`'s hard-cut
  branch backs off one code unit when the cap falls between a high surrogate
  and its low surrogate, so each request carries whole characters
  (`'x'×1999 + '𝛼' + 'tail'` → 1999 and 6). Sentence and whitespace
  preferences, offsets and the exported signature are unchanged, and
  Speechify's and OpenAI's splitting are unaffected.
- **Errors the pane and the reader understand.** 401/403 `auth`, 402
  `quota`, 429 `rate-limit`, other non-2xx `unknown`, transport and
  body-read failures `network`, missing key `no-key`. Messages name the
  operation and the status; no server body, key or input text is echoed, and
  nothing is retried.
- **The probe is the proof.** The public list cannot validate a key or a
  credit balance, so Enable and Test connection synthesize one `Hi` on the
  first listed voice, bounded by the provider's own 15-second deadline (its
  interface has no signal to be given) and aborted through the injected
  controller when the deadline passes.

## Consequences

- Reading is billed by input character, prefetched sentences included;
  cancelling playback does not reverse a charge. The pane's help says so.
- Highlights are the sentence's, through the existing whole-segment
  timestamp (`remote-interface.wholeSegmentTimestamp`); nothing is estimated.
- The key is a plain pref like every other provider's, so the existing
  backup and settings sync carry it, with the same plaintext limits —
  masking is not encryption.
- Deepgram's limits are per project, and a secondary self-serve project is
  restricted to one concurrent request; the existing prefetch controls and
  visible 429 handling are unchanged, and no retry was added for this.
- The voice count is whatever the service lists: 41 English Aura-2 voices at
  the time of the research, not a constant.

## Rejected

- **Folding Deepgram into OpenAI Compatible.** The path, `Token` auth,
  `{ text }` body, MP3-only reply and model catalog all differ; a second
  protocol behind one section is how `openai-split` happened once already.
- **A Cloudflare-style adapter shared by both.** Cloudflare's Aura takes a
  `speaker` body on an account-scoped route and answers JSON around base64
  for MeloTTS; sharing would add a branch per request for no shared behavior.
- **Flux, Aura-1 and the other Aura-2 languages.** Flux's batch route, input
  cap and access are unverified; Aura-1 is the older family and the other
  languages were not asked for. The scope is English Aura-2, the fixed global
  endpoint and sentence highlighting.
- **A static voice list.** The service lists voices; a copy would go stale
  silently and could offer a voice the account cannot use.
