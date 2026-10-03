import { Fragment } from 'react';
import type { CityData } from '../types';
import type { Locale } from '../lib/i18n';

/** City names always have Chinese and English; local names supplement both locales. */
export default function CityNames({
  city,
  locale,
}: {
  city: Pick<CityData, 'zhName' | 'enName' | 'localName'>;
  locale: Locale;
}) {
  const chinese = { name: city.zhName, language: 'zh-CN' };
  const english = { name: city.enName, language: 'en-GB' };
  const ordered = locale === 'en-GB' ? [english, chinese] : [chinese, english];
  if (city.localName) ordered.push(city.localName);
  const seen = new Set<string>();
  const names = ordered.filter(({ name }) => {
    const key = name.trim().normalize().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <>
      <span lang={names[0].language}>{names[0].name}</span>
      {names.length > 1 && (
        <small className="city-other-names">
          {names.slice(1).map(({ name, language }, index) => (
            <Fragment key={language + name}>
              {index > 0 && ' · '}
              <span lang={language}>{name}</span>
            </Fragment>
          ))}
        </small>
      )}
    </>
  );
}
