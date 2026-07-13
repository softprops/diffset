import { beforeEach, describe, expect, it, vi } from 'vitest';

const { run } = vi.hoisted(() => ({
  run: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/action.js', () => ({ run }));

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    run.mockClear();
  });

  it('runs the action exactly once on import', async () => {
    await import('../src/main.js');

    expect(run).toHaveBeenCalledOnce();
  });
});
