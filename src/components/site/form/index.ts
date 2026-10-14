// Form primitives (DESIGN §3.16). Server-compatible: no hooks, native props spread
// through, `ref` accepted as a prop (React 19), so PR-2's client forms can use them.
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Field, type FieldProps } from "./Field";
export { FieldError, describedBy, fieldErrorId, type FieldErrorProps } from "./FieldError";
export { FileInput, type FileInputProps } from "./FileInput";
export { FormCard, formStackClasses, type FormCardBar, type FormCardProps } from "./FormCard";
export { Input, controlClasses, invalidClasses, type InputProps } from "./Input";
export { Label, type LabelProps } from "./Label";
export { Select, type SelectProps } from "./Select";
export { Textarea, type TextareaProps } from "./Textarea";
