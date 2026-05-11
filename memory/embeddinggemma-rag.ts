import { EmbeddingGemma } from '@google-ai-edge/litert';

function cosine(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const semanticRAG = async (query: string, documents: string[]) => {
  const embedder = await EmbeddingGemma.load({ model: 'embeddinggemma-300m', options: { quantized: true } });
  const queryEmb = await embedder.embed(query);
  const results = [];
  for (const doc of documents) {
    const docEmb = await embedder.embed(doc);
    const score = cosine(queryEmb, docEmb);
    results.push({ doc, score });
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};