/**
 * useColumnLabel
 *
 * Gibt den effektiven Anzeigetext für einen Spaltenschlüssel zurück:
 *   labelOverrides[key]  →  gesetzt vom Admin (höchste Priorität)
 *   fallback             →  Original-Label aus der importierten Datei
 *
 * Nutzung:
 *   const getLabel = useColumnLabel();
 *   getLabel('Market value excluding VAT', 'Market value excluding VAT')
 *   // → z. B. "Marktwert netto" wenn Admin das überschrieben hat
 */
import { useCustomColumnsStore } from './useStore';

export function useColumnLabel() {
  const { getLabel } = useCustomColumnsStore();
  return getLabel;
}
