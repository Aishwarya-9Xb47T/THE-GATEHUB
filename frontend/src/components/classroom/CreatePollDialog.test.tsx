import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreatePollDialog } from '@/components/classroom/CreatePollDialog';

describe('CreatePollDialog', () => {
  it('adds and removes options dynamically', () => {
    const onSubmit = vi.fn();
    render(
      <CreatePollDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByPlaceholderText('Option A')).toBeTruthy();
    expect(screen.getByPlaceholderText('Option B')).toBeTruthy();

    fireEvent.click(screen.getByText('Add option'));
    expect(screen.getByPlaceholderText('Option C')).toBeTruthy();
  });

  it('shows an error for an empty question', async () => {
    const onSubmit = vi.fn();
    render(
      <CreatePollDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByText('Save draft'));
    expect(await screen.findByText(/enter a poll question/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
