import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const originalFs = await importOriginal<typeof import('fs')>();
  return {
    ...originalFs,
    default: {
      ...originalFs,
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
        unlink: vi.fn(),
        copyFile: vi.fn(),
      },
    },
  };
});

import fs from 'fs';
import { FileStorage } from '../fileStorage';

describe('FileStorage Performance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('demonstrates non-blocking behavior of constructor (Optimized Implementation)', async () => {
    // Setup mocks
    // Simulate a slow async read
    (fs.promises.readFile as any).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return JSON.stringify([
        { id: '1', content: 'test', role: 'user', timestamp: new Date() },
      ]);
    });

    const start = Date.now();
    const storage = new FileStorage();
    const duration = Date.now() - start;

    console.log(`Constructor duration (Non-blocking): ${duration}ms`);

    // Constructor should be fast (non-blocking)
    expect(duration).toBeLessThan(50); // Should be < 10ms typically

    // Verify that data access waits for load
    const msgStart = Date.now();
    const messages = await storage.getMessages();
    const msgDuration = Date.now() - msgStart;

    console.log(`getMessages duration (Waiting for load): ${msgDuration}ms`);

    expect(messages).toHaveLength(1);
    // The load takes 100ms.
    // Since we called getMessages immediately after constructor,
    // it should wait for the completion of that 100ms task.
    expect(msgDuration).toBeGreaterThanOrEqual(80); // Allow some margin
  });

  it('handles concurrent saves correctly via queue', async () => {
    // Setup mocks
    // Initial load returns empty array immediately
    (fs.promises.readFile as any).mockResolvedValue('[]');

    // Mock rename to be slow to simulate time taken to "commit" the save
    // This helps ensure serialization logic is exercised
    (fs.promises.rename as any).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // Mock writeFile
    (fs.promises.writeFile as any).mockResolvedValue(undefined);
    // Mock unlink
    (fs.promises.unlink as any).mockResolvedValue(undefined);

    const storage = new FileStorage();
    await storage.getMessages(); // Ensure loaded

    // Start 3 concurrent saves via createMessage
    // In a race condition without queue, these might try to rename at same time or overlap in weird ways if logic wasn't sequential.
    // The queue ensures they run one after another.
    const start = Date.now();
    const p1 = storage.createMessage({
      content: '1',
      role: 'user',
      userId: 'u1',
    } as any);
    const p2 = storage.createMessage({
      content: '2',
      role: 'user',
      userId: 'u1',
    } as any);
    const p3 = storage.createMessage({
      content: '3',
      role: 'user',
      userId: 'u1',
    } as any);

    await Promise.all([p1, p2, p3]);
    const duration = Date.now() - start;

    // Check how many times rename was called
    expect(fs.promises.rename).toHaveBeenCalledTimes(3);

    // Since each rename takes 20ms and they are sequential, total time should be >= 60ms
    // If they were parallel, it would be ~20ms (ignoring overhead)
    console.log(`Concurrent saves duration: ${duration}ms`);
    expect(duration).toBeGreaterThanOrEqual(60);
  });
});
