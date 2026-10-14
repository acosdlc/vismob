// The note under the samples form's button and in the client's confirmation email
// (DESIGN §4.3): „Livrare prin curier în [2–3 zile lucrătoare]. [Gratuit.]”. Built here
// because the form is a client module and the email a server one.

/** „[gratuit]” → „[Gratuit]”: the first letter, skipping a placeholder's bracket. */
export function capitalise(value: string): string {
  const i = value.search(/\p{L}/u);
  return i < 0 ? value : value.slice(0, i) + value[i].toUpperCase() + value.slice(i + 1);
}

/** `samplesDelivery` and `samplesFree` are `settings.samples_delivery` and `settings.samples_free`. */
export function samplesDeliveryNote(samplesDelivery: string, samplesFree: string): string {
  return `Livrare prin curier în ${samplesDelivery}. ${capitalise(samplesFree)}.`;
}
