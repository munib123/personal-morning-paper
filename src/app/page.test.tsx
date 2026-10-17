import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LandingPage, { revalidate } from './page';

afterEach(() => { cleanup(); });

describe('landing page', () => {
  test('is one masthead hero with the promise and one call to action', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(screen.getByText('Every morning')).toBeInTheDocument();
    expect(screen.getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{1,2} [A-Z][a-z]+ \d{4}$/)).toBeInTheDocument();
    expect(screen.getByText('One paper, every morning, about what you care about.')).toHaveClass('deck');
    expect(screen.getByText('Takes about a minute to set up. No account needed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Build my paper' })).toHaveAttribute('href', '/start');
  });

  test('offers the demo reader and a sample PDF as quieter links', () => {
    render(<LandingPage />);
    expect(screen.getByRole('link', { name: 'Try the demo reader' })).toHaveAttribute('href', '/demo');
    const pdf = screen.getByRole('link', { name: 'See a sample PDF' });
    expect(pdf).toHaveAttribute('href', '/demo/sample.pdf');
    expect(pdf).toHaveAttribute('target', '_blank');
    expect(pdf).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  test('regenerates every 10 minutes so the date stays current', () => {
    expect(revalidate).toBe(600);
  });
});
