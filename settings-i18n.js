// Minimal i18n for the Settings page. Scope: this page's own text only —
// translating the rest of the site (leaderboard, forum, nav, etc.) across
// 180+ pages is a much bigger follow-up, not attempted here.
window.KZ_I18N = {
  en: {
    settingsTitle: 'Settings',
    navProfile: 'Profile',
    navConfidentiality: 'Confidentiality',
    panelProfileTitle: 'Profile',
    panelConfidentialityTitle: 'Confidentiality',
    confidentialityNote: 'These toggles are saved but not yet enforced site-wide — coming soon.',
    fieldNickname: 'Unique nickname',
    fieldNicknameSub: 'Must be unique',
    fieldEmail: 'Your email',
    fieldEmailSub: 'Optional',
    fieldCountry: 'Country or region',
    fieldCountrySub: 'Sets the flag shown on your profile and the leaderboard',
    fieldShowLocation: 'Show location',
    fieldShowLocationSub: "If off, other players won't see your country",
    fieldLanguage: 'Language',
    fieldLanguageSub: 'Site language',
    fieldTradeLink: 'Trade link',
    fieldTradeLinkSub: 'Optional',
    fieldSafeTalking: 'Safe talking',
    fieldSafeTalkingSub: 'Filter potentially unsafe messages',
    fieldHideOnline: 'Who sees my online status',
    fieldHideOnlineSub: 'Hide your online status from other players',
    fieldHideInventory: 'Inventory visibility',
    fieldHideInventorySub: 'Hide your Steam inventory from other players',
    optRecommended: 'Recommended (Yes)',
    optNo: 'No',
    btnChange: 'Change',
    btnApply: 'Apply changes',
  },
  ru: {
    settingsTitle: 'Настройки',
    navProfile: 'Профиль',
    navConfidentiality: 'Конфиденциальность',
    panelProfileTitle: 'Профиль',
    panelConfidentialityTitle: 'Конфиденциальность',
    confidentialityNote: 'Эти переключатели сохраняются, но пока не применяются на сайте — скоро.',
    fieldNickname: 'Уникальный никнейм',
    fieldNicknameSub: 'Должен быть уникальным',
    fieldEmail: 'Ваш email',
    fieldEmailSub: 'Необязательно',
    fieldCountry: 'Страна или регион',
    fieldCountrySub: 'Устанавливает флаг в вашем профиле и в таблице лидеров',
    fieldShowLocation: 'Показывать местоположение',
    fieldShowLocationSub: 'Если выключено, другие игроки не увидят вашу страну',
    fieldLanguage: 'Язык',
    fieldLanguageSub: 'Язык сайта',
    fieldTradeLink: 'Ссылка на обмен',
    fieldTradeLinkSub: 'Необязательно',
    fieldSafeTalking: 'Безопасное общение',
    fieldSafeTalkingSub: 'Фильтровать потенциально небезопасные сообщения',
    fieldHideOnline: 'Кто видит мой статус онлайн',
    fieldHideOnlineSub: 'Скрыть статус онлайн от других игроков',
    fieldHideInventory: 'Видимость инвентаря',
    fieldHideInventorySub: 'Скрыть инвентарь Steam от других игроков',
    optRecommended: 'Рекомендуется (Да)',
    optNo: 'Нет',
    btnChange: 'Изменить',
    btnApply: 'Применить',
  },
};

window.applyKzLanguage = function applyKzLanguage(lang) {
  const dict = window.KZ_I18N[lang] || window.KZ_I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  // Custom dropdown trigger labels mirror whichever option is selected —
  // they don't carry a fixed data-i18n key, so re-sync them from the
  // (now-translated) selected option's text.
  document.querySelectorAll('.kz-select').forEach(wrap => {
    const selected = wrap.querySelector('.kz-select-option.selected');
    const label = wrap.querySelector('[id$="Label"]');
    if (selected && label) label.textContent = selected.textContent;
  });
  document.documentElement.setAttribute('lang', lang === 'ru' ? 'ru' : 'en');
  localStorage.setItem('kz_lang', lang);
};

// Apply immediately from localStorage (instant, no network wait) so the
// page doesn't flash English before settings.js loads the saved preference.
(function () {
  const saved = localStorage.getItem('kz_lang');
  if (saved) document.addEventListener('DOMContentLoaded', () => window.applyKzLanguage(saved));
})();
