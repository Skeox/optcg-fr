import { createHash } from 'node:crypto';

/** Une modification d'identité marchande exige une nouvelle revue, pas un nouveau prix. */
export function blueprintSignature(blueprint) {
  return createHash('sha256').update(JSON.stringify({
    id: blueprint.id,
    expansion: blueprint.expansion_id,
    name: blueprint.name,
    version: blueprint.version ?? '',
    number: blueprint.fixed_properties?.collector_number ?? '',
    image: blueprint.image_url,
    products: [...(blueprint.card_market_ids ?? [])].sort((a, b) => a - b),
  })).digest('hex');
}
