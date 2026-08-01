## ADDED Requirements

### Requirement: Storage Replay Load Benchmarking

Storage adapters (`@canopy/storage-sqlite` and `@canopy/storage-indexeddb`) MUST maintain high event ingestion throughput and low retrieval latency under load up to 50,000 events.

#### Scenario: 50k Event Log Append and Replay Retrieval
- **Given** an initialized `EventLogStore` persistent store
- **When** 50,000 synthetic graph events are appended in batch chunks and retrieved
- **Then** total append duration completes within 10,000ms and full event replay retrieval completes within 5,000ms.
