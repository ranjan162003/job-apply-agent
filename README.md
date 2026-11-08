# Apply Copilot: Job Apply Agent

A Chrome/Edge extension and a local AI backend that fill job application forms for you. Save your
details once in a **profile vault** on your own computer; Apply Copilot reads each application form
(Greenhouse, Lever, Ashby, Workday, Naukri or any careers page), fills what it's sure of, drafts the
long answers for you to review, and leaves the rest to you. **You always press Submit yourself.**

> Status: **v0.1 (in progress)**. The profile vault, resume import, and an extension that lists every
> field on an application form are done. Filling the fields comes next (see [Roadmap](#roadmap)).

## Features (v0.1)

- **Profile vault:** contact, links, current work, preferences, salary, work authorisation,
  education, diversity answers, plus your work experience and education history. Stored in a local
  SQLite file; nothing is synced anywhere.
- **"Only you" fields:** salary, work authorisation, criminal record and diversity questions are
  never read from a resume or written by the AI. Diversity answers default to "Prefer not to say".
- **Resume import:** upload a PDF or DOCX, and Apply Copilot suggests profile values for you to tick
  before anything is saved.
  - Email, phone number and LinkedIn/GitHub/LeetCode links are found with exact patterns, offline
    (including links hidden behind icons in the PDF).
  - Names, job titles, experience and education are read by the AI model you choose.
- **Several resumes:** keep one per kind of role, and pick a default.
- **Browser extension (side panel):** lists every field on the page in every frame, with its
  label, type, options, and whether it's required or already filled. Click a field to jump to it.
  - It works on the main applicant tracking systems out of the box. For any other site, it asks
    for access first.
- **Pairing:** the extension needs a code from the dashboard before it can read your profile.
- **Agent connectors:** Claude, Gemini or local Ollama (private: nothing leaves your machine).

## How it fits together

```
Chrome extension (side panel + content script)  ──token──▶  FastAPI backend on 127.0.0.1:8010  ◀──  React dashboard (:5174)
                                                                     │
                                                                     ├── SQLite: profile, resumes, settings
                                                                     └── LLM providers: Claude · Gemini · Ollama
```

## Repo layout

| Folder | What's inside |
|---|---|
| [`backend/`](backend/) | Python 3.10+ · FastAPI · SQLAlchemy (SQLite) · pypdf / python-docx · LLM provider layer |
| [`dashboard/`](dashboard/) | React 18 · TypeScript · Vite: Profile, Resumes, Extension pairing, Agent connectors |
| [`extension/`](extension/) | Chrome MV3 · TypeScript · React side panel · esbuild · Vitest with saved form fixtures |
| [`scripts/`](scripts/) | One-command setup, dev servers and tests |

## Requirements

- [Node.js](https://nodejs.org) 20+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (installs Python and the backend packages)
- Chrome 114+ or Edge
- For resume import with AI: [Claude Code](https://claude.com/claude-code), the
  [Gemini CLI](https://github.com/google-gemini/gemini-cli), an API key, or [Ollama](https://ollama.com)

## Run it

```bash
cd scripts
npm run setup   # first time, and after pulling new dependencies
npm run dev     # backend on 127.0.0.1:8010, dashboard on http://localhost:5174, extension rebuilt on change
npm test        # backend tests, dashboard build, extension tests and build
```

On Windows you can also double-click `scripts/start-dev.cmd`.

Then:

1. Open the dashboard at **http://localhost:5174**, fill in your profile or import it from your resume.
2. Load the extension: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
   choose `extension/dist`.
3. In the dashboard, open **Extension** → **Create pairing code**, and paste it into the side panel.
4. Open a job application and click the Apply Copilot icon.

## Privacy and safety

- The backend listens on `127.0.0.1` only, accepts only `localhost` Host headers, and refuses
  changes that don't carry its client header (so web pages can't post to it).
- The extension's routes need the pairing token; only its SHA-256 hash is stored.
- API keys live in your OS credential vault (Windows Credential Manager / macOS Keychain).
- Apply Copilot never presses Submit, never solves CAPTCHAs, never creates accounts or stores
  portal passwords.

## Configuration

Backend settings use the `APPLY_COPILOT_` prefix. Copy `backend/.env.example` to `backend/.env` to
override them.

## Roadmap

1. ~~Profile vault and resume import~~
2. ~~Extension skeleton: side panel, pairing, field listing~~
3. Greenhouse and Lever filling, synonym rules, resume upload
4. Answer memory ("remember this answer")
5. AI matcher (sees labels and key names only, never your values) and answer drafter
6. Application log, synced to the job tracker
7. Workday and Ashby (custom dropdowns, multi-step forms)
8. Naukri and a generic adapter
