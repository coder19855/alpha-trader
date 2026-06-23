import { PaDrilldown } from '../../core/models/deck.models';

export function drilldownRow(
  drilldown: PaDrilldown | null | undefined,
  sectionId: string,
  label: string,
): { value: string; tone?: string } | null {
  const section = drilldown?.sections?.find((s) => s.id === sectionId);
  const row = section?.rows?.find(
    (r) => r.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  if (!row?.value) return null;
  return { value: row.value, tone: row.tone };
}

export function drilldownSection(
  drilldown: PaDrilldown | null | undefined,
  sectionId: string,
): Array<{ label: string; value: string; tone?: string }> {
  const section = drilldown?.sections?.find((s) => s.id === sectionId);
  return section?.rows ?? [];
}