'use client';
// Step 4, "Your routine": how much paper and when. It changes how much you get, not what's in it.
// Delivery time is kept in the draft only: OnboardingInput has no field for it yet (handoff contract request).
import { Segmented, TextField } from '@/components/morrow';
import type { Presentation, TimeBudget } from '@/contracts/profile';
import type { DeliveryHour } from './lib/draft';

export interface RoutineValue {
  presentation: Presentation;
  deliveryHour: DeliveryHour;
  city: string;
}

const LENGTHS = [
  { value: '5', label: 'Quick', hint: '5 min' },
  { value: '15', label: 'Standard', hint: '15 min' },
  { value: '30', label: 'Deep', hint: '30 min' },
];
const DELIVERY = [
  { value: '6', label: '6:00' },
  { value: '7', label: '7:00' },
  { value: '8', label: '8:00' },
];

export function RoutineStep({ value, onChange }: { value: RoutineValue; onChange: (v: RoutineValue) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <Segmented
        label="Paper length"
        name="length"
        options={LENGTHS}
        value={String(value.presentation.timeBudget)}
        onChange={(v) => onChange({ ...value, presentation: { ...value.presentation, timeBudget: Number(v) as TimeBudget } })}
      />
      <Segmented
        label="Delivery time"
        name="delivery"
        options={DELIVERY}
        value={String(value.deliveryHour)}
        onChange={(v) => onChange({ ...value, deliveryHour: Number(v) as DeliveryHour })}
      />
      <TextField label="City" hint="For local news and weather." value={value.city} onChange={(city) => onChange({ ...value, city })} />
    </div>
  );
}

export default RoutineStep;
