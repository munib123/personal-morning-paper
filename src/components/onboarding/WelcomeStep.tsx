'use client';
// Step 1 body: the first name that goes in the masthead ear ("Prepared for Ayesha").
// The full Masthead itself sits above the step frame (OnboardingFlow), so its h1 comes before the step's h2.
import { TextField } from '@/components/morrow';

export function WelcomeStep({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  return <TextField label="First name" hint="It goes on your masthead. Optional." value={name} onChange={onChange} />;
}

export default WelcomeStep;
