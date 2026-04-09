# bmad-jira-sync

Automatically sync [BMAD](https://github.com/bmadcode/bmad-method) epics and stories to **Jira** or **Trello**. Create issues in bulk, keep statuses in sync, and wire it to git hooks so every commit auto-updates your project management tool.

---

## How it works

```
sprint-status.yaml + story .md files
        ↓  parse
  epics & stories with statuses
        ↓  diff against .bmad-jira-state.json
  what's new → create in Jira / Trello
  what changed → transition in Jira / move card in Trello
        ↓  save
  .bmad-jira-state.json  (story-id → provider item ID mapping)
```

- **Stories** are read from `_bmad-output/implementation-artifacts/*.md`
- **Statuses** are read from `sprint-status.yaml`
- **State** is stored in `.bmad-jira-state.json` at the project root — commit this file, the whole team shares the mapping

### Provider mapping

| BMAD concept | Jira | Trello |
|---|---|---|
| Epic | Epic issue | Label on the board |
| Story | Story issue (child of Epic) | Card (with Epic label applied) |
| Status transition | Issue workflow transition | Card moved to matching List |

---

## Prerequisites

- Node.js 18+
- **Jira:** A Jira Cloud workspace with at least one project created. API token from [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Trello:** A Trello board with lists matching your status names. API key + token from [trello.com/power-ups/admin](https://trello.com/power-ups/admin)

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

The wizard first asks which provider (Jira or Trello), then prompts for the relevant credentials. It writes:
- `bmad-jira.config.json` — non-secret config (safe to commit)
- `.env` — credentials (add to `.gitignore`)

**3. Verify connectivity**

```bash
node bmad-jira-sync/dist/cli/index.js diagnose
```

- **Jira:** confirms connection, lists accessible projects, validates issue type names, runs a test issue creation
- **Trello:** confirms board access, lists all lists on the board, validates that each BMAD status maps to an existing list

**4. Preview what will be synced**

```bash
node bmad-jira-sync/dist/cli/index.js sync --dry-run
```

**5. Run the first sync**

```bash
node bmad-jira-sync/dist/cli/index.js sync
```

Creates all epics and stories in the provider, then immediately transitions each item to its correct status.

---

## Commands

| Command | Description |
|---|---|
| `bmad-jira init` | Interactive setup wizard (supports Jira and Trello) |
| `bmad-jira sync` | Full sync — create missing items, transition changed statuses |
| `bmad-jira sync --dry-run` | Preview changes without writing to the provider |
| `bmad-jira status` | Show BMAD ↔ provider mapping table and detect drift |
| `bmad-jira diagnose` | Probe connectivity, list projects/boards, validate config |
| `bmad-jira install-hooks` | Install git post-commit hook for auto-sync |

> All commands must be run from the **project root**, not from inside `bmad-jira-sync/`.

---

## Auto-sync on commit

```bash
node bmad-jira-sync/dist/cli/index.js install-hooks
```

Installs a `post-commit` git hook that runs `sync` automatically whenever a commit touches any file in `_bmad-output/`. From that point, updating `sprint-status.yaml` and committing is all you need — the provider updates itself.

---

## Configuration

`bmad-jira.config.json` lives at the project root. Safe to commit — credentials are never stored here.

### Jira config

```json
{
  "provider": "jira",
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

### Trello config

```json
{
  "provider": "trello",
  "trello": {
    "apiKey": "${TRELLO_API_KEY}",
    "token": "${TRELLO_TOKEN}",
    "boardId": "your-board-id",
    "listMap": {
      "backlog": "Backlog",
      "ready-for-dev": "To Do",
      "in-progress": "In Progress",
      "review": "In Review",
      "done": "Done"
    }
  },
  "bmad": {
    "sprintStatusFile": "_bmad-output/implementation-artifacts/sprint-status.yaml",
    "storiesDir": "_bmad-output/implementation-artifacts",
    "epicsFile": "_bmad-output/planning-artifacts/epics.md"
  },
  "statusMap": {},
  "issueTypeMap": {}
}
```

The `provider` field defaults to `"jira"` when omitted, so existing configs require no changes.

### Status / list map

For **Jira**, `statusMap` values must match your Jira workflow status names exactly (case-sensitive). Run `bmad-jira diagnose` to see available statuses.

For **Trello**, `trello.listMap` values must match your board's List names exactly. Run `bmad-jira diagnose` to validate each mapping against the live board.

| BMAD status | Jira default | Trello default |
|---|---|---|
| `backlog` | Backlog | Backlog |
| `ready-for-dev` | To Do | To Do |
| `in-progress` | In Progress | In Progress |
| `review` | In Review | In Review |
| `done` | Done | Done |

### Issue type map (Jira only)

If your Jira project uses different issue type names (e.g. team-managed projects often use `Task` instead of `Story`), update `issueTypeMap` accordingly. Run `bmad-jira diagnose` to see what types your project has.

---

## Environment variables

| Variable | Provider | Description |
|---|---|---|
| `JIRA_API_TOKEN` | Jira | API token from your Atlassian account security settings |
| `TRELLO_API_KEY` | Trello | API key from trello.com/power-ups/admin |
| `TRELLO_TOKEN` | Trello | OAuth token authorizing read/write access to your boards |

Copy `.env.example` to `.env` and fill in the variables for your chosen provider:

```bash
cp bmad-jira-sync/.env.example .env
```

**Getting Trello credentials:**
1. API key: [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → create or select a Power-Up → API key
2. Token: visit `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY`
3. Board ID: open your board, append `.json` to the URL, find the `"id"` field at the top

---

## State file

`.bmad-jira-state.json` at the project root stores the mapping between BMAD IDs and provider item IDs:

```json
{
  "epic-1": {
    "itemId": "PROJ-1",
    "lastSyncedStatus": "in-progress"
  },
  "1-1-candidate-account-registration-and-sign-in": {
    "itemId": "PROJ-2",
    "lastSyncedStatus": "review",
    "parentItemId": "PROJ-1"
  }
}
```

For Trello, `itemId` holds the Trello card ID (epics store the label ID).

**Commit this file.** It is the source of truth for which BMAD item maps to which provider item. Without it, `sync` will try to create duplicates.

> **Migrating from an older version?** State files written by earlier versions used `jiraKey` instead of `itemId`. These are automatically migrated to the new format on the next `sync` run — no manual changes needed.

---

## Project structure

```
bmad-jira-sync/
├── src/
│   ├── types.ts                          # Shared types
│   ├── providers/
│   │   ├── PmProvider.ts                 # Abstract PmProvider interface
│   │   └── providerFactory.ts            # Creates Jira or Trello provider from config
│   ├── parsers/
│   │   └── sprintStatusParser.ts         # Parses sprint-status.yaml + story .md files
│   ├── jira/
│   │   ├── client.ts                     # Jira REST API v3 wrapper
│   │   ├── JiraProvider.ts               # PmProvider implementation for Jira
│   │   ├── issueMapper.ts                # BMAD story/epic → Jira issue payload
│   │   └── statusMapper.ts               # BMAD status → Jira transition ID
│   ├── trello/
│   │   ├── TrelloClient.ts               # Trello REST v1 client
│   │   └── TrelloProvider.ts             # PmProvider implementation for Trello
│   ├── sync/
│   │   ├── stateStore.ts                 # Reads/writes .bmad-jira-state.json
│   │   ├── diffEngine.ts                 # Detects creates vs transitions
│   │   └── syncEngine.ts                 # Orchestrates the full sync via PmProvider
│   └── cli/
│       ├── config.ts                     # Config loading and saving
│       └── index.ts                      # CLI entrypoint
├── .env.example                          # Environment variable template
├── bmad-jira.config.json                 # Default config template
├── package.json
└── tsconfig.json
```

---

## Typical workflow

```
# Developer updates a story status in sprint-status.yaml
git add _bmad-output/implementation-artifacts/sprint-status.yaml
git commit -m "move story 2-3 to review"

# post-commit hook fires automatically:
# [bmad-jira] BMAD files changed, syncing...
# ~ PROJ-18 (2-3-video-response-capture) → In Review
# Done. 0 created, 1 transitioned, 0 errors.
```

---

## Publishing as an npm package

1. Bump the package version with `npm version <patch|minor|major>` and push the commit plus tag (`git push --follow-tags`).
2. Create a GitHub release for the new tag (the `release.published` trigger runs the automated publish workflow).
3. The workflow runs `npm ci`, `npm run build`, and `npm publish`, using the `NPM_TOKEN` secret (add an npm automation token with `publish` scope under Settings → Secrets).

The `prepare` script already builds `dist` before packing, so the published tarball includes the transpiled CLI entry point, typings, and config templates that consumers rely on.

## Troubleshooting

### Jira

**`valid project is required`**
The `projectKey` in config doesn't match any Jira project. Run `bmad-jira diagnose` to list accessible projects and find the correct key.

**`0 projects accessible`**
Either no Jira project exists yet, or the API token account isn't a member of any project. Create a project at `https://yourorg.atlassian.net/jira/projects` and ensure the account is added as a member.

**Transition not available**
The target status doesn't exist as a valid transition from the current status in your Jira workflow. Check your project's workflow in Jira settings, or update `statusMap` to use names that match your workflow.

**Issues created but stuck in Backlog (Scrum board)**
Jira Scrum boards require issues to be in an active sprint to appear on the board. Create a sprint, add issues to it, and start it. Alternatively, use a Kanban board which shows all issues without sprint assignment.

### Trello

**`Trello list "X" not found on board`**
A value in `trello.listMap` doesn't match any list on your board. Run `bmad-jira diagnose` to see exact list names, then update `listMap` in config to match.

**`Trello API 401`**
Your API key or token is invalid or expired. Regenerate the token at `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY`.

**Board ID not found**
Get the board ID by opening your board URL and appending `.json`, e.g. `https://trello.com/b/XXXXX/board-name.json`. The `"id"` field at the top is your board ID.

### General

**Duplicate issues after deleting state file**
Never delete `.bmad-jira-state.json` unless you also delete all corresponding issues in the provider. The state file is what prevents duplicates.
