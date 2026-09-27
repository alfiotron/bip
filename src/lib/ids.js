/** Identificativo univoco (UUID v4): due casse non possono mai generare lo stesso. */
export const uuid = () => crypto.randomUUID();
/** Data e ora in formato ISO (UTC): si ordina correttamente anche come testo. */
export const nowIso = () => new Date().toISOString();
