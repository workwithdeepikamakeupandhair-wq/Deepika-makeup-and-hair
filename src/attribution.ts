/**
 * Remembers which ad brought the visitor here (utm_* parameters and click IDs from the landing URL), so a booking
 * request sent later in the same visit shows the campaign in the leads dashboard. Kept for the browser tab's
 * session only; nothing is stored if the URL has no tracking parameters.
 */
const KEY = 'dmh_attribution';
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'gclid'] as const;

export type Attribution = Partial<Record<(typeof PARAMS)[number], string>>;

export function captureAttribution() {
  try {
    const query = new URLSearchParams(window.location.search);
    const found: Attribution = {};
    for (const p of PARAMS) {
      const v = query.get(p);
      if (v) found[p] = v.slice(0, 500);
    }
    if (Object.keys(found).length) sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // Storage blocked (private mode, etc.): the lead just won't show the campaign
  }
}

export function getAttribution(): Attribution | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
