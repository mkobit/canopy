/** @module Interface canopy:graph/wizard-execution **/
export type DraftSessionHandle = import('./canopy-graph-draft-session.js').DraftSessionHandle;
export type DraftEvent = import('./canopy-graph-draft-session.js').DraftEvent;
export type PropertyValue = import('./canopy-graph-draft-session.js').PropertyValue;
/**
 * # Variants
 * 
 * ## `"text"`
 * 
 * ## `"number"`
 * 
 * ## `"boolean"`
 * 
 * ## `"date"`
 * 
 * ## `"node-reference"`
 */
export type FieldKind = 'text' | 'number' | 'boolean' | 'date' | 'node-reference';
export interface FieldDefinition {
  name: string,
  label: string,
  kind: FieldKind,
  required: boolean,
  defaultValue?: PropertyValue,
  options?: Array<string>,
}
export interface FormSchema {
  title: string,
  description?: string,
  fields: Array<FieldDefinition>,
  submitLabel: string,
}
export interface InputEntry {
  fieldName: string,
  value: PropertyValue,
}
export type StepDestination = StepDestinationForm | StepDestinationComplete | StepDestinationCancel;
export interface StepDestinationForm {
  tag: 'form',
  val: FormSchema,
}
export interface StepDestinationComplete {
  tag: 'complete',
}
export interface StepDestinationCancel {
  tag: 'cancel',
}
export interface StepResult {
  nextStep: StepDestination,
  eventsToStage: Array<DraftEvent>,
}

export class WizardSession {
  constructor(draft: DraftSessionHandle)
  renderStepSchema(): FormSchema;
  handleStepSubmission(inputs: Array<InputEntry>): StepResult;
}
