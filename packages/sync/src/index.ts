import * as Y from 'yjs';
export * from './store/graph-store.js';

export class SyncEngine {
  readonly doc: Y.Doc;
  readonly nodes: Y.Map<unknown>; // Yjs maps store strict JSON types or Y types, we need to handle serialization
  readonly edges: Y.Map<unknown>;

  constructor(doc?: Y.Doc) {
    this.doc = doc || new Y.Doc();
    this.nodes = this.doc.getMap('nodes');
    this.edges = this.doc.getMap('edges');
  }

  // Helper to sync methods, but Core owns the graph model.
  // Sync package is for Yjs document management and provider abstraction.
  // So maybe this class is just a wrapper around Y.Doc?

  getDoc() {
    return this.doc;
  }
}
