// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaperError, PaperLoading } from './PaperStates';

afterEach(cleanup);

describe('paper states', () => {
  it('a failed paper says what happened and offers a retry and the archive', () => {
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PaperError error={new Error('db down')} retry={retry} />);
    expect(screen.getByRole('heading', { level: 1, name: "Your paper couldn't be set just now." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Past editions' })).toHaveAttribute('href', '/archive');
    expect(document.body.textContent).not.toMatch(/db down/);
    error.mockRestore();
  });

  it('loading shows skeleton blocks and a dateline status, no spinner', () => {
    render(<PaperLoading />);
    expect(screen.getByRole('status')).toHaveTextContent("Setting today's paper");
    expect(document.querySelectorAll('[data-skeleton]').length).toBeGreaterThan(3);
  });
});
