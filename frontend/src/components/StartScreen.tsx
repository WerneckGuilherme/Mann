import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { Language } from '../i18n/translations.ts';

export default function StartScreen({ onStart }: { onStart: (mode: 'route' | 'free') => void }) {
  const { language, setLanguage, t } = useLanguage();
  return <main className="start-screen"><section className="start-card">
    <div className="start-mark">M</div><h1>{t('projectName')}</h1><p>{t('tagline')}</p>
    <label>{t('language')}</label><div className="language-options">
      <button className={language === 'pt-BR' ? 'selected' : ''} onClick={() => setLanguage('pt-BR' as Language)}>Português</button>
      <button className={language === 'en' ? 'selected' : ''} onClick={() => setLanguage('en' as Language)}>English</button>
    </div>
    <div className="game-mode-options">
      <button type="button" onClick={() => onStart('route')}><strong>{t('routeMode')}</strong><span>{t('routeModeHint')}</span></button>
      <button type="button" onClick={() => onStart('free')}><strong>{t('freeMode')}</strong><span>{t('freeModeHint')}</span></button>
    </div>
  </section></main>;
}
