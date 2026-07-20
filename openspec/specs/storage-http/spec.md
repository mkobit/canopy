# storage-http Specification

## Purpose

TBD - created by archiving change event-log-storage-http. Update Purpose after archive.

## Requirements

### Requirement: Persist graph events over HTTP

The system SHALL support appending graph events to a remote server using HTTP POST requests.

#### Scenario: Appending events

- **WHEN** the storage client appends events for a given graph
- **THEN** it SHALL send an HTTP POST request to `${baseUrl}/graphs/${graphId}/events` with the serialized events in the request body.

### Requirement: Query graph events over HTTP

The system SHALL support querying graph events from a remote server using HTTP GET requests with query options.

#### Scenario: Querying events with parameters

- **WHEN** the storage client queries events with query options (after, before, limit, reverse)
- **THEN** it SHALL send an HTTP GET request to `${baseUrl}/graphs/${graphId}/events` with the options mapped to query parameters.
- **AND** it SHALL deserialize the response JSON back into graph events.
