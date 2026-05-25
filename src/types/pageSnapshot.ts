import type { FormField } from "./forms.js";

export interface SnapshotOption {
  label: string;
  selected: boolean;
}

export type OptionGroupKind = "radio" | "select" | "plan-card";

export interface SnapshotOptionGroup {
  groupLabel: string;
  options: SnapshotOption[];
  /** How this group is rendered in the DOM. Used by agentTools to pick the right click strategy. */
  kind?: OptionGroupKind;
}

export interface SnapshotButton {
  label: string;
  isRisky: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  optionGroups: SnapshotOptionGroup[];
  inputs: FormField[];
  primaryButtons: SnapshotButton[];
  inlineErrors: string[];
}
