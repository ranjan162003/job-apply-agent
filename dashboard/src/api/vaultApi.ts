import type {
  Education,
  Experience,
  ImportPreview,
  ImportRequest,
  PairingCode,
  PairingStatus,
  Profile,
  Resume,
} from "../types/vault.types";
import { requestJson } from "./httpClient";

export const profileApi = {
  get: () => requestJson<Profile>("/api/profile"),
  update: (values: Record<string, string | null>) =>
    requestJson<Profile>("/api/profile", { method: "PATCH", body: JSON.stringify({ values }) }),
  saveExperiences: (experiences: Experience[]) =>
    requestJson<Profile["experiences"]>("/api/profile/experiences", { method: "PUT", body: JSON.stringify({ experiences }) }),
  saveEducations: (educations: Education[]) =>
    requestJson<Profile["educations"]>("/api/profile/educations", { method: "PUT", body: JSON.stringify({ educations }) }),
};

export const resumeApi = {
  list: () => requestJson<Resume[]>("/api/resumes"),
  upload: (file: File, name?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    return requestJson<Resume>("/api/resumes", { method: "POST", body: form });
  },
  rename: (id: number, name: string) =>
    requestJson<Resume>(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  makeDefault: (id: number) =>
    requestJson<Resume>(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }),
  remove: (id: number) => requestJson<void>(`/api/resumes/${id}`, { method: "DELETE" }),
  fileUrl: (id: number) => `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/resumes/${id}/file`,
  previewImport: (id: number, request: ImportRequest) =>
    requestJson<ImportPreview>(`/api/resumes/${id}/import-preview`, { method: "POST", body: JSON.stringify(request) }),
  applyImport: (body: { values: Record<string, string>; experiences?: Experience[]; educations?: Education[] }) =>
    requestJson<void>("/api/resumes/import-apply", { method: "POST", body: JSON.stringify(body) }),
};

export const pairingApi = {
  status: () => requestJson<PairingStatus>("/api/pairing"),
  create: () => requestJson<PairingCode>("/api/pairing", { method: "POST" }),
  revoke: () => requestJson<void>("/api/pairing", { method: "DELETE" }),
};
