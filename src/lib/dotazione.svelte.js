// Stato della scheda Dotazione (serve anche allo scanner, per aprire un prodotto leggendone il codice).
export const dz = $state({
  eventId: null,
  selected: null, // id del prodotto aperto
  filter: 'all',
  query: '',
  importing: false, // true quando è aperta l'importazione dai DDT di Fatture in Cloud
  notice: '',
  missing: '' // codice letto ma non in catalogo
});
