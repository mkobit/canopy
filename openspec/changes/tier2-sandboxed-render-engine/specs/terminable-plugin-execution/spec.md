## ADDED Requirements

### Requirement: Worker-isolated guest execution

The system SHALL provide an execution path that runs a sandboxed guest plugin inside a Web Worker separated from the host main thread, such that a guest whose exported function performs unbounded synchronous computation cannot block host rendering or input handling.

#### Scenario: Untrusted guest runs off the main thread

- **WHEN** the host executes a guest whose granted capabilities are not fully trusted
- **THEN** the guest's component instantiation and export invocation SHALL run inside a Web Worker
- **AND** the host main thread SHALL remain responsive while the guest executes

#### Scenario: Existing executor guards are preserved inside the worker

- **WHEN** a guest executes under the worker-isolated path
- **THEN** the fuel, timeout, and reentrancy guards of `executeSandboxedGuestPlugin` SHALL still apply inside the worker
- **AND** the worker transport SHALL NOT redefine or weaken those guards

#### Scenario: Guest linear memory is hard-capped

- **WHEN** a guest executes under the worker-isolated path
- **THEN** the guest's WebAssembly linear memory SHALL be instantiated with a hard `maximum` ceiling
- **AND** a guest that grows memory toward that ceiling SHALL be bounded by it rather than allowed to allocate until the tab is out of memory

#### Scenario: Guest cannot spawn surviving nested workers

- **WHEN** a guest runs inside the worker
- **THEN** the worker environment SHALL NOT expose the `Worker` constructor
- **AND** a guest SHALL NOT be able to spawn a nested worker that outlives termination of its host worker

#### Scenario: Host imports cross the worker boundary safely

- **WHEN** a guest running in the worker invokes a host binding
- **THEN** the call SHALL be marshaled to the main thread and awaited via the existing `Promise`-returning host bindings
- **AND** the capability token check SHALL be enforced on the main thread against the bound effective token

### Requirement: Host-enforced wall-clock termination

The system SHALL enforce a wall-clock execution deadline that the host can act on independently of the guest yielding, terminating the worker when the deadline is exceeded so a synchronous-runaway guest is stopped rather than merely timed out on a promise the guest never resolves.

#### Scenario: Synchronous-runaway guest is terminated

- **WHEN** a guest exceeds its wall-clock deadline without yielding
- **THEN** the host SHALL `terminate()` the worker
- **AND** the execution SHALL resolve as a non-fatal timeout error, not a hang

#### Scenario: Terminated execution surfaces a bounded error

- **WHEN** a worker is terminated for exceeding its deadline
- **THEN** the caller SHALL receive a `Result` error describing the timeout
- **AND** the host SHALL render a fallback representation rather than throwing or mounting partial output

#### Scenario: Terminated worker leaves no reusable poisoned state

- **WHEN** a worker is terminated mid-execution
- **THEN** a subsequent execution SHALL use a fresh or pool-recycled worker whose state is not derived from the terminated run
