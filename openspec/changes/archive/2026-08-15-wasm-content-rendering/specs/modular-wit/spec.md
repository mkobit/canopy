## ADDED Requirements

### Requirement: Content-rendering WIT interface and render-plugin world

The WIT package SHALL define a `content-rendering` interface exposing a render operation that maps content-node input to an HTML render output result, and a `render-plugin` world that exports `plugin-lifecycle` and `content-rendering`, so a rendering guest can be componentized by the existing pipeline.

#### Scenario: Render-plugin world componentizes

- **WHEN** the pipeline builds a guest configured for the `render-plugin` world
- **THEN** codegen and componentization SHALL succeed and produce a plugin exporting lifecycle and the render operation

#### Scenario: Render output is a fallible result

- **WHEN** the `content-rendering` render operation is defined
- **THEN** it SHALL return a result type carrying either render output or an error string, so host execution can distinguish success from failure without exceptions
