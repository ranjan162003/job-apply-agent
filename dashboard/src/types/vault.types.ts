// Mirrors backend/app/schemas/profile_schemas.py, resume_schemas.py and pairing_schemas.py.
import type { ProviderId } from "./provider.types";

export type FieldType = "text" | "email" | "tel" | "url" | "number" | "date" | "textarea" | "select" | "yes_no";

export interface ProfileField {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  never_ai: boolean;
  default: string | null;
  help: string | null;
  value: string | null;
}

export interface ProfileSection {
  id: string;
  title: string;
  description: string | null;
  fields: ProfileField[];
}

export interface Experience {
  title: string;
  company: string;
  location: string;
  start_date: string; // YYYY-MM
  end_date: string;
  is_current: boolean;
  description: string;
}

export interface Education {
  school: string;
  degree: string;
  field_of_study: string;
  start_year: string;
  end_year: string;
  grade: string;
}

export interface Profile {
  sections: ProfileSection[];
  experiences: (Experience & { id: number })[];
  educations: (Education & { id: number })[];
  completeness: { percent: number; missing: string[] };
}

export interface Resume {
  id: number;
  name: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  is_default: boolean;
  created_at: string;
  text_characters: number;
}

export interface FieldSuggestion {
  key: string;
  label: string;
  section_title: string;
  current_value: string | null;
  suggested_value: string;
  source: "pattern" | "ai";
  is_change: boolean;
}

export interface ImportPreview {
  resume_id: number;
  used_ai: boolean;
  fields: FieldSuggestion[];
  experiences: Experience[];
  educations: Education[];
  note: string | null;
}

export interface ImportRequest {
  provider_id: ProviderId | null;
  model_name: string | null;
}

export interface PairingStatus {
  is_paired: boolean;
  paired_at: string | null;
}

export interface PairingCode {
  token: string;
  paired_at: string;
}
