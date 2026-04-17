import type { FormField } from "./forms.js";

export interface OpenWebsiteResult {
  success: true;
  url: string;
  title: string;
}

export interface PageInfo {
  title: string;
  url: string;
  buttons: string[];
  links: string[];
}

export interface ClickResult {
  success: boolean;
  message: string;
}

export interface FillResult {
  success: boolean;
  message: string;
  details: Record<string, unknown> | null;
}

export interface FormInspectionResult {
  success: boolean;
  message: string;
  fields: FormField[];
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  shouldExit?: boolean;
  data?: unknown;
  fields?: FormField[];
}
