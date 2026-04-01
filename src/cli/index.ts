#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs';
import prompts from 'prompts';

import { loadConfig, saveConfig, configExists } from './config';
import { parseSprintStatus } from '../parsers/sprintStatusParser';
import { StateStore } from '../sync/stateStore';
import { buildSyncPlan } from '../sync/diffEngine';
import { SyncEngine } from '../sync/syncEngine';
import { createProvider } from '../providers/providerFactory';
import { JiraClient } from '../jira/client';
import { TrelloClient } from '../trello/TrelloClient';
import { SyncConfig } from '../types';

const program = new Command();
const WORKSPACE_ROOT = process.cwd();

program
  .name('bmad-jira')
  .description('Sync BMAD stories and epics to Jira or Trello')
  .version('1.0.0');

// ─── init ─────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Interactive setup — creates bmad-jira.config.json and .env entry')
  .action(async () => {
    console.log(chalk.bold('\n BMAD Sync Setup\n'));

    const existing = configExists(WORKSPACE_ROOT)
      ? (JSON.parse(
          fs.readFileSync(path.join(WORKSPACE_ROOT, 'bmad-jira.config.json'), 'utf-8')
        ) as SyncConfig)
      : null;

    const { provider } = await prompts({
      type: 'select',
      name: 'provider',
      message: 'Which project management tool?',
      choices: [
        { title: 'Jira',   value: 'jira' },
        { title: 'Trello', value: 'trello' },
      ],
      initial: existing?.provider === 'trello' ? 1 : 0,
    });
    if (!provider) { console.log(chalk.yellow('Setup cancelled.')); process.exit(0); }

    const bmadAnswers = await prompts([
      {
        type: 'text',
        name: 'sprintStatusFile',
        message: 'Path to sprint-status.yaml (relative to project root)',
        initial: existing?.bmad.sprintStatusFile ?? '_bmad-output/implementation-artifacts/sprint-status.yaml',
      },
      {
        type: 'text',
        name: 'storiesDir',
        message: 'Path to stories directory (relative to project root)',
        initial: existing?.bmad.storiesDir ?? '_bmad-output/implementation-artifacts',
      },
    ]);

    let config: SyncConfig = {
      provider,
      jira: existing?.jira ?? { baseUrl: '', email: '', apiToken: '${JIRA_API_TOKEN}', projectKey: '' },
      bmad: {
        sprintStatusFile: bmadAnswers.sprintStatusFile,
        storiesDir: bmadAnswers.storiesDir,
        epicsFile: '_bmad-output/planning-artifacts/epics.md',
      },
      statusMap: existing?.statusMap ?? {
        backlog: 'Backlog',
        'ready-for-dev': 'To Do',
        'in-progress': 'In Progress',
        review: 'In Review',
        done: 'Done',
      },
      issueTypeMap: existing?.issueTypeMap ?? { epic: 'Epic', story: 'Story' },
    };

    const envLines: string[] = [];

    if (provider === 'jira') {
      const jiraAnswers = await prompts([
        {
          type: 'text',
          name: 'baseUrl',
          message: 'Jira base URL (e.g. https://yourorg.atlassian.net)',
          initial: existing?.jira.baseUrl ?? '',
          validate: (v) => v.startsWith('https://') || 'Must start with https://',
        },
        { type: 'text',     name: 'email',      message: 'Jira account email', initial: existing?.jira.email ?? '' },
        { type: 'password', name: 'apiToken',   message: 'Jira API token (saved to .env as JIRA_API_TOKEN)' },
        {
          type: 'text',
          name: 'projectKey',
          message: 'Jira project key (e.g. PROJ)',
          initial: existing?.jira.projectKey ?? '',
          validate: (v) => /^[A-Z0-9]+$/.test(v) || 'Must be uppercase letters/numbers',
        },
      ]);
      if (!jiraAnswers.baseUrl) { console.log(chalk.yellow('Setup cancelled.')); process.exit(0); }
      config.jira = { baseUrl: jiraAnswers.baseUrl, email: jiraAnswers.email, apiToken: '${JIRA_API_TOKEN}', projectKey: jiraAnswers.projectKey };
      envLines.push(`JIRA_API_TOKEN=${jiraAnswers.apiToken}`);
    }

    if (provider === 'trello') {
      console.log(chalk.dim('\nYou need a Trello API key and token.'));
      console.log(chalk.dim('Get them at: https://trello.com/power-ups/admin → your Power-Up → API key'));
      console.log(chalk.dim('Token: https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY\n'));

      const trelloAnswers = await prompts([
        { type: 'password', name: 'apiKey',  message: 'Trello API key (saved to .env as TRELLO_API_KEY)' },
        { type: 'password', name: 'token',   message: 'Trello token (saved to .env as TRELLO_TOKEN)' },
        { type: 'text',     name: 'boardId', message: 'Trello board ID (the long ID from the board URL or board JSON)' },
      ]);
      if (!trelloAnswers.apiKey) { console.log(chalk.yellow('Setup cancelled.')); process.exit(0); }

      config.trello = {
        apiKey: '${TRELLO_API_KEY}',
        token:  '${TRELLO_TOKEN}',
        boardId: trelloAnswers.boardId,
        listMap: {
          backlog:        'Backlog',
          'ready-for-dev': 'To Do',
          'in-progress':  'In Progress',
          review:         'In Review',
          done:           'Done',
        },
      };
      envLines.push(`TRELLO_API_KEY=${trelloAnswers.apiKey}`, `TRELLO_TOKEN=${trelloAnswers.token}`);
    }

    // Write .env
    const envPath = path.join(WORKSPACE_ROOT, '.env');
    for (const line of envLines) {
      const [key] = line.split('=');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        if (content.includes(`${key}=`)) {
          fs.writeFileSync(envPath, content.replace(new RegExp(`${key}=.*`), line), 'utf-8');
        } else {
          fs.appendFileSync(envPath, `\n${line}\n`);
        }
      } else {
        fs.writeFileSync(envPath, `${line}\n`, 'utf-8');
      }
    }

    saveConfig(WORKSPACE_ROOT, config);
    console.log(chalk.green('\n✓ Config saved to bmad-jira.config.json'));
    console.log(chalk.green('✓ Credentials saved to .env'));
    console.log(chalk.dim('\nMake sure .env is in your .gitignore!\n'));
    console.log('Run ' + chalk.cyan('bmad-jira sync --dry-run') + ' to preview what will be synced.');
  });

// ─── sync ──────────────────────────────────────────────────────────────────────
program
  .command('sync')
  .description('Sync all BMAD stories and epics to the configured provider')
  .option('--dry-run', 'Preview changes without writing to the provider')
  .action(async (opts: { dryRun?: boolean }) => {
    const dryRun = opts.dryRun ?? false;

    let config: SyncConfig;
    try { config = loadConfig(WORKSPACE_ROOT); }
    catch (err: unknown) { console.error(chalk.red(`\nConfig error: ${String(err)}\n`)); process.exit(1); }

    const sprintStatusPath = path.join(WORKSPACE_ROOT, config.bmad.sprintStatusFile);
    const storiesDir       = path.join(WORKSPACE_ROOT, config.bmad.storiesDir);

    const spinner = ora('Parsing BMAD files...').start();
    let project;
    try {
      project = parseSprintStatus(sprintStatusPath, storiesDir);
      spinner.succeed(`Parsed ${project.epics.length} epics, ${project.stories.length} stories`);
    } catch (err: unknown) {
      spinner.fail(`Failed to parse BMAD files: ${String(err)}`);
      process.exit(1);
    }

    const store = new StateStore(WORKSPACE_ROOT);
    const plan  = buildSyncPlan(project, store);

    const providerLabel = (config.provider ?? 'jira').toUpperCase();
    console.log('');
    console.log(chalk.bold(`Sync Plan → ${providerLabel}:`));
    console.log(chalk.green(`  + Create: ${plan.toCreate.length} items`));
    console.log(chalk.yellow(`  ~ Transition: ${plan.toTransition.length} items`));
    console.log(chalk.dim(`  = Up to date: ${plan.upToDate.length} items`));
    console.log('');

    if (plan.toCreate.length === 0 && plan.toTransition.length === 0) {
      console.log(chalk.green('Everything is already in sync. Nothing to do.'));
      return;
    }

    if (dryRun) {
      console.log(chalk.bold(chalk.yellow('DRY RUN — no changes will be made\n')));
    }

    if (plan.toCreate.length > 0) {
      console.log(chalk.bold('Items to create:'));
      for (const { type, item } of plan.toCreate) {
        console.log(`  ${chalk.green('+')} [${type}] ${item.id} — "${item.title}"`);
      }
      console.log('');
    }

    if (plan.toTransition.length > 0) {
      console.log(chalk.bold('Status transitions:'));
      for (const { item, itemId, fromStatus, toStatus } of plan.toTransition) {
        console.log(`  ${chalk.yellow('~')} ${itemId} (${item.id})  ${chalk.dim(fromStatus)} → ${chalk.cyan(toStatus)}`);
      }
      console.log('');
    }

    if (dryRun) return;

    if (plan.toCreate.length > 10) {
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `About to create ${plan.toCreate.length} items in ${providerLabel}. Continue?`,
        initial: true,
      });
      if (!confirm) { console.log(chalk.yellow('Sync cancelled.')); return; }
    }

    const execSpinner = ora(`Syncing to ${providerLabel}...`).start();
    const provider = createProvider(config);
    const engine   = new SyncEngine(provider, store);

    try {
      const result = await engine.executePlan(plan, false);
      execSpinner.stop();

      if (result.created.length > 0) {
        console.log(chalk.bold(chalk.green('\nCreated:')));
        for (const { bmadId, itemId } of result.created) {
          console.log(`  ${chalk.green('✓')} ${itemId}  ←  ${bmadId}`);
        }
      }

      if (result.transitioned.length > 0) {
        console.log(chalk.bold(chalk.yellow('\nTransitioned:')));
        for (const { itemId, toStatus, success } of result.transitioned) {
          const icon = success ? chalk.yellow('✓') : chalk.red('✗');
          console.log(`  ${icon} ${itemId} → ${toStatus}${success ? '' : ' (transition not available)'}`);
        }
      }

      if (result.errors.length > 0) {
        console.log(chalk.bold(chalk.red('\nErrors:')));
        for (const { bmadId, error } of result.errors) {
          console.log(`  ${chalk.red('✗')} ${bmadId}: ${error}`);
        }
      }

      console.log('');
      console.log(chalk.green(
        `Done. ${result.created.length} created, ${result.transitioned.length} transitioned, ${result.errors.length} errors.`
      ));
    } catch (err: unknown) {
      execSpinner.fail(`Sync failed: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show current sync state (BMAD ↔ provider mapping)')
  .action(() => {
    let config: SyncConfig;
    try { config = loadConfig(WORKSPACE_ROOT); }
    catch (err: unknown) { console.error(chalk.red(`\nConfig error: ${String(err)}\n`)); process.exit(1); }

    const store   = new StateStore(WORKSPACE_ROOT);
    const state   = store.all();
    const entries = Object.entries(state);

    if (entries.length === 0) {
      console.log(chalk.yellow('\nNo sync state found. Run "bmad-jira sync" first.\n'));
      return;
    }

    const sprintStatusPath = path.join(WORKSPACE_ROOT, config.bmad.sprintStatusFile);
    const storiesDir       = path.join(WORKSPACE_ROOT, config.bmad.storiesDir);
    const project          = parseSprintStatus(sprintStatusPath, storiesDir);
    const currentStatusMap = new Map<string, string>();
    for (const epic  of project.epics)   currentStatusMap.set(epic.id,  epic.status);
    for (const story of project.stories) currentStatusMap.set(story.id, story.status);

    const providerLabel = (config.provider ?? 'jira').toUpperCase();
    console.log(chalk.bold(`\nBMAD ↔ ${providerLabel} Sync State\n`));
    console.log(chalk.dim('BMAD ID'.padEnd(60) + 'Provider ID'.padEnd(16) + 'Synced'.padEnd(16) + 'Current'));
    console.log(chalk.dim('─'.repeat(106)));

    for (const [bmadId, ref] of entries) {
      const current = currentStatusMap.get(bmadId) ?? '?';
      const drift   = current !== ref.lastSyncedStatus ? chalk.red(' ← DRIFT') : '';
      console.log(
        bmadId.padEnd(60) +
        chalk.cyan(ref.itemId.padEnd(16)) +
        chalk.dim(ref.lastSyncedStatus.padEnd(16)) +
        current + drift
      );
    }

    const notSynced = [
      ...project.epics.filter((e) => !state[e.id]).map((e) => e.id),
      ...project.stories.filter((s) => !state[s.id]).map((s) => s.id),
    ];
    if (notSynced.length > 0) {
      console.log(chalk.bold(chalk.yellow(`\n${notSynced.length} items not yet synced:`)));
      for (const id of notSynced) console.log(`  ${chalk.yellow('○')} ${id}`);
    }
    console.log('');
  });

// ─── diagnose ──────────────────────────────────────────────────────────────────
program
  .command('diagnose')
  .description('Probe provider connectivity, list projects/boards, validate config')
  .action(async () => {
    let config: SyncConfig;
    try { config = loadConfig(WORKSPACE_ROOT); }
    catch (err: unknown) { console.error(chalk.red(`\nConfig error: ${String(err)}\n`)); process.exit(1); }

    const provider = config.provider ?? 'jira';
    console.log(chalk.bold(`\nBMAD Sync Diagnostics — ${provider.toUpperCase()}\n`));

    if (provider === 'jira') {
      await diagnoseJira(config);
    } else if (provider === 'trello') {
      await diagnoseTrello(config);
    }

    console.log('');
  });

async function diagnoseJira(config: SyncConfig): Promise<void> {
  const client = new JiraClient(config.jira);

  const projectsSpinner = ora('Fetching accessible projects...').start();
  try {
    const projects = await client.listProjects();
    projectsSpinner.succeed(`Connected to Jira (${projects.length} project${projects.length !== 1 ? 's' : ''} accessible)`);

    if (projects.length === 0) {
      console.log(chalk.yellow('\nNo projects returned by the API.'));
      console.log(chalk.dim('  Create a project at ' + config.jira.baseUrl.replace(/\/$/, '') + '/jira/projects'));
      console.log(chalk.dim('  Ensure the account is a project member.\n'));
      process.exit(1);
    }

    console.log(chalk.bold('\nAccessible projects:'));
    for (const p of projects) {
      const marker = p.key === config.jira.projectKey ? chalk.green(' ← configured') : '';
      console.log(`  ${chalk.cyan(p.key.padEnd(12))} ${p.name}${marker}`);
    }

    const found = projects.find((p) => p.key === config.jira.projectKey);
    if (!found) {
      console.log(chalk.red(`\n✗ Project key "${config.jira.projectKey}" not found.`));
      console.log(chalk.yellow('  → Update "jira.projectKey" in bmad-jira.config.json.\n'));
      process.exit(1);
    }
    console.log('');
  } catch (err: unknown) {
    projectsSpinner.fail('Could not fetch projects');
    console.error(chalk.red(String(err)));
    process.exit(1);
  }

  const typesSpinner = ora('Fetching issue types...').start();
  try {
    const types = await client.getIssueTypes();
    typesSpinner.succeed('Issue types fetched');
    console.log(chalk.bold('\nAvailable issue types:'));
    for (const t of types) {
      console.log(`  ${chalk.cyan(t.name)} ${chalk.dim(`(id: ${t.id})`)}`);
    }

    const epicType  = config.issueTypeMap['epic']  ?? 'Epic';
    const storyType = config.issueTypeMap['story'] ?? 'Story';
    console.log('');
    console.log(types.find((t) => t.name === epicType)
      ? chalk.green(`✓ Epic type "${epicType}" found`)
      : chalk.red(`✗ Epic type "${epicType}" not found — update issueTypeMap.epic in config`));
    console.log(types.find((t) => t.name === storyType)
      ? chalk.green(`✓ Story type "${storyType}" found`)
      : chalk.red(`✗ Story type "${storyType}" not found — update issueTypeMap.story in config`));
  } catch (err: unknown) {
    typesSpinner.fail('Failed to fetch issue types');
    console.error(chalk.red(String(err)));
  }

  const testSpinner = ora('Testing minimal issue creation...').start();
  try {
    const issue = await client.createIssue({
      fields: {
        project: { key: config.jira.projectKey },
        summary: '[bmad-jira-sync] diagnostic test — safe to delete',
        issuetype: { name: config.issueTypeMap['story'] ?? 'Story' },
      },
    });
    testSpinner.succeed(`Test issue created: ${chalk.cyan(issue.key)}`);
    console.log(chalk.dim(`  View/delete: ${config.jira.baseUrl.replace(/\/$/, '')}/browse/${issue.key}`));
  } catch (err: unknown) {
    testSpinner.fail('Test issue creation failed');
    console.error(chalk.red('\nJira error details:'));
    console.error(String(err));
    console.log(chalk.yellow('\nCommon fixes:'));
    console.log('  • issueTypeMap names must match exactly (run diagnose to see available types)');
    console.log('  • For team-managed projects, "Story" may not exist — try "Task"');
    console.log('  • Ensure API token has "Create Issues" permission');
  }
}

async function diagnoseTrello(config: SyncConfig): Promise<void> {
  const tc = config.trello!;
  const apiKey = tc.apiKey.startsWith('${') ? process.env[tc.apiKey.slice(2, -1)] ?? '' : tc.apiKey;
  const token  = tc.token.startsWith('${')  ? process.env[tc.token.slice(2, -1)]  ?? '' : tc.token;
  const client = new TrelloClient(apiKey, token);

  const boardSpinner = ora('Fetching board...').start();
  try {
    const board = await client.getBoard(tc.boardId);
    boardSpinner.succeed(`Connected to Trello — board: "${board.name}"`);
  } catch (err: unknown) {
    boardSpinner.fail('Could not fetch board');
    console.error(chalk.red(String(err)));
    console.log(chalk.yellow('\nCommon fixes:'));
    console.log('  • Verify boardId in config is correct (get it from the board URL or append .json to the board URL)');
    console.log('  • Ensure TRELLO_API_KEY and TRELLO_TOKEN are set in .env');
    process.exit(1);
  }

  const listsSpinner = ora('Fetching lists...').start();
  try {
    const lists = await client.getLists(tc.boardId);
    listsSpinner.succeed(`${lists.length} lists on board`);
    console.log(chalk.bold('\nBoard lists:'));
    for (const l of lists) {
      const bmadStatus = Object.entries(tc.listMap).find(([, name]) => name === l.name)?.[0];
      const marker = bmadStatus ? chalk.green(` ← ${bmadStatus}`) : '';
      console.log(`  ${chalk.cyan(l.name)}${marker}`);
    }

    const listNames = new Set(lists.map((l) => l.name));
    console.log(chalk.bold('\nList map validation:'));
    for (const [bmadStatus, listName] of Object.entries(tc.listMap)) {
      if (listNames.has(listName)) {
        console.log(chalk.green(`  ✓ ${bmadStatus} → "${listName}"`));
      } else {
        console.log(chalk.red(`  ✗ ${bmadStatus} → "${listName}" — list not found on board`));
      }
    }
  } catch (err: unknown) {
    listsSpinner.fail('Failed to fetch lists');
    console.error(chalk.red(String(err)));
  }
}

// ─── install-hooks ─────────────────────────────────────────────────────────────
program
  .command('install-hooks')
  .description('Install git post-commit hook to auto-sync on every commit')
  .action(() => {
    const gitDir = path.join(WORKSPACE_ROOT, '.git');
    if (!fs.existsSync(gitDir)) {
      console.error(chalk.red('Not a git repository. Cannot install hooks.'));
      process.exit(1);
    }

    const hookPath = path.join(gitDir, 'hooks', 'post-commit');
    const hookScript = `#!/bin/bash
# bmad-jira-sync post-commit hook
if git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -q "_bmad-output"; then
  echo "[bmad-jira] BMAD files changed, syncing..."
  cd "$(git rev-parse --show-toplevel)"
  node bmad-jira-sync/dist/cli/index.js sync
fi
`;

    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf-8');
      if (existing.includes('bmad-jira')) {
        console.log(chalk.yellow('Hook already installed.'));
        return;
      }
      fs.appendFileSync(hookPath, '\n' + hookScript);
    } else {
      fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
    }

    fs.chmodSync(hookPath, '755');
    console.log(chalk.green('✓ post-commit hook installed at .git/hooks/post-commit'));
    console.log(chalk.dim('  Sync runs automatically on commits that touch _bmad-output/\n'));
  });

program.parse(process.argv);
