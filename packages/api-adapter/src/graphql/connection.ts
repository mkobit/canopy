import { fromThrowable } from '@canopy/graph';

export interface PageInfo {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor?: string | undefined;
  readonly endCursor?: string | undefined;
}

export interface ConnectionEdge<T> {
  readonly cursor: string;
  readonly node?: T | undefined;
  readonly edge?: T | undefined;
}

export interface Connection<T> {
  readonly totalCount: number;
  readonly edges: readonly ConnectionEdge<T>[];
  readonly pageInfo: PageInfo;
}

export const encodeCursor = (offset: number): string => {
  return new TextEncoder().encode(`cursor:${offset}`).toBase64();
};

export const decodeCursor = (cursor: string): number => {
  const result = fromThrowable(() => new TextDecoder().decode(Uint8Array.fromBase64(cursor)));
  if (!result.ok) {
    return 0;
  }
  const match = /^cursor:(\d+)$/.exec(result.value);
  return match && match[1] ? Number(match[1]) : 0;
};

export const buildConnection = <T>(
  items: readonly T[],
  offset: number,
  totalCount: number,
  isEdge = false,
): Connection<T> => {
  const edges: readonly ConnectionEdge<T>[] = items.map((item, index) => {
    const cursor = encodeCursor(offset + index);
    return isEdge ? { cursor, edge: item } : { cursor, node: item };
  });

  const startCursor = edges[0]?.cursor;
  const endCursor = edges.at(-1)?.cursor;

  return {
    totalCount,
    edges,
    pageInfo: {
      hasNextPage: offset + items.length < totalCount,
      hasPreviousPage: offset > 0,
      startCursor,
      endCursor,
    },
  };
};
