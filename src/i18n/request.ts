import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const LOCALE_COOKIE = 'novacut.locale';

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = store.get(LOCALE_COOKIE)?.value === 'bn' ? 'bn' : 'en';
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
