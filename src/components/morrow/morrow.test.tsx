import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoryCard } from './index';

describe('Morrow StoryCard image', () => {
  it('hotlinks publisher images without a Referer (§8), so hotlink protection does not break them', () => {
    const { container } = render(
      <StoryCard variant="lead" headline="Central bank holds rates" imageUrl="https://example.com/a.jpg" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
});
