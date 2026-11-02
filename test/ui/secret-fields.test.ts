import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The pane's secret fields are covered, and nothing uncovers them while
 * their provider is on (issue #19) — but the value can be taken out of
 * them.
 *
 * `type="password"` was the whole of it and is not any more: Gecko allows
 * no copy and no cut out of a password editor, revealed or not (measured
 * in Zotero 10.0.3-beta.3 / Firefox 140: 151 characters selected,
 * `editor.canCopy()` false; the same field as `type="text"`, true), so a
 * gateway token could be read off the screen and not taken anywhere. The
 * fields are ordinary text boxes now, the dots are the stylesheet's, and
 * the eye of ui/secret-rows.ts switches them.
 *
 * The marker class is what carries all of it, so a field is covered by its
 * markup alone: the rule masks anything marked that has not been
 * explicitly revealed, and a pane whose script never ran shows dots.
 */
describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const inputs = [...xhtml.matchAll(/<html:input\b[^>]*>/g)].map((match) => match[0]);
  const attr = (markup: string, name: string) => markup.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const prefOf = (markup: string) => attr(markup, 'preference')?.replace(/^extensions\.zotero\.zotero-tts\./, '');

  // The hint is the only thing that says what belongs in a header field, and
  // a covered field still shows it: -webkit-text-security covers the value,
  // never the placeholder (measured in 10.0.3-beta.3)
  it('keeps the format hint on the two Extra headers fields', () => {
    for (const name of ['compatible.headers', 'local.headers']) {
      const markup = inputs.find((input) => prefOf(input) === name);
      expect(attr(markup!, 'placeholder'), name).toBe('Name: value; Name: value');
    }
  });
});

describe('addon/content/preferences.css', () => {
  const css = readFileSync(new URL('../../addon/content/preferences.css', import.meta.url), 'utf8');

  // Written the safe way round: the marker covers, and only an explicit
  // reveal undoes it — never the other way, where a missed class or a
  // script that did not run would leave the value bare
  it('covers every marked field that is not explicitly revealed', () => {
    expect(css).toMatch(/input\.ztts-secret:not\(\[data-revealed="true"\]\)\s*\{[^}]*-webkit-text-security:\s*disc/);
  });

  it('draws the eye from the two icons the plugin ships', () => {
    expect(css).toMatch(/button\.ztts-reveal\s*\{[^}]*icons\/eye\.svg/);
    expect(css).toMatch(/button\.ztts-reveal\[aria-pressed="true"\]\s*\{[^}]*icons\/eye-off\.svg/);
  });

  // Masked or revealed, the field is the same width: the column stays straight
  it('sizes the secret fields with the pane’s other text fields', () => {
    expect(css).toMatch(/input\[type="text"\],\s*\n\.ztts-pane menulist \{/);
  });
});
