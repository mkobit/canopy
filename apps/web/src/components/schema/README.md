# Schema components

## Overview

This directory implements five React components for schema creation forms (namespaces, property types, node types, and edge types) and a controlled property list editor for inline and referenced property definitions.

## Interface

- `[edge-type-create-form.tsx:EdgeTypeCreateFormProperties]` Interface with `readonly` `namespace`, `propertyTypeOptions`, `nodeTypeOptions`, and `onSubmit` returning `Promise<Result<NodeId, Error>>`.
- `[edge-type-create-form.tsx:EdgeTypeCreateForm]` `React.FC<EdgeTypeCreateFormProperties>` form component for creating `EdgeType` definitions.
- `[namespace-create-form.tsx:NamespaceCreateFormProperties]` Interface with `readonly` `existingKinds` and `onSubmit` returning `Promise<Result<NodeId, Error>>`.
- `[namespace-create-form.tsx:NamespaceCreateForm]` `React.FC<NamespaceCreateFormProperties>` form component for creating `Namespace` definitions.
- `[node-type-create-form.tsx:NodeTypeCreateFormProperties]` Interface with `readonly` `namespace`, `propertyTypeOptions`, and `onSubmit` returning `Promise<Result<NodeId, Error>>`.
- `[node-type-create-form.tsx:NodeTypeCreateForm]` `React.FC<NodeTypeCreateFormProperties>` form component for creating `NodeType` definitions.
- `[property-list-editor.tsx:PropertyListEditorProperties]` Interface with `readonly` `value` (`readonly TypePropertyInput[]`), `onChange`, and `propertyTypeOptions`.
- `[property-list-editor.tsx:PropertyListEditor]` `React.FC<PropertyListEditorProperties>` controlled editor for inline and reference `TypePropertyInput` items.
- `[property-type-create-form.tsx:PropertyTypeCreateFormProperties]` Interface with `readonly` `namespace` and `onSubmit` returning `Promise<Result<NodeId, Error>>`.
- `[property-type-create-form.tsx:PropertyTypeCreateForm]` `React.FC<PropertyTypeCreateFormProperties>` form component for creating `PropertyType` definitions.

## Invariants

- All exported form and editor prop interfaces declare every field `readonly`.
- `[edge-type-create-form.tsx:EdgeTypeCreateForm]` Submit button is disabled when `isSubmitting || !name`; `description`, `sourceTypes`, and `targetTypes` are omitted from the `onSubmit` payload when empty.
- `[namespace-create-form.tsx:NamespaceCreateForm]` `resolvedKind` resolves to `customKind` when `kind === CUSTOM_KIND` (`'__custom__'`); submit button is disabled when `isSubmitting || !name || !resolvedKind`; `description` is omitted when empty.
- `[node-type-create-form.tsx:NodeTypeCreateForm]` Submit button is disabled when `isSubmitting || !name`; `description` is omitted when empty.
- `[property-type-create-form.tsx:PropertyTypeCreateForm]` `valueKind` defaults to `'text'` and only updates when `PropertyValueKindSchema.safeParse` succeeds; submit button is disabled when `isSubmitting || !name`; `description` is omitted when empty.
- `[property-list-editor.tsx:PropertyListEditor]` `updateAt` and `removeAt` produce new arrays without mutating `value`; `addReference` is a no-op and its button is disabled when `propertyTypeOptions.length === 0`; inline `valueKind` only updates on `PropertyValueKindSchema.safeParse` success; reference `propertyTypeId` only updates when a matching option exists.

## Side Effects

- `[edge-type-create-form.tsx:EdgeTypeCreateForm]`, `[namespace-create-form.tsx:NamespaceCreateForm]`, `[node-type-create-form.tsx:NodeTypeCreateForm]`, `[property-type-create-form.tsx:PropertyTypeCreateForm]` Invoke `onSubmit(input)` on form submit, update local React state (`isSubmitting`, `error`, and reset fields on `result.ok`), and log unhandled `handleSubmit` rejections via `.catch(console.error)`.
- `[property-list-editor.tsx:PropertyListEditor]` Invokes `onChange(next)` on row addition, modification, or removal; no direct I/O or console side effects.

## Verification

- Run: `bun test`
