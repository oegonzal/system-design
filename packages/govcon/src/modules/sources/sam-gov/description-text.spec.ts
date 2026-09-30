import fixture from './fixtures/notice-description.json';
import { htmlToText } from './description-text';

describe('htmlToText', () => {
  it('[GOV-9] turns the provider markup into readable text with no tag left, entities spelled out, scripts dropped', () => {
    const text = htmlToText(fixture.description);
    expect(text).toBe(
      [
        'Combined Synopsis/Solicitation',
        'The Defense Logistics Agency intends to purchase 400 each of NSN 5340-01-123-4567, bracket, mounting, additively manufactured to drawing 12345678 rev C.',
        'Delivery: 90 days ARO',
        'Set-aside: Total Small Business & "100%" participation',
        'Questions to A. Buyer — a.buyer@dla.mil — by 10/03/2026.',
        'See attachments…',
      ].join('\n'),
    );
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toContain('alert(');
  });

  it('leaves plain text alone apart from tidying whitespace, keeps unknown entities verbatim, and keeps escaped text as text', () => {
    expect(htmlToText('  Plain   text\n\n\n\nwith  gaps  ')).toBe('Plain text\nwith gaps');
    expect(htmlToText('a &unknownthing; b &#xZZ; c')).toBe('a &unknownthing; b &#xZZ; c');
    expect(htmlToText('&#65;&#x42;')).toBe('AB');
    expect(htmlToText('a &lt;b&gt; c')).toBe('a <b> c');
    expect(htmlToText('CONTACT|4|N743\rITEM UNIQUE\r\nWARRANTY')).toBe(
      'CONTACT|4|N743\nITEM UNIQUE\nWARRANTY',
    );
    expect(htmlToText('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a b');
    expect(htmlToText('')).toBe('');
  });
});
