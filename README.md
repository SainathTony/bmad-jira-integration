# bmad-jira-sync

Automatically sync [BMAD](https://github.com/bmadcode/bmad-method) epics and stories to Jira. Create issues in bulk, keep statuses in sync, and wire it to git hooks so every commit auto-updates Jira.

---

## How it works

```
sprint-status.yaml + story .md files
        ↓  parse
  47 epics & stories with statuses
        ↓  diff against .bmad-jira-state.json
  what's new → create in Jira
  what changed → transition in Jira
        ↓  save
  .bmad-jira-state.json  (story-id → PROJ-NNN mapping)
```

- **Stories** are read from `_bmad-output/implementation-artifacts/*.md`
- **Statuses** are read from `sprint-status.yaml`
- **State** is stored in `.bmad-jira-state.json` at the project root (commit this file — the whole team shares the mapping)

---

## Prerequisites

- Node.js 18+
- A Jira Cloud workspace with at least one project created
- A Jira API token — generate one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Setup

**1. Install dependencies and build**

```bash
cd bmad-jira-sync
npm install
npm run build
```

**2. Run interactive setup**

Run from your **project root** (not inside `bmad-jira-sync/`):

```bash
node bmad-jira-sync/dist/cli/index.js init
```

This will prompt for your Jira URL, email, API token, and project key, then write:
- `bmad-jira.config.json` — non-secret config (safe to commit)
- `.env` — your API token (add to `.gitignore`)

**3. Verify connectivity**

```bash
node bmad-jira-sync/dist/cli/index.js diagnose
```

This confirms Jira is reachable, lists accessible projects, validates issue type names, and runs a test issue creation.

**4. Preview what will be synced**

```bash
node bmad-jira-sync/dist/cli/index.js sync --dry-run
```

**5. Run the first sync**

```bash
node bmad-jira-sync/dist/cli/index.js sync
```

Creates all epics and stories in Jira, then immediately transitions each issue to its correct status.

---

## Commands

| Command | Description |
|---|---|
| `bmad-jira init` | Interactive setup wizard |
| `bmad-jira sync` | Full sync — create missing issues, transition changed statuses |
| `bmad-jira sync --dry-run` | Preview changes without writing to Jira |
| `bmad-jira status` | Show BMAD ↔ Jira mapping table and detect drift |
| `bmad-jira diagnose` | Probe Jira connectivity, list projects and issue types |
| `bmad-jira install-hooks` | Install git post-commit hook for auto-sync |

> All commands must be run from the **project root**, not from inside `bmad-jira-sync/`.

---

## Auto-sync on commit

```bash
node bmad-jira-sync/dist/cli/index.js install-hooks
```

Installs a `post-commit` git hook that runs `sync` automatically whenever a commit touches any file in `_bmad-output/`. From that point, updating `sprint-status.yaml` and committing is all you need — Jira updates itself.

---

## Configuration

`bmad-jira.config.json` lives at the project root. Safe to commit — the API token is never stored here.

```json
{
  "jira": {
    "baseUrl": "https://yourorg.atlassian.net",
    "email": "you@yourorg.com",
    "apiToken": "${JIRA_API_TOKEN}",
    "projectKey": "PROJ"
  },
  "bmad": {
    "sprintStatusFile": "_bmad-output/implementation-artifacts/sprint-status.yaml",
    "storiesDir": "_bmad-output/implementation-artifacts",
    "epicsFile": "_bmad-output/planning-artifacts/epics.md"
  },
  "statusMap": {
    "backlog": "Backlog",
    "ready-for-dev": "To Do",
    "in-progress": "In Progress",
    "review": "In Review",
    "done": "Done"
  },
  "issueTypeMap": {
    "epic": "Epic",
    "story": "Story"
  }
}
```

### Status map

Maps BMAD statuses to Jira status names. The names on the right must match **exactly** what your Jira workflow uses (case-sensitive). Run `bmad-jira diagnose` to see available statuses for your project.

| BMAD | Jira (default) |
|---|---|
| `backlog` | Backlog |
| `ready-for-dev` | To Do |
| `in-progress` | In Progress |
| `review` | In Review |
| `done` | Done |

### Issue type map

If your Jira project uses different issue type names (e.g. team-managed projects often use `Task` instead of `Story`), update `issueTypeMap` accordingly. Run `bmad-jira diagnose` to see what types your project has.

---

## Environment variables

| Variable | Description |
|---|---|
| `JIRA_API_TOKEN` | Your Jira API token. Set in `.env` or your shell environment. |

Copy `.env.example` to `.env` and fill it in:

```bash
cp bmad-jira-sync/.env.example .env
```

---

## State file

`.bmad-jira-state.json` at the project root stores the mapping between BMAD story IDs and Jira issue keys:

```json
{
  "epic-1": {
    "jiraKey": "PROJ-1",
    "lastSyncedStatus": "in-progress"
  },
  "1-1-candidate-account-registration-and-sign-in": {
    "jiraKey": "PROJ-2",
    "lastSyncedStatus": "review",
    "epicKey": "PROJ-1"
  }
}
```

**Commit this file.** It is the source of truth for which BMAD item maps to which Jira issue. Without it, `sync` will try to create duplicate issues.

---

## Project structure

```
bmad-jira-sync/
├── src/
│   ├── types.ts                        # Shared types
│   ├── parsers/
│   │   └── sprintStatusParser.ts       # Parses sprint-status.yaml + story .md files
│   ├── jira/
│   │   ├── client.ts                   # Jira REST API v3 wrapper
│   │   ├── issueMapper.ts              # BMAD story/epic → Jira issue payload
│   │   └── statusMapper.ts             # BMAD status → Jira transition ID
│   ├── sync/
│   │   ├── stateStore.ts               # Reads/writes .bmad-jira-state.json
│   │   ├── diffEngine.ts               # Detects creates vs transitions
│   │   └── syncEngine.ts               # Orchestrates the full sync
│   └── cli/
│       ├── config.ts                   # Config loading and saving
│       └── index.ts                    # CLI entrypoint
├── .env.example                        # Environment variable template
├── bmad-jira.config.json               # Default config template (inside package)
├── package.json
└── tsconfig.json
```

---

## Typical workflow

```
# Developer updates a story status in sprint-status.yaml
# Developer commits the change
git add _bmad-output/implementation-artifacts/sprint-status.yaml
git commit -m "move story 2-3 to review"

# post-commit hook fires automatically:
# [bmad-jira] BMAD files changed, syncing to Jira...
# ~ PROJ-18 (2-3-video-response-capture) → In Review
# Done. 0 created, 1 transitioned, 0 errors.
```

---

## Troubleshooting

**`valid project is required`**
The `projectKey` in config doesn't match any Jira project. Run `bmad-jira diagnose` to list accessible projects and find the correct key.

**`0 projects accessible`**
Either no Jira project exists yet, or the API token account isn't a member of any project. Create a project at `https://yourorg.atlassian.net/jira/projects` and ensure the account is added as a member.

**Transition not available**
The target status doesn't exist as a valid transition from the current status in your Jira workflow. Check your project's workflow in Jira settings, or update `statusMap` in config to use status names that match your workflow.

**Issues created but stuck in Backlog (Scrum board)**
Jira Scrum boards require issues to be in an active sprint to appear on the board. Create a sprint, add issues to it, and start it. Alternatively, use a Kanban board which shows all issues without sprint assignment.

**Duplicate issues after deleting state file**
Never delete `.bmad-jira-state.json` unless you also delete all the corresponding Jira issues. The state file is what prevents duplicates.
