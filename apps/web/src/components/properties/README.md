# Property components

## Overview

This directory provides stateless React components for rendering (`PropertyDisplay`) and editing (`PropertyInput`) `PropertyValue` scalars and lists from `@canopy/graph`. Both components infer basic types (`boolean`, `number`, `external-reference`, `text`) from runtime values and require an explicit `kind` prop for string-based branded types (`instant`, `plain-date`, `reference`).

## Interface

- `[property-display.tsx:PropertyDisplay]` `React.FC<PropertyDisplayProperties>` accepting `readonly value: PropertyValue`, `className?: string`, `kind?: PropertyValueKind`.
- `[property-input.tsx:PropertyInput]` `React.FC<PropertyInputProperties>` accepting `readonly value: PropertyValue`, `className?: string | undefined`, `kind?: PropertyValueKind | undefined`, `onChange: (value: PropertyValue) => unknown`.

## Invariants

- `[property-display.tsx:PropertyDisplay]` Non-scalar (array) values strip `kind === 'list'` before delegating each item to `ScalarDisplay`.
- `[property-display.tsx:ScalarDisplay]` Renders `'null'` span immediately when `value === null`; returns `null` when `inferredKind === 'list'`.
- `[property-display.tsx:ScalarDisplay]` When `inferredKind === 'external-reference'`, requires `typeof value === 'object' && 'graph' in value && 'target' in value`, otherwise renders `'Invalid ExtRef'`.
- `[property-display.tsx:inferKind]` Without explicit `kind`, infers only `'boolean'`, `'number'`, `'external-reference'` (`object !== null` with `'graph'`), or `'text'`.
- `[property-input.tsx:PropertyInputProperties]` All fields on `PropertyInputData` and `PropertyInputEvents` are `readonly`.
- `[property-input.tsx:PropertyInput]` List item updates, removals, and additions produce new arrays (`[...value]`, `value.filter`, `[...value, newItem]`) passed to `onChange` without mutating the input `value` prop; strips `kind === 'list'` for item `ScalarInput`.
- `[property-input.tsx:ScalarInput]` Returns `null` when `activeKind === 'list'`; wraps edited values with `asInstant`, `asPlainDate`, `asNodeId`, and `asGraphId` when `activeKind` matches those branded types.
- `[property-input.tsx:inferKind]` Without explicit `kind`, infers only `'boolean'`, `'number'`, `'external-reference'` (`object !== null` with `'graph'`), or `'text'`.

## Side Effects

- `[property-input.tsx:PropertyInput]` Calls `props.onChange` when a list item is edited, removed, or added.
- `[property-input.tsx:getDefaultItem]` Reads current wall-clock time via `Temporal.Now.instant()` and `Temporal.Now.plainDateISO()` when generating default items for `'instant'` and `'plain-date'` list additions.
- `[property-input.tsx:ScalarInput]` Calls `props.onChange` on DOM input/checkbox change events.

## Verification

- Run: `bun test`
