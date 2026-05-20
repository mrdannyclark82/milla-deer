import neo4j, { Driver, Session } from 'neo4j-driver';
import { OpenAIEmbeddings } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryEntity {
  id: string;
  name: string;
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'CONCEPT' | 'EVENT' | 'TASK';
  description: string;
  properties: Record<string, any>;
  embedding?: number[];
  createdAt: Date;
}

export interface MemoryRelationship {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

export class GraphMemory {
  private driver: Driver;
  private embeddings: OpenAIEmbeddings;
  
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'milla-memory'
      )
    );
    
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small'
    });
  }

  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      // Create constraints
      await session.run(`
        CREATE CONSTRAINT entity_id IF NOT EXISTS
        FOR (e:Entity) REQUIRE e.id IS UNIQUE
      `);
      
      // Create vector index
      await session.run(`
        CREATE VECTOR INDEX memory_embeddings IF NOT EXISTS
        FOR (e:Entity) ON (e.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 1536,
          \`vector.similarity_function\`: 'cosine'
        }}
      `);
      
      console.log('✅ GraphRAG Memory initialized');
    } finally {
      await session.close();
    }
  }

  async storeMemory(
    content: string,
    metadata: Partial<MemoryEntity> = {}
  ): Promise<string> {
    const session = this.driver.session();
    const id = uuidv4();
    
    try {
      const embedding = await this.embeddings.embedQuery(content);
      
      // Extract entities using LLM (simplified - use actual extraction)
      const entities = await this.extractEntities(content);
      
      await session.run(`
        MERGE (memory:Memory {id: $id})
        SET memory.content = $content,
            memory.embedding = $embedding,
            memory.createdAt
