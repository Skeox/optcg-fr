import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

/** Nombre d'exemplaires à conserver par carte (au-delà = doublons à vendre). */
export function useKeep(): number {
  return useLiveQuery(async () => ((await db.settings.get('keep'))?.value as number | undefined) ?? 1, [], 1);
}
