import { describe, expect, it } from 'vitest';
import { findSlug, fcdoSlugs, usLookup, type UsAdvisory } from './advisories';

describe('travel advice', () => {
  it('maps country names to GOV.UK slugs, including synonyms and aliases', () => {
    const slugs = fcdoSlugs({
      links: {
        children: [
          { base_path: '/foreign-travel-advice/georgia', details: { country: { name: 'Georgia', slug: 'georgia' } } },
          { base_path: '/foreign-travel-advice/usa', details: { country: { name: 'USA', slug: 'usa', synonyms: ['United States'] } } },
          { base_path: '/foreign-travel-advice/turkey', details: { country: { name: 'Türkiye', slug: 'turkey', synonyms: ['Turkey'] } } },
        ],
      },
    });
    expect(findSlug(slugs, 'Georgia')).toBe('georgia');
    expect(findSlug(slugs, 'United States of America')).toBe('usa');
    expect(findSlug(slugs, 'Turkey')).toBe('turkey');
    expect(findSlug(slugs, 'Atlantis')).toBeUndefined();
  });

  it('finds US levels by name, not by (FIPS) code', () => {
    const a = (country: string, codes: string[], level: number) => ({ country, codes, level, url: '', updated: '' }) as UsAdvisory;
    const lookup = usLookup([a('China', ['CH'], 2), a('Switzerland', ['SZ'], 1), a('Burma (Myanmar)', ['BM'], 4), a('Georgia', ['GG'], 1)]);
    expect(lookup('Switzerland')!.level).toBe(1);
    expect(lookup("People's Republic of China")!.level).toBe(2);
    expect(lookup('Myanmar')!.level).toBe(4);
    expect(lookup('Georgia')!.level).toBe(1);
    expect(lookup('Atlantis')).toBeUndefined();
  });
});
