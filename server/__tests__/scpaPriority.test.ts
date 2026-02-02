import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculatePriorityScore,
  enqueueFailure,
  getNextSCPAFailure,
  peekNextSCPAFailure,
  clearSCPAQueue,
  reportAgentFailure,
  AgentFailureContext,
  getSCPAQueueStatus
} from '../metacognitiveService';

// Mock dependencies
vi.mock('../agents/taskStorage', () => ({
  addTask: vi.fn().mockResolvedValue({}),
}));

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('SCPA Priority Queue', () => {
  beforeEach(() => {
    clearSCPAQueue();
    vi.clearAllMocks();
  });

  describe('calculatePriorityScore', () => {
    it('should calculate correct score for critical severity', () => {
      const context: AgentFailureContext = {
        agentName: 'test',
        taskId: '1',
        error: 'error',
        timestamp: Date.now(),
        attemptCount: 1,
        severity: 'critical',
        impact: 'medium',
      };
      // Critical(40) + Medium(20) + 1 attempt(10) = 70
      expect(calculatePriorityScore(context)).toBe(70);
    });

    it('should calculate correct score for high severity and high impact', () => {
      const context: AgentFailureContext = {
        agentName: 'test',
        taskId: '1',
        error: 'error',
        timestamp: Date.now(),
        attemptCount: 1,
        severity: 'high',
        impact: 'high',
      };
      // High(30) + High(30) + 1 attempt(10) = 70
      expect(calculatePriorityScore(context)).toBe(70);
    });

    it('should cap attempt points at 30', () => {
      const context: AgentFailureContext = {
        agentName: 'test',
        taskId: '1',
        error: 'error',
        timestamp: Date.now(),
        attemptCount: 10,
        severity: 'low',
        impact: 'low',
      };
      // Low(10) + Low(10) + 10 attempts(100->30) = 50
      expect(calculatePriorityScore(context)).toBe(50);
    });

    it('should handle defaults', () => {
        const context: AgentFailureContext = {
            agentName: 'test',
            taskId: '1',
            error: 'error',
            timestamp: Date.now(),
            attemptCount: 1,
            // Missing severity/impact
        };
        // Default severity Medium(20) + Default impact Medium(20) + 1 attempt(10) = 50
        expect(calculatePriorityScore(context)).toBe(50);
    });
  });

  describe('Queue Management', () => {
    it('should retrieve failures in order of priority', () => {
      const lowPriority: AgentFailureContext = {
        agentName: 'low',
        taskId: '1',
        error: 'err',
        timestamp: Date.now(),
        attemptCount: 1,
        severity: 'low',
        impact: 'low',
      };

      const highPriority: AgentFailureContext = {
        agentName: 'high',
        taskId: '2',
        error: 'err',
        timestamp: Date.now(),
        attemptCount: 1,
        severity: 'critical',
        impact: 'high',
      };

      const mediumPriority: AgentFailureContext = {
        agentName: 'med',
        taskId: '3',
        error: 'err',
        timestamp: Date.now(),
        attemptCount: 1,
        severity: 'medium',
        impact: 'medium',
      };

      enqueueFailure(lowPriority);
      enqueueFailure(highPriority);
      enqueueFailure(mediumPriority);

      expect(getSCPAQueueStatus().queueSize).toBe(3);
      expect(peekNextSCPAFailure()?.agentName).toBe('high');

      const first = getNextSCPAFailure();
      expect(first?.agentName).toBe('high');

      const second = getNextSCPAFailure();
      expect(second?.agentName).toBe('med');

      const third = getNextSCPAFailure();
      expect(third?.agentName).toBe('low');

      expect(getSCPAQueueStatus().queueSize).toBe(0);
    });
  });

  describe('reportAgentFailure', () => {
    it('should infer severity from error message', async () => {
      await reportAgentFailure(new Error('This is a critical system failure'), {
        agentName: 'test',
      });

      const failure = peekNextSCPAFailure();
      expect(failure?.severity).toBe('critical');
    });

    it('should use provided severity if available', async () => {
      await reportAgentFailure(new Error('Something bad'), {
        agentName: 'test',
        severity: 'high',
      });

      const failure = peekNextSCPAFailure();
      expect(failure?.severity).toBe('high');
    });

    it('should enqueue failure and create fix task', async () => {
      await reportAgentFailure('Error', { agentName: 'test' });

      expect(getSCPAQueueStatus().queueSize).toBe(1);

      const { addTask } = await import('../agents/taskStorage');
      expect(addTask).toHaveBeenCalled();
    });
  });
});
