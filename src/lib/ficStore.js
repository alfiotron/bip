import { getMeta, setMeta } from './db/index.js';

// Il token di Fatture in Cloud resta solo su questa cassa (tabella meta): non viene
// sincronizzato con le altre casse e non finisce nel journal.
export async function ficConfig() {
  return {
    token: await getMeta('fic_token', ''),
    companyId: await getMeta('fic_company_id', ''),
    companyName: await getMeta('fic_company_name', '')
  };
}

export async function saveFicConfig({ token, companyId, companyName }) {
  await setMeta('fic_token', token || '');
  await setMeta('fic_company_id', companyId || '');
  await setMeta('fic_company_name', companyName || '');
}
