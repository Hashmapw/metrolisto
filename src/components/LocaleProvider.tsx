import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider } from 'tdesign-mobile-react';
// TDesign provides a shared English pack; app copy and date formatting use en-GB.
import englishComponents from 'tdesign-mobile-react/es/locale/en_US';
import zhCN from 'tdesign-mobile-react/es/locale/zh_CN';
import { LOCALE_KEY, localisedName, resolveLocale, translate, type Locale } from '../lib/i18n';

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(
  null,
);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_KEY);
    } catch {
      /* Preferences are optional. */
    }
    return resolveLocale(saved, navigator.languages ?? [navigator.language]);
  });
  const setLocale = (next: Locale) => {
    updateLocale(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* Keep the in-memory selection. */
    }
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, '全地铁 MetroListo · 下一站，点亮城市');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        translate(
          locale,
          '全地铁 MetroListo：从一站到一城，点亮每一段地铁旅程。上海、北京地铁足迹记录。',
        ),
      );
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <ConfigProvider globalConfig={locale === 'en-GB' ? englishComponents : zhCN}>
        {children}
      </ConfigProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('LocaleProvider is required');
  const { locale } = context;
  return {
    ...context,
    ...useMemo(
      () => ({
        t: (message: string, ...values: (string | number)[]) =>
          translate(locale, message, ...values),
        name: (value: Parameters<typeof localisedName>[0]) => localisedName(value, locale),
      }),
      [locale],
    ),
  };
}
