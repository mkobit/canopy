// eslint-disable-next-line unicorn/name-replacements -- "proto" here means Protocol Buffers, not JS prototype; renaming would also require updating imports in files outside this batch
export const PROTO_SERVICES_SDL = `
syntax = "proto3";

package canopy.api.v1;

enum ActorType {
  ACTOR_TYPE_UNSPECIFIED = 0;
  ACTOR_TYPE_USER = 1;
  ACTOR_TYPE_AGENT = 2;
  ACTOR_TYPE_PLUGIN = 3;
  ACTOR_TYPE_WORKFLOW = 4;
  ACTOR_TYPE_SYSTEM = 5;
}

enum ApprovalState {
  APPROVAL_STATE_UNSPECIFIED = 0;
  APPROVAL_STATE_DIRECT_USER = 1;
  APPROVAL_STATE_APPROVED = 2;
  APPROVAL_STATE_PENDING_APPROVAL = 3;
  APPROVAL_STATE_SYSTEM_PERMITTED = 4;
}

message ActorContextRequest {
  string acting_id = 1;
  ActorType actor_type = 2;
  string delegation_token = 3;
}

message GetNodeByIdRequest {
  string id = 1;
  ActorContextRequest actor = 2;
}

message GetNodesByTypeRequest {
  string type_id = 1;
  ActorContextRequest actor = 2;
}

message GetNodesByPropertyRequest {
  string key = 1;
  string value_json = 2;
  ActorContextRequest actor = 3;
}

message NodeResponse {
  bool success = 1;
  string id = 2;
  string type_id = 3;
  string properties_json = 4;
  string created_at = 5;
  string updated_at = 6;
  string error_code = 7;
  string error_message = 8;
}

message NodeListResponse {
  bool success = 1;
  repeated NodeResponse nodes = 2;
  string error_code = 3;
  string error_message = 4;
}

message GetInboundEdgesRequest {
  string target_node_id = 1;
  string predicate_type_id = 2;
  ActorContextRequest actor = 3;
}

message GetOutboundEdgesRequest {
  string source_node_id = 1;
  string predicate_type_id = 2;
  ActorContextRequest actor = 3;
}

message EdgeResponse {
  bool success = 1;
  string id = 2;
  string source_node_id = 3;
  string target_node_id = 4;
  string predicate_type_id = 5;
  string properties_json = 6;
  string error_code = 7;
  string error_message = 8;
}

message EdgeListResponse {
  bool success = 1;
  repeated EdgeResponse edges = 2;
  string error_code = 3;
  string error_message = 4;
}

message ExecuteTraversalQueryRequest {
  string start_node_id = 1;
  int32 max_depth = 2;
  repeated string filter_predicate_type_ids = 3;
  ActorContextRequest actor = 4;
}

message TraversalStepResponse {
  string node_id = 1;
  int32 depth = 2;
  string matched_via_edge_id = 3;
}

message TraversalResponse {
  bool success = 1;
  repeated TraversalStepResponse steps = 2;
  string error_code = 3;
  string error_message = 4;
}

message CreateNodeRequest {
  string type_id = 1;
  string properties_json = 2;
  string expected_sequence = 3;
  ActorContextRequest actor = 4;
}

message UpdatePropertiesRequest {
  string id = 1;
  string properties_json = 2;
  string expected_sequence = 3;
  ActorContextRequest actor = 4;
}

message DeleteNodeRequest {
  string id = 1;
  string expected_sequence = 2;
  ActorContextRequest actor = 3;
}

message CreateEdgeRequest {
  string source_node_id = 1;
  string target_node_id = 2;
  string predicate_type_id = 3;
  string properties_json = 4;
  string expected_sequence = 5;
  ActorContextRequest actor = 6;
}

message DeleteEdgeRequest {
  string id = 1;
  string expected_sequence = 2;
  ActorContextRequest actor = 3;
}

message MutationResultResponse {
  bool success = 1;
  string entity_id = 2;
  int64 sequence_number = 3;
  string committed_at = 4;
  string error_code = 5;
  string error_message = 6;
}

message EventStreamRequest {
  string last_seen_event_id = 1;
  ActorContextRequest actor = 2;
}

message EventStreamItem {
  string event_id = 1;
  string event_type = 2;
  string payload_json = 3;
  int64 sequence_number = 4;
  string timestamp = 5;
}

service NodeService {
  rpc GetNodeById(GetNodeByIdRequest) returns (NodeResponse);
  rpc GetNodesByType(GetNodesByTypeRequest) returns (NodeListResponse);
  rpc GetNodesByProperty(GetNodesByPropertyRequest) returns (NodeListResponse);
}

service EdgeService {
  rpc GetInboundEdges(GetInboundEdgesRequest) returns (EdgeListResponse);
  rpc GetOutboundEdges(GetOutboundEdgesRequest) returns (EdgeListResponse);
}

service PropertyService {
  rpc ExecuteTraversalQuery(ExecuteTraversalQueryRequest) returns (TraversalResponse);
}

service GraphMutationService {
  rpc CreateNode(CreateNodeRequest) returns (MutationResultResponse);
  rpc UpdateNodeProperties(UpdatePropertiesRequest) returns (MutationResultResponse);
  rpc DeleteNode(DeleteNodeRequest) returns (MutationResultResponse);
  rpc CreateEdge(CreateEdgeRequest) returns (MutationResultResponse);
  rpc DeleteEdge(DeleteEdgeRequest) returns (MutationResultResponse);
}

service EventStreamService {
  rpc SubscribeEventStream(EventStreamRequest) returns (stream EventStreamItem);
  rpc ReplayEventStream(EventStreamRequest) returns (stream EventStreamItem);
}
`;
