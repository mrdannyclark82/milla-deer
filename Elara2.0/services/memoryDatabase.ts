// External Memory Database using IndexedDB
// Provides persistent, structured storage for Elara's long-term memory

interface MemoryEntry {
  id: string;
  type: 'conversation' | 'knowledge' | 'user_preference' | 'context' | 'insight';
  content: string;
  metadata: {
    timestamp: number;
    importance: number; // 1-10 scale
    tags: string[];
    relatedTo?: string[]; // IDs of related memories
    source?: string;
  };
  embedding?: number[]; // For future semantic search
}

interface UserProfile {
  id: string;
  preferences: Record<string, any>;
  interactionHistory: {
    totalMessages: number;
    topicsDiscussed: string[];
    favoriteFeatures: string[];
  };
  lastUpdated: number;
}

class MemoryDatabase {
  private dbName = 'ElaraMemoryDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Memory Store
        if (!db.objectStoreNames.contains('memories')) {
          const memoryStore = db.createObjectStore('memories', { keyPath: 'id' });
          memoryStore.createIndex('type', 'type', { unique: false });
          memoryStore.createIndex('timestamp', 'metadata.timestamp', { unique: false });
          memoryStore.createIndex('importance', 'metadata.importance', { unique: false });
          memoryStore.createIndex('tags', 'metadata.tags', { unique: false, multiEntry: true });
        }

        // User Profile Store
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' });
        }

        // Semantic Index (for future vector search)
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings', { keyPath: 'memoryId' });
        }
      };
    });
  }

  // === MEMORY OPERATIONS ===

  async storeMemory(memory: Omit<MemoryEntry, 'id'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullMemory: MemoryEntry = { id, ...memory };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readwrite');
      const store = transaction.objectStore('memories');
      const request = store.add(fullMemory);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getMemory(id: string): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readonly');
      const store = transaction.objectStore('memories');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async queryMemories(filters: {
    type?: MemoryEntry['type'];
    minImportance?: number;
    tags?: string[];
    limit?: number;
    sortBy?: 'timestamp' | 'importance';
  }): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readonly');
      const store = transaction.objectStore('memories');
      
      let request: IDBRequest;
      
      if (filters.type) {
        const index = store.index('type');
        request = index.getAll(filters.type);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results: MemoryEntry[] = request.result || [];

        // Apply filters
        if (filters.minImportance) {
          results = results.filter(m => m.metadata.importance >= filters.minImportance!);
        }

        if (filters.tags && filters.tags.length > 0) {
          results = results.filter(m => 
            filters.tags!.some(tag => m.metadata.tags.includes(tag))
          );
        }

        // Sort
        if (filters.sortBy === 'importance') {
          results.sort((a, b) => b.metadata.importance - a.metadata.importance);
        } else {
          results.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);
        }

        // Limit
        if (filters.limit) {
          results = results.slice(0, filters.limit);
        }

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async updateMemory(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getMemory(id);
    if (!existing) throw new Error('Memory not found');

    const updated = { ...existing, ...updates, id }; // Preserve ID

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readwrite');
      const store = transaction.objectStore('memories');
      const request = store.put(updated);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMemory(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readwrite');
      const store = transaction.objectStore('memories');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === USER PROFILE OPERATIONS ===

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['profiles'], 'readwrite');
      const store = transaction.objectStore('profiles');
      const request = store.put(profile);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUserProfile(id: string = 'default'): Promise<UserProfile | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['profiles'], 'readonly');
      const store = transaction.objectStore('profiles');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // === ANALYTICS & INSIGHTS ===

  async getMemoryStats(): Promise<{
    totalMemories: number;
    byType: Record<string, number>;
    avgImportance: number;
    topTags: Array<{ tag: string; count: number }>;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const memories = await this.queryMemories({});
    
    const stats = {
      totalMemories: memories.length,
      byType: {} as Record<string, number>,
      avgImportance: 0,
      topTags: [] as Array<{ tag: string; count: number }>
    };

    const tagCounts = new Map<string, number>();
    let totalImportance = 0;

    memories.forEach(mem => {
      // Count by type
      stats.byType[mem.type] = (stats.byType[mem.type] || 0) + 1;
      
      // Sum importance
      totalImportance += mem.metadata.importance;
      
      // Count tags
      mem.metadata.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    stats.avgImportance = memories.length > 0 ? totalImportance / memories.length : 0;
    
    // Top 10 tags
    stats.topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  async searchMemories(query: string): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    const allMemories = await this.queryMemories({});
    const lowerQuery = query.toLowerCase();

    // Simple text search (can be enhanced with embeddings later)
    return allMemories.filter(mem => 
      mem.content.toLowerCase().includes(lowerQuery) ||
      mem.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // === MAINTENANCE ===

  async pruneOldMemories(daysToKeep: number = 90, minImportance: number = 5): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const memories = await this.queryMemories({});
    
    let deletedCount = 0;
    
    for (const mem of memories) {
      // Delete if old AND low importance
      if (mem.metadata.timestamp < cutoffTime && mem.metadata.importance < minImportance) {
        await this.deleteMemory(mem.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async clearAllMemories(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memories'], 'readwrite');
      const store = transaction.objectStore('memories');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async exportMemories(): Promise<string> {
    const memories = await this.queryMemories({});
    const profile = await getUserProfile();
    
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      version: this.version,
      memories,
      profile
    }, null, 2);
  }

  async importMemories(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);
    
    // Import memories
    if (data.memories) {
      for (const mem of data.memories) {
        await this.storeMemory(mem);
      }
    }
    
    // Import profile
    if (data.profile) {
      await this.saveUserProfile(data.profile);
    }
  }
}

// Singleton instance
export const memoryDB = new MemoryDatabase();

// Helper functions for easy access
export const initMemoryDB = () => memoryDB.initialize();
export const storeMemory = (memory: Omit<MemoryEntry, 'id'>) => memoryDB.storeMemory(memory);
export const queryMemories = (filters: Parameters<typeof memoryDB.queryMemories>[0]) => memoryDB.queryMemories(filters);
export const searchMemories = (query: string) => memoryDB.searchMemories(query);
export const getMemoryStats = () => memoryDB.getMemoryStats();
export const getUserProfile = (id?: string) => memoryDB.getUserProfile(id);
export const saveUserProfile = (profile: UserProfile) => memoryDB.saveUserProfile(profile);
export const exportMemoryData = () => memoryDB.exportMemories();
export const importMemoryData = (data: string) => memoryDB.importMemories(data);
export const pruneMemories = (days?: number, minImportance?: number) => memoryDB.pruneOldMemories(days, minImportance);

export type { MemoryEntry, UserProfile };
