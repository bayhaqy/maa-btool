/**
 * Pinecone Vector Search Integration
 *
 * Used by the Documentation Hub (and future AI search features) to store and
 * search embeddings of articles/records. All functions degrade gracefully
 * when `PINECONE_API_KEY` is not configured — they log a warning and return
 * empty results so the rest of the app keeps working without vector search.
 *
 * Configure with `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`.
 */

import { Pinecone, type Index } from '@pinecone-database/pinecone';

/** A single search hit returned by {@link searchDocs}. */
export interface DocSearchHit {
  docId: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Expected dimension of embeddings. OpenAI text-embedding-3-small uses 1536. */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Get a configured Pinecone index client.
 *
 * Returns `null` when `PINECONE_API_KEY` is missing or empty.
 */
export function getPineconeIndex(): Index<Record<string, unknown>> | null {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  const indexName =
    process.env.PINECONE_INDEX_NAME || 'maa-btool-docs';
  try {
    const pinecone = new Pinecone({ apiKey });
    return pinecone.index<Record<string, unknown>>(indexName);
  } catch (err) {
    console.warn('[pinecone] Failed to construct Pinecone index client:', err);
    return null;
  }
}

/**
 * Upsert (insert or update) a document embedding.
 *
 * @param docId - Stable document id used as the Pinecone record id.
 * @param embedding - Dense vector of dimension {@link EMBEDDING_DIMENSION}.
 * @param metadata - Arbitrary metadata to store alongside the vector
 *                   (e.g. `{ title, slug, category, updatedAt }`).
 */
export async function upsertDocEmbedding(
  docId: string,
  embedding: number[],
  metadata: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const index = getPineconeIndex();
  if (!index) {
    console.warn('[pinecone] upsertDocEmbedding skipped — not configured');
    return { success: false, error: 'Pinecone not configured' };
  }
  try {
    await index.upsert([
      {
        id: docId,
        values: embedding,
        metadata,
      },
    ]);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[pinecone] upsertDocEmbedding failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Search for documents whose embeddings are most similar to the query vector.
 *
 * @param queryEmbedding - Dense query vector (same dimension as indexed docs).
 * @param topK - Maximum number of hits to return. Defaults to 5.
 * @returns Array of hits sorted by relevance (descending score), or `[]`
 *          when Pinecone is not configured or the query fails.
 */
export async function searchDocs(
  queryEmbedding: number[],
  topK = 5,
): Promise<DocSearchHit[]> {
  const index = getPineconeIndex();
  if (!index) {
    console.warn('[pinecone] searchDocs skipped — not configured');
    return [];
  }
  try {
    const response = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });
    const matches = response.matches ?? [];
    return matches.map((m) => ({
      docId: m.id,
      score: m.score ?? 0,
      metadata: (m.metadata as Record<string, unknown>) ?? {},
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[pinecone] searchDocs failed:', message);
    return [];
  }
}

/**
 * Delete a document's embedding from the index.
 *
 * @param docId - The document id (Pinecone record id) to delete.
 */
export async function deleteDocEmbedding(
  docId: string,
): Promise<{ success: boolean; error?: string }> {
  const index = getPineconeIndex();
  if (!index) {
    console.warn('[pinecone] deleteDocEmbedding skipped — not configured');
    return { success: false, error: 'Pinecone not configured' };
  }
  try {
    await index.deleteOne(docId);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[pinecone] deleteDocEmbedding failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Generate an embedding vector for a piece of text.
 *
 * STUB: Returns a deterministic placeholder zero-vector of dimension
 * {@link EMBEDDING_DIMENSION}. This lets the upsert/search code paths be
 * wired up end-to-end before a real embedding model is integrated.
 *
 * TODO: Replace this with a real embedding generation call (e.g. OpenAI
 * `text-embedding-3-small`, Cohere, or a local model). The implementation
 * should accept text and return a `number[]` of length EMBEDDING_DIMENSION
 * with values normalized to unit length for best cosine-similarity results.
 *
 * @param text - The text to embed.
 * @returns A zero vector of length EMBEDDING_DIMENSION.
 */
export function generateEmbedding(text: string): number[] {
  // Touch the text so static analyzers don't flag the unused param.
  void text;
  // TODO: integrate a real embedding model here (see JSDoc above).
  return new Array<number>(EMBEDDING_DIMENSION).fill(0);
}
