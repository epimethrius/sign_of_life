import soil  from './soil.js';
import sand  from './sand.js';
import water from './water.js';
import rock  from './rock.js';

// Ordered by typeId. Index = typeId - 1.
export const ALL_TERRAINS = [soil, sand, water, rock];

// Quick lookup by typeId (integer stored in the terrain layer).
const BY_TYPE_ID = new Map(ALL_TERRAINS.map(t => [t.typeId, t]));

/**
 * Returns the CSS color for a given terrain typeId.
 * Falls back to opaque black if unknown.
 */
export function colorOf(typeId) {
  return BY_TYPE_ID.get(typeId)?.color ?? '#000';
}

/**
 * Returns a terrain effect multiplier for a given typeId and effect key.
 * Returns 1.0 (neutral) if the terrain or key is unknown.
 */
export function effectOf(typeId, key) {
  return BY_TYPE_ID.get(typeId)?.effects?.[key] ?? 1.0;
}

/**
 * Returns the terrain module for a given typeId, or undefined.
 */
export function terrainOf(typeId) {
  return BY_TYPE_ID.get(typeId);
}
