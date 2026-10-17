import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_DRAFT } from './lib/draft';
import { RoutineStep, type RoutineValue } from './RoutineStep';

afterEach(() => { cleanup(); });
// jsdom + userEvent can be slow on a loaded machine (seven lanes share one); give each test room.
vi.setConfig({ testTimeout: 15_000 });

const initial: RoutineValue = { presentation: DEFAULT_DRAFT.presentation, deliveryHour: DEFAULT_DRAFT.deliveryHour, city: DEFAULT_DRAFT.city };

function Controlled({ spy }: { spy: (v: RoutineValue) => void }) {
  const [value, setValue] = useState(initial);
  return <RoutineStep value={value} onChange={(v) => { spy(v); setValue(v); }} />;
}

describe('RoutineStep', () => {
  test('starts on Standard, 7:00 and Islamabad', () => {
    render(<Controlled spy={vi.fn()} />);
    // Morrow's Segmented names its fieldset (legend); the inner radiogroup has no name of its own.
    expect(screen.getByRole('group', { name: 'Paper length' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Delivery time' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Standard/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: '7:00' })).toBeChecked();
    expect(screen.getByLabelText('City')).toHaveValue('Islamabad');
    expect(screen.getByText('For local news and weather.')).toBeInTheDocument();
  });

  test('length maps to a numeric time budget and keeps depth and language', async () => {
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await userEvent.click(screen.getByRole('radio', { name: /Quick/ }));
    expect(spy).toHaveBeenLastCalledWith({ ...initial, presentation: { timeBudget: 5, depth: 'basics', lang: 'en' } });
    await userEvent.click(screen.getByRole('radio', { name: /Deep/ }));
    expect(spy.mock.lastCall?.[0].presentation.timeBudget).toBe(30);
  });

  test('delivery time and city update the routine', async () => {
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await userEvent.click(screen.getByRole('radio', { name: '6:00' }));
    expect(spy.mock.lastCall?.[0].deliveryHour).toBe(6);
    const city = screen.getByLabelText('City');
    await userEvent.clear(city);
    await userEvent.type(city, 'Lahore');
    expect(spy.mock.lastCall?.[0].city).toBe('Lahore');
  });
});
