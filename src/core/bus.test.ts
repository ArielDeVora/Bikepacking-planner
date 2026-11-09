import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './bus';

describe('EventBus', () => {
  it('delivers events and unsubscribes', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('selection:changed', fn);
    bus.emit('selection:changed', { ids: ['a'] });
    off();
    bus.emit('selection:changed', { ids: ['b'] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ ids: ['a'] });
  });

  it('isolates failing handlers', () => {
    const bus = new EventBus();
    const ok = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('trip:loaded', () => {
      throw new Error('boom');
    });
    bus.on('trip:loaded', ok);
    bus.emit('trip:loaded', { tripId: 't' });
    expect(ok).toHaveBeenCalled();
  });
});
