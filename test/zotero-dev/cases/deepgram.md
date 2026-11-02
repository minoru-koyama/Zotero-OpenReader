[Checklist index](../README.md) · [Scripts](../scripts/deepgram/README.md)

# Deepgram (English Aura-2)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.
The provider is off by default with an empty key.

**The key is the owner's.** It is entered **directly into this profile's
Deepgram field** before item 2; never ask for it in chat, read it from the
owner's files, or print it. Report its length only. Screenshots stay
masked. Every synthesis below is billed by input character, prefetched
text included, so items 2-6 spend a little on purpose: one `Hi` probe, at
most one voice-browser sample, and a few fixture sentences. No whole-
catalog audition and no other provider's credential.

**Permitted state changes:** the Deepgram section, its switch, and the
key; read-aloud prefetch, highlight level and volume for the length of the
run; one case-owned item in the library; the case's document-voice and
position records. Nothing else.

1. **The section, with the provider off.** Settings → OpenReader shows
   `Deepgram (Aura-2)` (`#ztts-provider-deepgram`) between Speechify and
   System voices, with the link `console.deepgram.com`. Report the one
   input's `type` (`text`), `disabled` (false), `value.length` (0 before
   the key, its length after, never the value), and the `?` beside it: its
   text begins `The key is on the API keys page of console.deepgram.com`.
   No model, voice or address field exists in the section.
   `Zotero.ZoteroTTS.diagnostics.secrets()` reports the Deepgram entry as
   flags and lengths only.
2. **Enable with the owner's key: one paid probe.** Enter the key, press
   Enable. The line reads `Connected. N voices available. Synthesis
   works.` and `deepgram.enabled` becomes true; the key field turns
   `disabled` and is masked again (the reveal button is greyed). `N` is
   the count the public list yields today — compare it with a fresh
   unauthenticated `GET https://api.deepgram.com/v1/models` filtered to
   `architecture === "aura-2"` and
   `canonical_name =~ /^aura-2-[a-z0-9-]+-en$/`, one row per canonical
   id; it is 41 at the 2026-11-01 research and not a constant. An invalid
   key's rejection and the Test-only path are covered by the unit tests
   (`test/ui/prefs-pane-state.test.ts`, `test/core/providers/deepgram.test.ts`)
   and are not repeated here.
3. **The catalog is English Aura-2 only.** `diagnostics.defaultVoice()`
   and `diagnostics.languageColumn()` show the provider as `Deepgram`,
   ids shaped `deepgram::aura-2-…-en`, and only English locales
   (`English (United States)`, `(United Kingdom)`, `(Australia)`,
   `(Philippines)`, and `English` where a voice carries no region) — no
   Aura-1 (`aura-asteria-en`), no `flux-`, no Spanish or other language,
   and no id listed twice.
4. **A reading in a Deepgram voice.** Import `test/fixtures/fixture-a.pdf`
   as a case-owned item and open it. Select `aura-2-thalia-en` (Thalia),
   or the first English Aura-2 voice the service currently lists if
   Thalia is gone; before Play, the Document voice names Deepgram, so
   nothing falls back to a remembered voice of another provider.
5. **Prefetch, kept small.** Snapshot the two prefetch settings, then set
   Custom prefetch on, 3 sentences ahead and 1 request at once. Play two
   or three sentences, then pause and resume once. At most one sample in
   the voice browser; if a second English Aura-2 voice exists, switch to
   it once and read one sentence on it.
6. **Playback and the sentence highlight stand-in.** `audio.state` reads
   `running` and `audio.playbackTime` advances across sentences with no
   `Playback failed` and no decoder error. The debug log carries
   `deepgram: no word timestamps for N chars (audio from aura-2-…-en),
   highlighting the sentence`; replaying the same text on the same voice
   with the audio cache on adds `(cached)`. No input text or key appears
   in the adapter's lines.
7. **Word mode shows the sentence.** Turn word highlighting on for one
   sentence: the sentence is visible and does not advance word by word.
   Capture the reader surface and `diagnostics.highlight()`; the audio
   clock alone does not prove the highlight. Whether the voice sounds
   right is a human judgment and is reported separately.
8. **Restore, and leave nothing behind.** Put the prefetch settings,
   highlight level and volume back **including their user-value flags**,
   and confirm the WebDAV folder's switch is back where the baseline found
   it (`diagnostics.positionSync()` reports the original `folder`). The
   owner's key stays in the section as part of the baseline. Delete the
   case-owned attachment, its document-voice and position records, and
   close its tabs — check the main window's `Zotero_Tabs._tabs` as well as
   `Zotero.Reader._readers`, since an unloaded tab outlives its reader. No
   new plugin error remains in the log.
