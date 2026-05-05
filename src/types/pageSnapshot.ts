import type { FormField } from "./forms.js";

export interface SnapshotOption {
  label: string;
  selected: boolean;
}

export interface SnapshotOptionGroup {
  groupLabel: string;
  options: SnapshotOption[];
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
