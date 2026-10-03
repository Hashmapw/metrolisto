import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CityNames from './CityNames';

const seoulNames = {
  zhName: '首尔',
  enName: 'Seoul',
  localName: { name: '서울', language: 'ko' },
};

describe('city name display', () => {
  it.each(['zh-CN', 'en-GB'] as const)(
    'shows all three names with language tags in %s',
    (locale) => {
      const html = renderToStaticMarkup(<CityNames city={seoulNames} locale={locale} />);
      const primary = locale === 'zh-CN' ? '首尔' : 'Seoul';
      expect(html).toMatch(new RegExp(`^<span lang="${locale}">${primary}</span>`));
      expect(html).toContain('<span lang="zh-CN">首尔</span>');
      expect(html).toContain('<span lang="en-GB">Seoul</span>');
      expect(html).toContain('<span lang="ko">서울</span>');
    },
  );
  it('works without a local name and suppresses a duplicate local name', () => {
    const city = { zhName: '北京', enName: 'Beijing' };
    const base = renderToStaticMarkup(<CityNames city={city} locale="en-GB" />);
    expect(base).toContain('北京');
    expect(base).toContain('Beijing');
    for (const name of ['北京', 'Beijing', ' BEIJING ']) {
      expect(
        renderToStaticMarkup(
          <CityNames city={{ ...city, localName: { name, language: 'zh' } }} locale="en-GB" />,
        ),
      ).toBe(base);
    }
  });
});
