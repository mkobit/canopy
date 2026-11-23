@service(#{
  title: "Canopy v0 API",
  version: "0.0.0",
})
@doc("Single-source Canopy v0 service contract for server routes, TypeScript client SDK, and unified WIT bindings.")
namespace Canopy.V0 {
  scalar GraphId extends string;
  scalar NodeId extends string;
  scalar EdgeId extends string;
  scalar ShapeId extends string;
  scalar PropertyTypeId extends string;
  scalar NamespaceId extends string;
  scalar EventId extends string;
  scalar BatchId extends string;
  scalar DraftId extends string;
  scalar BundleId extends string;
  scalar MigrationId extends string;
  scalar CommitSeq extends uint64;
  scalar HlcTimestamp extends string;
  scalar CapabilityToken extends string;

  enum CanopyV0ActorKind {
    user: "user",
    agent: "agent",
    plugin: "plugin",
    workflow: "workflow",
  }

  enum CanopyV0WriteConsistencyMode {
    unconditional: "unconditional",
    entityCas: "entity-cas",
    graphCas: "graph-cas",
  }

  enum CanopyV0BatchOperationKind {
    createNode: "create-node",
    updateNodeProperties: "update-node-properties",
    deleteNode: "delete-node",
    createEdge: "create-edge",
    deleteEdge: "delete-edge",
    registerShapeMigration: "register-shape-migration",
  }

  enum CanopyV0Direction {
    in: "in",
    out: "out",
    both: "both",
  }

  enum CanopyV0ViewBindingKind {
    standalone: "standalone",
    shapeBound: "shape-bound",
    openNode: "open-node",
    entityBound: "entity-bound",
    queryBound: "query-bound",
  }

  enum CanopyV0SettingScope {
    node: "node",
    shape: "shape",
    namespace: "namespace",
    global: "global",
    default: "default",
  }

  enum CanopyV0PropertyCardinality {
    one: "one",
    many: "many",
  }

  enum CanopyV0PropertyValueKind {
    text: "text",
    integer: "integer",
    number: "number",
    boolean: "boolean",
    instant: "instant",
    plainDate: "plain-date",
    url: "url",
    reference: "reference",
    externalReference: "external-reference",
  }

  enum CanopyV0ValidationSeverity {
    error: "error",
    warning: "warning",
  }

  model CanopyV0ValidationIssue {
    code: string;
    severity: CanopyV0ValidationSeverity;
    entityKind?: CanopyV0EntityKind;
    entityId?: string;
    path: string[];
    message: string;
    expected?: string;
    actual?: string;
  }

  enum CanopyV0EntityKind {
    node: "node",
    edge: "edge",
  }

  enum CanopyV0MigrationStatus {
    registered: "registered",
    buildingGreen: "building-green",
    swapped: "swapped",
    aborted: "aborted",
  }

  enum CanopyV0DraftStatus {
    open: "open",
    committed: "committed",
    discarded: "discarded",
  }

  enum CanopyV0StreamMessageKind {
    event: "event",
    gap: "gap",
    overflowDisconnect: "overflow_disconnect",
    end: "end",
  }

  model CanopyV0PropertyEntry {
    key: string;
    valueJson: string;
  }

  model CanopyV0ActorProvenance {
    principalId: string;
    actorId: string;
    actorKind: CanopyV0ActorKind;
    deviceId: string;
    hlcTimestamp: HlcTimestamp;
  }

  model CanopyV0ReadConsistency {
    minCommitSeq?: CommitSeq;
    atCommitSeq?: CommitSeq;
    atTimestamp?: string;
    linearizable?: boolean;
  }

  model CanopyV0EntityCasPrecondition {
    entityId: string;
    expectedSeq: CommitSeq;
  }

  model CanopyV0WritePrecondition {
    mode: CanopyV0WriteConsistencyMode;
    expectedEntitySeq?: CanopyV0EntityCasPrecondition[];
    expectedGraphSeq?: CommitSeq;
  }

  @route("/v0/graphs")
  namespace Graphs {
    model CanopyV0GraphSummary {
      graphId: GraphId;
      name: string;
      headCommitSeq: CommitSeq;
      revision: string;
      nodeCount: int32;
      edgeCount: int32;
      createdAt: string;
      updatedAt: string;
    }

    model CanopyV0ListGraphsRequest {
      @query limit?: int32;
    }

    model CanopyV0ListGraphsResponse {
      graphs: CanopyV0GraphSummary[];
    }

    model CanopyV0CreateGraphRequest {
      graphId?: GraphId;
      name: string;
      provenance?: CanopyV0ActorProvenance;
    }

    model CanopyV0GetGraphRequest {
      @path graphId: GraphId;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0DeleteGraphRequest {
      @path graphId: GraphId;
      expectedGraphSeq?: CommitSeq;
    }

    model CanopyV0DeleteGraphResponse {
      graphId: GraphId;
      deleted: boolean;
    }

    @get
    op listGraphs(@query request: CanopyV0ListGraphsRequest): CanopyV0ListGraphsResponse;

    @post
    op createGraph(@body request: CanopyV0CreateGraphRequest): CanopyV0GraphSummary;

    @get
    @route("/{graphId}")
    op getGraph(request: CanopyV0GetGraphRequest): CanopyV0GraphSummary;

    @delete
    @route("/{graphId}")
    op deleteGraph(request: CanopyV0DeleteGraphRequest): CanopyV0DeleteGraphResponse;
  }

  @route("/v0/graphs/{graphId}/transactions")
  namespace Transactions {
    model CanopyV0BatchOperation {
      kind: CanopyV0BatchOperationKind;
      entityId?: string;
      shapeId?: ShapeId;
      sourceNodeId?: NodeId;
      targetNodeId?: NodeId;
      properties?: CanopyV0PropertyEntry[];
      migrationId?: MigrationId;
      fromShapeId?: ShapeId;
      toShapeId?: ShapeId;
      transformWasmRef?: string;
    }

    model CanopyV0CommitTransactionRequest {
      @path graphId: GraphId;
      batchId?: BatchId;
      provenance: CanopyV0ActorProvenance;
      precondition: CanopyV0WritePrecondition;
      operations: CanopyV0BatchOperation[];
    }

    model CanopyV0CommitTransactionResponse {
      graphId: GraphId;
      batchId: BatchId;
      commitSeq: CommitSeq;
      hlcTimestamp: HlcTimestamp;
      revision: string;
      committedEventIds: EventId[];
      affectedEntitySeqs: CanopyV0EntityCasPrecondition[];
      warnings: CanopyV0ValidationIssue[];
    }

    model CanopyV0DraftRecord {
      draftId: DraftId;
      graphId: GraphId;
      status: CanopyV0DraftStatus;
      baseCommitSeq: CommitSeq;
      parentRevision: string;
      stagedOperationCount: int32;
      createdAt: string;
      updatedAt: string;
    }

    model CanopyV0CreateDraftRequest {
      @path graphId: GraphId;
      draftId?: DraftId;
      provenance?: CanopyV0ActorProvenance;
    }

    model CanopyV0GetDraftRequest {
      @path graphId: GraphId;
      @path draftId: DraftId;
    }

    model CanopyV0StageDraftOperationsRequest {
      @path graphId: GraphId;
      @path draftId: DraftId;
      operations: CanopyV0BatchOperation[];
    }

    model CanopyV0CommitDraftRequest {
      @path graphId: GraphId;
      @path draftId: DraftId;
      provenance: CanopyV0ActorProvenance;
      precondition?: CanopyV0WritePrecondition;
    }

    model CanopyV0DiscardDraftRequest {
      @path graphId: GraphId;
      @path draftId: DraftId;
    }

    @post
    op commitTransaction(request: CanopyV0CommitTransactionRequest): CanopyV0CommitTransactionResponse;

    @post
    @route("/drafts")
    op createDraft(request: CanopyV0CreateDraftRequest): CanopyV0DraftRecord;

    @get
    @route("/drafts/{draftId}")
    op getDraft(request: CanopyV0GetDraftRequest): CanopyV0DraftRecord;

    @post
    @route("/drafts/{draftId}/operations")
    op stageDraftOperations(request: CanopyV0StageDraftOperationsRequest): CanopyV0DraftRecord;

    @post
    @route("/drafts/{draftId}/commit")
    op commitDraft(request: CanopyV0CommitDraftRequest): CanopyV0CommitTransactionResponse;

    @delete
    @route("/drafts/{draftId}")
    op discardDraft(request: CanopyV0DiscardDraftRequest): CanopyV0DraftRecord;
  }

  @route("/v0/graphs/{graphId}/queries")
  namespace Queries {
    model CanopyV0NodeRecord {
      nodeId: NodeId;
      shapeId?: ShapeId;
      entitySeq: CommitSeq;
      properties: CanopyV0PropertyEntry[];
      createdAt: string;
      updatedAt: string;
    }

    model CanopyV0EdgeRecord {
      edgeId: EdgeId;
      shapeId?: ShapeId;
      sourceNodeId: NodeId;
      targetNodeId: NodeId;
      entitySeq: CommitSeq;
      properties: CanopyV0PropertyEntry[];
    }

    model CanopyV0QueryNodesRequest {
      @path graphId: GraphId;
      nodeId?: NodeId;
      shapeId?: ShapeId;
      canonicalUri?: string;
      limit?: int32;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0QueryNodesResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      nodes: CanopyV0NodeRecord[];
    }

    model CanopyV0QueryEdgesRequest {
      @path graphId: GraphId;
      edgeId?: EdgeId;
      shapeId?: ShapeId;
      sourceNodeId?: NodeId;
      targetNodeId?: NodeId;
      direction?: CanopyV0Direction;
      limit?: int32;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0QueryEdgesResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      edges: CanopyV0EdgeRecord[];
    }

    model CanopyV0LookupPropertiesRequest {
      @path graphId: GraphId;
      entityId: string;
      propertyKey?: string;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0LookupPropertiesResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      entityId: string;
      properties: CanopyV0PropertyEntry[];
    }

    model CanopyV0TraverseGraphRequest {
      @path graphId: GraphId;
      startNodeIds: NodeId[];
      edgeShapeId?: ShapeId;
      direction?: CanopyV0Direction;
      maxDepth?: int32;
      maxCost?: int32;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0TraverseGraphResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      nodes: CanopyV0NodeRecord[];
      edges: CanopyV0EdgeRecord[];
    }

    model CanopyV0ExecuteStoredQueryRequest {
      @path graphId: GraphId;
      @path queryNodeId: NodeId;
      parametersJson?: string;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0ExecuteStoredQueryResponse {
      graphId: GraphId;
      queryNodeId: NodeId;
      appliedCommitSeq: CommitSeq;
      nodes: CanopyV0NodeRecord[];
      edges: CanopyV0EdgeRecord[];
    }

    model CanopyV0HistorySnapshotRequest {
      @path graphId: GraphId;
      @query atCommitSeq?: CommitSeq;
      @query atTimestamp?: string;
      @query atEventId?: EventId;
    }

    model CanopyV0HistorySnapshotResponse {
      graphId: GraphId;
      snapshotCommitSeq: CommitSeq;
      revision: string;
      nodes: CanopyV0NodeRecord[];
      edges: CanopyV0EdgeRecord[];
    }

    @post
    @route("/nodes")
    op queryNodes(request: CanopyV0QueryNodesRequest): CanopyV0QueryNodesResponse;

    @post
    @route("/edges")
    op queryEdges(request: CanopyV0QueryEdgesRequest): CanopyV0QueryEdgesResponse;

    @post
    @route("/properties")
    op lookupProperties(request: CanopyV0LookupPropertiesRequest): CanopyV0LookupPropertiesResponse;

    @post
    @route("/traverse")
    op traverseGraph(request: CanopyV0TraverseGraphRequest): CanopyV0TraverseGraphResponse;

    @post
    @route("/stored/{queryNodeId}")
    op executeStoredQuery(request: CanopyV0ExecuteStoredQueryRequest): CanopyV0ExecuteStoredQueryResponse;

    @get
    @route("/history/snapshot")
    op getHistorySnapshot(request: CanopyV0HistorySnapshotRequest): CanopyV0HistorySnapshotResponse;
  }

  @route("/v0/graphs/{graphId}/views")
  namespace Views {
    model CanopyV0RenderSelectorRecord {
      selectorEdgeId: EdgeId;
      viewNodeId: NodeId;
      context: string;
      priority: int32;
      isDefault: boolean;
      targetShapeId?: ShapeId;
      targetNodeId?: NodeId;
      targetQueryNodeId?: NodeId;
    }

    model CanopyV0ViewDefinitionRecord {
      viewNodeId: NodeId;
      name: string;
      layout: string;
      bindingKind: CanopyV0ViewBindingKind;
      queryNodeId?: NodeId;
      rendererPluginRef?: string;
      isHermetic: boolean;
    }

    model CanopyV0ResolveViewRequest {
      @path graphId: GraphId;
      viewNodeId?: NodeId;
      targetNodeId?: NodeId;
      targetShapeId?: ShapeId;
      queryNodeId?: NodeId;
      context?: string;
      maxDepth?: int32;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0ResolveViewResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      view: CanopyV0ViewDefinitionRecord;
      resolvedPathViewIds: NodeId[];
      cycleDetected: boolean;
      leafRenderer: string;
      nodes: CanopyV0NodeRecord[];
    }

    model CanopyV0GetViewDefinitionRequest {
      @path graphId: GraphId;
      @path viewNodeId: NodeId;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0ResolveSettingRequest {
      @path graphId: GraphId;
      key: string;
      nodeId?: NodeId;
      shapeId?: ShapeId;
      namespaceId?: NamespaceId;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0ResolveSettingResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      key: string;
      resolvedScope: CanopyV0SettingScope;
      valueJson?: string;
      found: boolean;
    }

    @post
    @route("/resolve")
    op resolveView(request: CanopyV0ResolveViewRequest): CanopyV0ResolveViewResponse;

    @get
    @route("/{viewNodeId}")
    op getViewDefinition(request: CanopyV0GetViewDefinitionRequest): CanopyV0ViewDefinitionRecord;

    @post
    @route("/settings/resolve")
    op resolveSetting(request: CanopyV0ResolveSettingRequest): CanopyV0ResolveSettingResponse;
  }

  @route("/v0/graphs/{graphId}/bundles")
  namespace Bundles {
    model CanopyV0PropertyConstraints {
      min?: float64;
      max?: float64;
      regex?: string;
      choices?: string[];
      unique?: boolean;
      targetShapeId?: ShapeId;
      nullable?: boolean;
    }

    model CanopyV0InlinePropertySpec {
      valueKind: CanopyV0PropertyValueKind;
      constraints?: CanopyV0PropertyConstraints;
      schemaOrgUri?: string;
    }

    model CanopyV0PropertyTypeRecord {
      propertyTypeId: PropertyTypeId;
      name: string;
      valueKind: CanopyV0PropertyValueKind;
      cardinality: CanopyV0PropertyCardinality;
      constraints?: CanopyV0PropertyConstraints;
      schemaOrgUri?: string;
    }

    model CanopyV0ShapePropertyBinding {
      key: string;
      propertyTypeId?: PropertyTypeId;
      required: boolean;
      cardinality?: CanopyV0PropertyCardinality;
      inline?: CanopyV0InlinePropertySpec;
    }

    model CanopyV0ShapeRecord {
      shapeId: ShapeId;
      name: string;
      entityKind: CanopyV0EntityKind;
      closed: boolean;
      properties: CanopyV0ShapePropertyBinding[];
      schemaOrgUri?: string;
    }

    model CanopyV0ShapeMigrationRecord {
      migrationId: MigrationId;
      fromShapeId: ShapeId;
      toShapeId: ShapeId;
      transformWasmRef: string;
      status: CanopyV0MigrationStatus;
      registeredCommitSeq: CommitSeq;
    }

    model CanopyV0RegisterShapeMigrationRequest {
      @path graphId: GraphId;
      migrationId?: MigrationId;
      fromShapeId: ShapeId;
      toShapeId: ShapeId;
      transformWasmRef: string;
      provenance: CanopyV0ActorProvenance;
    }

    model CanopyV0BundleManifestRecord {
      bundleId: BundleId;
      name: string;
      version: string;
      shapeIds: ShapeId[];
      queryNodeIds: NodeId[];
      viewNodeIds: NodeId[];
      pluginIds: NodeId[];
      activationKeyRequired: boolean;
    }

    model CanopyV0ListBundlesRequest {
      @path graphId: GraphId;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0ListBundlesResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      bundles: CanopyV0BundleManifestRecord[];
    }

    model CanopyV0InstallBundleRequest {
      @path graphId: GraphId;
      bundle: CanopyV0BundleManifestRecord;
      activationKey?: string;
      provenance: CanopyV0ActorProvenance;
      precondition?: CanopyV0WritePrecondition;
    }

    model CanopyV0InstallBundleResponse {
      graphId: GraphId;
      bundleId: BundleId;
      commitSeq: CommitSeq;
      installedNodeIds: NodeId[];
    }

    model CanopyV0GetSchemaRequest {
      @path graphId: GraphId;
      consistency?: CanopyV0ReadConsistency;
    }

    model CanopyV0GraphSchemaResponse {
      graphId: GraphId;
      appliedCommitSeq: CommitSeq;
      propertyTypes: CanopyV0PropertyTypeRecord[];
      shapes: CanopyV0ShapeRecord[];
      migrations: CanopyV0ShapeMigrationRecord[];
    }

    @get
    op listBundles(request: CanopyV0ListBundlesRequest): CanopyV0ListBundlesResponse;

    @post
    op installBundle(request: CanopyV0InstallBundleRequest): CanopyV0InstallBundleResponse;

    @get
    @route("/schema")
    op getSchema(request: CanopyV0GetSchemaRequest): CanopyV0GraphSchemaResponse;

    @post
    @route("/schema/migrations")
    op registerShapeMigration(request: CanopyV0RegisterShapeMigrationRequest): CanopyV0ShapeMigrationRecord;
  }

  @route("/v0/graphs/{graphId}/streams")
  namespace Streams {
    model CanopyV0StreamSubscribeRequest {
      @path graphId: GraphId;
      afterCommitSeq?: CommitSeq;
      bufferCapacity?: int32;
    }

    model CanopyV0StreamReplayRequest {
      @path graphId: GraphId;
      afterCommitSeq?: CommitSeq;
      lastSeenEventId?: EventId;
      maxReplayCount?: int32;
    }

    model CanopyV0StreamEnvelope {
      kind: CanopyV0StreamMessageKind;
      commitSeq?: CommitSeq;
      eventId?: EventId;
      eventJson?: string;
      gapCount?: int32;
      lastSeenEventId?: EventId;
      reason?: string;
    }

    model CanopyV0StreamReplayResponse {
      graphId: GraphId;
      headCommitSeq: CommitSeq;
      envelopes: CanopyV0StreamEnvelope[];
    }

    @post
    @route("/subscribe")
    op subscribeEvents(request: CanopyV0StreamSubscribeRequest): CanopyV0StreamReplayResponse;

    @post
    @route("/replay")
    op replayEvents(request: CanopyV0StreamReplayRequest): CanopyV0StreamReplayResponse;
  }

  @witPackage("canopy:graph")
  namespace Wit {
    @witInterface("graph-types")
    @witBody("""
    type node-id = string;
    type edge-id = string;
    type shape-id = string;
    type capability-token = string;

    enum error-code {
      validation-error,
      not-found,
      concurrency-conflict,
      permission-denied,
      resource-exhausted,
      internal-error,
    }

    record adapter-error {
      code: error-code,
      message: string,
      details: option<string>,
    }
    """)
    model WitGraphTypes {}

    @witInterface("host-queries")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    query-nodes: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    query-edges: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    lookup-properties: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    traverse-graph: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    """)
    model WitHostQueries {}

    @witInterface("host-mutations")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    create-node: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    update-node-properties: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    delete-node: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    create-edge: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    delete-edge: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    commit-batch: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    """)
    model WitHostMutations {}

    @witInterface("host-events")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    subscribe-events: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    replay-events: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
    """)
    model WitHostEvents {}

    @witInterface("host-filesystem")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    read-file: func(token: capability-token, directory-handle: string, relative-path: string) -> result<string, adapter-error>;
    write-file: func(token: capability-token, directory-handle: string, relative-path: string, contents: string) -> result<_, adapter-error>;
    list-directory: func(token: capability-token, directory-handle: string, relative-path: string) -> result<list<string>, adapter-error>;
    """)
    model WitHostFilesystem {}

    @witInterface("host-http")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    fetch: func(token: capability-token, request-json: string) -> result<string, adapter-error>;
    """)
    model WitHostHttp {}

    @witInterface("host-secrets")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    resolve-secret-handle: func(token: capability-token, handle: string) -> result<string, adapter-error>;
    """)
    model WitHostSecrets {}

    @witInterface("host-clock")
    @witBody("""
    use graph-types.{capability-token, adapter-error};

    now-epoch-ms: func(token: capability-token) -> result<u64, adapter-error>;
    schedule-tick: func(token: capability-token, schedule-json: string) -> result<string, adapter-error>;
    """)
    model WitHostClock {}

    @witInterface("draft-session")
    @witBody("""
    type node-id = string;
    type event-id = string;
    type shape-id = string;

    record property-entry {
      name: string,
      value: property-value,
    }

    variant property-value {
      text(string),
      integer(s64),
      decimal(f64),
      boolean(bool),
      date-time(string),
      node-id(string),
      list-of-text(list<string>),
      none,
    }

    record node-created-event {
      event-id: event-id,
      id: node-id,
      shape-id: option<shape-id>,
      properties: list<property-entry>,
      timestamp: string,
      device-id: string,
      batch-id: option<string>,
    }

    record node-properties-updated-event {
      event-id: event-id,
      id: node-id,
      changes: list<property-entry>,
      timestamp: string,
      device-id: string,
      batch-id: option<string>,
    }

    variant draft-event {
      node-created(node-created-event),
      node-properties-updated(node-properties-updated-event),
    }

    record graph-node {
      id: node-id,
      shape-id: option<shape-id>,
      properties: list<property-entry>,
    }

    enum draft-error {
      parent-not-found,
      unauthorized,
      invalid-event-format,
      validation-failure,
      concurrent-modification,
      storage-error,
    }

    enum query-error {
      invalid-query,
      node-not-found,
      access-denied,
    }

    resource draft-session-handle {
      apply-events: func(events: list<draft-event>) -> result<_, draft-error>;
      get-parent-revision: func() -> result<string, draft-error>;
      get-node: func(id: node-id) -> result<graph-node, query-error>;
      query-nodes: func(query-string: string) -> result<list<graph-node>, query-error>;
    }
    """)
    model WitDraftSession {}

    @witInterface("plugin-manifest")
    @witBody("""
    record menu-item {
      label: string,
      command: string,
      shortcut: option<string>,
    }

    record command-contribution {
      id: string,
      title: string,
      category: option<string>,
    }

    record plugin-manifest {
      name: string,
      version: string,
      description: option<string>,
      capabilities: list<string>,
      menu-items: list<menu-item>,
      commands: list<command-contribution>,
    }
    """)
    model WitPluginManifest {}

    @witInterface("plugin-lifecycle")
    @witBody("""
    use plugin-manifest.{plugin-manifest};

    get-manifest: func() -> plugin-manifest;
    initialize: func() -> result<_, string>;
    shutdown: func() -> result<_, string>;
    """)
    model WitPluginLifecycle {}

    @witInterface("content-rendering")
    @witBody("""
    record render-output {
      html: string,
    }

    render: func(properties-json: string) -> result<render-output, string>;
    """)
    model WitContentRendering {}

    @witInterface("wizard-execution")
    @witBody("""
    use draft-session.{draft-session-handle, draft-event, property-value};

    enum field-kind {
      text,
      number,
      boolean,
      date,
      node-reference,
    }

    record field-definition {
      name: string,
      label: string,
      kind: field-kind,
      required: bool,
      default-value: option<property-value>,
      options: option<list<string>>,
    }

    record form-schema {
      title: string,
      description: option<string>,
      fields: list<field-definition>,
      submit-label: string,
    }

    record input-entry {
      field-name: string,
      value: property-value,
    }

    variant step-destination {
      form(form-schema),
      complete,
      cancel,
    }

    record step-result {
      next-step: step-destination,
      events-to-stage: list<draft-event>,
    }

    resource wizard-session {
      constructor(draft: draft-session-handle);
      render-step-schema: func() -> result<form-schema, string>;
      handle-step-submission: func(inputs: list<input-entry>) -> result<step-result, string>;
    }
    """)
    model WitWizardExecution {}

    @witWorld("graph-plugin")
    @witBody("""
    use graph-types.{adapter-error};

    import host-queries;
    import host-mutations;
    import host-events;

    export execute: func(input-json: string) -> result<string, adapter-error>;
    """)
    model WitGraphPlugin {}

    @witWorld("server-extension-plugin")
    @witBody("""
    use graph-types.{adapter-error};

    import host-queries;
    import host-mutations;
    import host-events;
    import host-filesystem;
    import host-http;
    import host-secrets;
    import host-clock;

    export plugin-lifecycle;
    export execute: func(input-json: string) -> result<string, adapter-error>;
    """)
    model WitServerExtensionPlugin {}

    @witWorld("wizard-plugin")
    @witBody("""
    import draft-session;

    export plugin-lifecycle;
    export wizard-execution;
    """)
    model WitWizardPlugin {}

    @witWorld("render-plugin")
    @witBody("""
    export plugin-lifecycle;
    export content-rendering;
    """)
    model WitRenderPlugin {}
  }
}
