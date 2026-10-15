/** Compact static weather SVGs (currentColor). Mapped from QWeather iconDay codes. */

const SVG = {
  sunny: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.05 5.05l1.55 1.55M17.4 17.4l1.55 1.55M5.05 18.95l1.55-1.55M17.4 6.6l1.55-1.55" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  cloudy: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.5" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 16.5h9.2a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.7-1.4A3.4 3.4 0 0 0 8 16.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  overcast: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 17h10.5a3.6 3.6 0 0 0 .35-7.15 5 5 0 0 0-9.55-1.55A3.7 3.7 0 0 0 7.2 17Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6 20h11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".45"/></svg>`,
  rain: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 14.2h10.2a3.3 3.3 0 0 0 .3-6.55 4.7 4.7 0 0 0-9-1.35A3.4 3.4 0 0 0 7.2 14.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 17.2v2.4M12 16.6v3.2M15 17.2v2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  thunder: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 13.5h10.2a3.3 3.3 0 0 0 .3-6.55 4.7 4.7 0 0 0-9-1.35A3.4 3.4 0 0 0 7.2 13.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m12.2 13.8-2.2 3.8h2.4L10.8 22l4.2-5.6h-2.5l1.7-2.6Z" fill="currentColor"/></svg>`,
  snow: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 13.8h10.2a3.3 3.3 0 0 0 .3-6.55 4.7 4.7 0 0 0-9-1.35A3.4 3.4 0 0 0 7.2 13.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.2 16.8h0M12 17.6h0M14.8 16.8h0M10.6 19.4h0M13.4 19.4h0" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>`,
  fog: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 12.5h10.2a3.3 3.3 0 0 0 .3-6.55 4.7 4.7 0 0 0-9-1.35A3.4 3.4 0 0 0 7.2 12.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 15.5h12M7.5 18.2h9M6.5 20.8h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  unknown: `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.7 1c0 1.5-1.5 2-1.8 2.6-.2.4-.15.9-.15 1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor"/></svg>`,
};

/**
 * @param {string | number | undefined} iconDay
 * @param {string} [text]
 */
export function resolveWeatherIconKey(iconDay, text = "") {
  const code = Number(iconDay);
  if (Number.isFinite(code)) {
    if (code === 100 || code === 150) return "sunny";
    if ((code >= 101 && code <= 103) || (code >= 151 && code <= 153)) return "cloudy";
    if (code === 104) return "overcast";
    if (code === 302 || code === 303 || code === 304) return "thunder";
    if (code >= 300 && code <= 399) return "rain";
    if (code >= 400 && code <= 499) return "snow";
    if (code >= 500 && code <= 515) return "fog";
    if (code === 900) return "sunny";
    if (code === 901) return "snow";
  }

  const t = String(text);
  if (/雷/.test(t)) return "thunder";
  if (/雨|阵雨|毛毛雨/.test(t)) return "rain";
  if (/雪|冰|霜/.test(t)) return "snow";
  if (/雾|霾|沙|尘/.test(t)) return "fog";
  if (/阴/.test(t)) return "overcast";
  if (/云|多云/.test(t)) return "cloudy";
  if (/晴|热/.test(t)) return "sunny";
  return "unknown";
}

/**
 * @param {string | number | undefined} iconDay
 * @param {string} [text]
 */
export function weatherIconSvg(iconDay, text = "") {
  const key = resolveWeatherIconKey(iconDay, text);
  return SVG[key] || SVG.unknown;
}
