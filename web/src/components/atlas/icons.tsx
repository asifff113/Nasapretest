// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// One icon per catalog group (heat, water, weather, sky, air, land), read from catalog.json's "group" field.
import { createElement } from 'react';
import { CloudSun, Droplets, Factory, Gauge, Globe2, Leaf, Thermometer, type LucideIcon } from 'lucide-react';

const GROUP_ICON: Record<string, LucideIcon> = { heat: Thermometer, water: Droplets, weather: Gauge, sky: CloudSun, air: Factory, land: Leaf };

export function groupIcon(group: string | undefined): LucideIcon {
  return (group && GROUP_ICON[group]) || Globe2;
}

/** "Model", "Satellite" or "Observations", from catalog.json's "kind" field. */
export function kindLabel(t: (k: string) => string, kind: string): string {
  return kind === 'model' ? t('record_card.badge_model') : kind === 'satellite' ? t('record_card.badge_satellite') : t('record_card.badge_observations');
}

/** The icon of a catalog group, as an element. */
export function GroupIcon({ group, className }: { group: string | undefined; className?: string }) {
  return createElement(groupIcon(group), { className, 'aria-hidden': true });
}
