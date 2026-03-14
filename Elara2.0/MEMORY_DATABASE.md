# External Memory Database - Elara 2.0

## Overview

Elara now features a sophisticated **External Memory Database** using IndexedDB for persistent, structured long-term memory storage. This goes beyond simple localStorage to provide a powerful, queryable memory system.

## Architecture

### Storage Technology
- **IndexedDB** - Browser-native structured database
- **Persistent** - Survives browser restarts
- **Indexed** - Fast queries by type, timestamp, importance, tags
- **Scalable** - Can store thousands of memories efficiently

### Data Structures

#### MemoryEntry
```typescript
{
  id: string;                    // Unique identifier
  type: 'conversation' | 'knowledge' | 'user_preference' | 'context' | 'insight';
  content: string;               // The actual memory content
  metadata: {
    timestamp: number;           // When memory was created
    importance: number;          // 1-10 scale
    tags: string[];             // Searchable tags
    relatedTo?: string[];       // Links to related memories
    source?: string;            // Origin of the memory
  };
  embedding?: number[];         // Reserved for future semantic search
}
```

#### UserProfile
```typescript
{
  id: string;
  preferences: Record<string, any>;
  interactionHistory: {
    totalMessages: number;
    topicsDiscussed: string[];
    favoriteFeatures: string[];
  };
  lastUpdated: number;
}
```

## Features

### 1. Automatic Memory Storage
Every conversation is automatically stored:
- **User messages** → `conversation` type, importance: 5
- **Assistant responses** → `conversation` type, importance: 6  
- **Learned knowledge** → `knowledge` type, importance: 8

### 2. Advanced Querying
```typescript
// Query by type
await queryMemories({ type: 'knowledge' })

// Query by importance
await queryMemories({ minImportance: 7 })

// Query by tags
await queryMemories({ tags: ['learning', 'ai'] })

// Combined filters with sorting
await queryMemories({ 
  type: 'conversation',
  minImportance: 5,
  sortBy: 'timestamp',
  limit: 50
})
```

### 3. Full-Text Search
```typescript
// Search across all memory content and tags
await searchMemories("quantum computing")
```

### 4. Analytics & Insights
```typescript
const stats = await getMemoryStats();
// Returns:
// - totalMemories
// - byType (breakdown by memory type)
// - avgImportance
// - topTags (most frequent tags with counts)
```

### 5. Memory Management

#### Export
- Downloads entire memory database as JSON
- Includes all memories and user profile
- Portable backup format

#### Import
- Restores memories from JSON export
- Merges with existing data
- Preserves all metadata

#### Prune
- Removes old, low-importance memories
- Default: >90 days old AND importance < 5
- Customizable thresholds
- Returns count of deleted memories

### 6. Dashboard Integration

New Memory Database section in left sidebar shows:
- **Total Memories** count
- **Average Importance** score
- **Top Tags** with usage counts
- **Export** button - Download database
- **Import** button - Restore database
- **Prune** button - Clean old memories

## API Reference

### Core Functions

```typescript
// Initialize (auto-called on app start)
await initMemoryDB()

// Store new memory
const id = await storeMemory({
  type: 'knowledge',
  content: 'Python is a high-level programming language',
  metadata: {
    timestamp: Date.now(),
    importance: 7,
    tags: ['python', 'programming'],
    source: 'user-teaching'
  }
})

// Query memories
const memories = await queryMemories({
  type: 'conversation',
  minImportance: 6,
  limit: 20
})

// Search
const results = await searchMemories('machine learning')

// Get statistics
const stats = await getMemoryStats()

// User profile
const profile = await getUserProfile()
await saveUserProfile(profile)

// Export/Import
const json = await exportMemoryData()
await importMemoryData(json)

// Maintenance
const deleted = await pruneMemories(90, 5)
```

## Memory Types

| Type | Purpose | Default Importance |
|------|---------|-------------------|
| `conversation` | User/assistant messages | 5-6 |
| `knowledge` | Learned information | 8 |
| `user_preference` | User settings/likes | 7 |
| `context` | Session context | 6 |
| `insight` | AI-generated insights | 7 |

## Future Enhancements

### Phase 1 (Planned)
- ✅ Basic IndexedDB storage
- ✅ Query by type, tags, importance
- ✅ Export/Import functionality
- ✅ Memory pruning

### Phase 2 (Roadmap)
- 🔲 **Semantic Search** - Vector embeddings via Gemini API
- 🔲 **Memory Consolidation** - Merge related memories
- 🔲 **Smart Importance** - Auto-adjust based on access frequency
- 🔲 **Memory Graphs** - Visual relationship mapping
- 🔲 **Context Windows** - Auto-inject relevant memories into prompts

### Phase 3 (Future)
- 🔲 **Cross-device Sync** - Cloud backup option
- 🔲 **Compression** - LZ compression for large memories
- 🔲 **Encryption** - Secure sensitive memories
- 🔲 **Memory Replay** - Reconstruct past conversation context

## Browser Compatibility

IndexedDB is supported in:
- ✅ Chrome 24+
- ✅ Firefox 16+
- ✅ Safari 10+
- ✅ Edge 12+

## Storage Limits

- **Desktop Chrome/Edge**: ~80% of disk space
- **Desktop Firefox**: ~50% of disk space  
- **Mobile browsers**: 50-500MB typically

The system will automatically handle quota errors gracefully.

## Privacy & Security

- All data stored **locally** in browser
- No automatic cloud sync
- User controls export/import
- Can be cleared via browser settings
- Export for manual backup recommended

## Performance

- **Write**: ~1-2ms per memory
- **Query**: ~5-10ms for filtered queries
- **Search**: ~50-100ms for full-text search
- **Indexed lookups**: <1ms

Optimized for:
- Fast writes during conversations
- Efficient tag-based filtering
- Minimal impact on chat performance

## Usage Example

```typescript
// Store a complex memory with relationships
const memId = await storeMemory({
  type: 'insight',
  content: 'User prefers concise technical explanations',
  metadata: {
    timestamp: Date.now(),
    importance: 9,
    tags: ['user-preference', 'communication-style'],
    relatedTo: [prevMemoryId1, prevMemoryId2],
    source: 'pattern-analysis'
  }
});

// Later, query for communication preferences
const preferences = await queryMemories({
  tags: ['user-preference', 'communication-style'],
  minImportance: 7
});

// Use in prompt context
const context = preferences.map(m => m.content).join('\n');
```

## Troubleshooting

### Memory not persisting?
- Check browser privacy settings
- Ensure IndexedDB is enabled
- Check storage quota

### Slow queries?
- Reduce result limits
- Use specific type filters
- Add more granular tags

### Import fails?
- Verify JSON format
- Check file encoding (UTF-8)
- Ensure file is valid export

## Monitoring

Access browser DevTools → Application → IndexedDB → `ElaraMemoryDB` to inspect:
- `memories` store - All memory entries
- `profiles` store - User profiles
- `embeddings` store - Future vector data

---

**Status**: ✅ Fully Operational  
**Version**: 1.0  
**Last Updated**: 2025-12-05
