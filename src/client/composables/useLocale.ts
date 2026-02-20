import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type SupportedLocale = 'en-US' | 'zh-CN';

export function useLocale() {
  const { locale } = useI18n();

  const currentLocale = computed(() => locale.value as SupportedLocale);

  function setLocale(newLocale: SupportedLocale) {
    locale.value = newLocale;
    localStorage.setItem('locale', newLocale);
  }

  function toggleLocale() {
    const next: SupportedLocale = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
    setLocale(next);
  }

  return { currentLocale, setLocale, toggleLocale };
}
