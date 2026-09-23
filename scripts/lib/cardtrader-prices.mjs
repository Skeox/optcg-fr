/** Ne valoriser que des cartes à l'unité, françaises, disponibles et en EUR. */
export function summarizeFrenchOffers(offers, at) {
  const french = offers.filter((offer) => {
    const languages = Object.entries(offer.properties_hash ?? {}).filter(([key]) => /language$/i.test(key)).map(([, value]) => String(value).toLowerCase());
    return languages.length > 0 && languages.every((language) => language === 'fr')
      && offer.price?.currency === 'EUR' && Number.isSafeInteger(offer.price.cents) && offer.price.cents > 0
      && Number.isSafeInteger(offer.quantity) && offer.quantity > 0
      && !offer.on_vacation && !offer.graded && (offer.bundle_size ?? 1) === 1;
  });
  if (!french.length) return undefined;
  const amounts = french.map((offer) => offer.price.cents).sort((a, b) => a - b);
  const nm = french.filter((offer) => /^(near mint|mint)$/i.test(offer.properties_hash?.condition ?? '')).map((offer) => offer.price.cents);
  const middle = Math.floor(amounts.length / 2);
  return {
    at, n: french.reduce((sum, offer) => sum + offer.quantity, 0), from: amounts[0] / 100,
    med: (amounts.length % 2 ? amounts[middle] : Math.round((amounts[middle - 1] + amounts[middle]) / 2)) / 100,
    nm: nm.length ? Math.min(...nm) / 100 : null,
  };
}
