# property-constraints Specification

## ADDED Requirements

### Requirement: Cardinality constraint validation

The system SHALL enforce property cardinality constraints (`cardinality: 'one' | 'many'`) during node and property-type validation. When `cardinality` is `'one'` (or omitted for scalar property kinds), property values MUST be a single scalar value. When `cardinality` is `'many'` (or when `valueKind` is `'list'`), property values MUST be an array of scalar values.

#### Scenario: Cardinality one accepts single scalar value

- **WHEN** a property definition has `cardinality: "one"` and a single scalar value is provided
- **THEN** property validation SHALL succeed

#### Scenario: Cardinality one rejects array value

- **WHEN** a property definition has `cardinality: "one"` and an array value is provided
- **THEN** property validation SHALL fail with a `ValidationError` specifying expected cardinality 'one'

#### Scenario: Cardinality many accepts array of scalar values

- **WHEN** a property definition has `cardinality: "many"` and an array of valid scalar values is provided
- **THEN** property validation SHALL succeed

#### Scenario: Cardinality many rejects single scalar value

- **WHEN** a property definition has `cardinality: "many"` and a non-array scalar value is provided
- **THEN** property validation SHALL fail with a `ValidationError` specifying expected cardinality 'many'

### Requirement: Closed-values enum constraint validation

The system SHALL enforce allowed-value restrictions (`choices?: readonly string[]`) during node and property-type validation for `text`, `number`, `plain-date`, `instant`, and `reference` property kinds (including element-wise validation when `cardinality` is `'many'`).

#### Scenario: Value matching defined choices succeeds

- **WHEN** a property value matches one of the values defined in `choices`
- **THEN** property validation SHALL succeed

#### Scenario: Value not in defined choices fails

- **WHEN** a property value does not match any value defined in `choices`
- **THEN** property validation SHALL fail with a `ValidationError` listing the allowed choices and actual value

#### Scenario: Array elements for cardinality many are validated against choices

- **WHEN** a property has `cardinality: "many"` with `choices` specified and one array element is not in `choices`
- **THEN** property validation SHALL fail identifying the specific invalid array index and actual value

### Requirement: Typed-reference target-type validation

The system SHALL enforce target node type restrictions (`targetTypeId?: TypeId`) during graph-aware node validation when `valueKind` is `'reference'`. When specified, the referenced target `NodeId` MUST resolve to an existing node in the `Graph` whose `type` matches `targetTypeId`.

#### Scenario: Reference targeting a node with matching type succeeds

- **WHEN** a reference property targets a node ID present in the graph whose `type` equals `targetTypeId`
- **THEN** property validation SHALL succeed

#### Scenario: Reference targeting a node with mismatched type fails

- **WHEN** a reference property targets a node ID present in the graph whose `type` does NOT equal `targetTypeId`
- **THEN** property validation SHALL fail with a `ValidationError` specifying expected target node type vs actual target node type

#### Scenario: Reference targeting a non-existent node fails

- **WHEN** a reference property targets a node ID that is NOT present in the graph
- **THEN** property validation SHALL fail with a `ValidationError` indicating the target node was not found in the graph
