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
import { JiraClient } from '../jira/client';
import { SyncConfig } from '../types';

const program = new Command();
const WORKSPACE_ROOT = process.cwd();

program
  .name('bmad-jira')
  .description('Sync BMAD stories and epics to Jira')
  .version('1.0.0');

// ─── init ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Interactive setup — creates bmad-jira.config.json and .env entry')
  .action(async () => {
    console.log(chalk.bold('\n BMAD → Jira Sync Setup\n'));

    const existing = configExists(WORKSPACE_ROOT)
      ? (JSON.parse(
          fs.readFileSync(path.join(WORKSPACE_ROOT, 'bmad-jira.config.json'), 'utf-8')
        ) as SyncConfig)
      : null;

    const answers = await prompts([
      {
        type: 'text',
        name: 'baseUrl',
        message: 'Jira base URL (e.g. https://yourorg.atlassian.net)',
        initial: existing?.jira.baseUrl ?? '',
        validate: (v) => v.startsWith('https://') || 'Must start with https://',
      },
      {
        type: 'text',
        name: 'email',
        message: 'Jira account email',
        initial: existing?.jira.email ?? '',
      },
      {
        type: 'password',
        name: 'apiToken',
        message: 'Jira API token (will be written to .env as JIRA_API_TOKEN)',
      },
      {
        type: 'text',
        name: 'projectKey',
        message: 'Jira project key (e.g. XPID)',
        initial: existing?.jira.projectKey ?? '',
        validate: (v) => /^[A-Z0-9]+$/.test(v) || 'Must be uppercase letters/numbers',
      },
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

    if (!answers.baseUrl) {
      console.log(chalk.yellow('Setup cancelled.'));
      process.exit(0);
    }

    // Write .env (append or create)
    const envPath = path.join(WORKSPACE_ROOT, '.env');
    const envLine = `JIRA_API_TOKEN=${answers.apiToken}`;
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      if (!envContent.includes('JIRA_API_TOKEN=')) {
        fs.appendFileSync(envPath, `\n${envLine}\n`);
      } else {
        // Replace existing
        fs.writeFileSync(
          envPath,
          envContent.replace(/JIRA_API_TOKEN=.*/g, envLine),
          'utf-8'
        );
      }
    } else {
      fs.writeFileSync(envPath, `${envLine}\n`, 'utf-8');
    }

    const config: SyncConfig = {
      jira: {
        baseUrl: answers.baseUrl,
        email: answers.email,
        apiToken: '${JIRA_API_TOKEN}',
        projectKey: answers.projectKey,
      },
      bmad: {
        sprintStatusFile: answers.sprintStatusFile,
        storiesDir: answers.storiesDir,
        epicsFile: '_bmad-output/planning-artifacts/epics.md',
      },
      statusMap: {
        backlog: 'Backlog',
        'ready-for-dev': 'To Do',
        'in-progress': 'In Progress',
        review: 'In Review',
        done: 'Done',
      },
      issueTypeMap: {
        epic: 'Epic',
        story: 'Story',
      },
    };

    saveConfig(WORKSPACE_ROOT, config);

    console.log(chalk.green('\n✓ Config saved to bmad-jira.config.json'));
    console.log(chalk.green('✓ API token saved to .env'));
    console.log(chalk.dim('\nMake sure .env is in your .gitignore!\n'));
    console.log('Run ' + chalk.cyan('bmad-jira sync --dry-run') + ' to preview what will be created.');
  });

// ─── sync ─────────────────────────────────────────────────────────────────────
program
  .command('sync')
  .description('Sync all BMAD stories and epics to Jira')
  .option('--dry-run', 'Preview changes without writing to Jira')
  .option('--changed', 'Only process items changed in the last git commit')
  .action(async (opts: { dryRun?: boolean; changed?: boolean }) => {
    const dryRun = opts.dryRun ?? false;

    let config: SyncConfig;
    try {
      config = loadConfig(WORKSPACE_ROOT);
    } catch (err: unknown) {
      console.error(chalk.red(`\nConfig error: ${String(err)}\n`));
      process.exit(1);
    }

    const sprintStatusPath = path.join(WORKSPACE_ROOT, config.bmad.sprintStatusFile);
    const storiesDir = path.join(WORKSPACE_ROOT, config.bmad.storiesDir);

    const spinner = ora('Parsing BMAD files...').start();
    let project;
    try {
      project = parseSprintStatus(sprintStatusPath, storiesDir);
      spinner.succeed(
        `Parsed ${project.epics.length} epics, ${project.stories.length} stories`
      );
    } catch (err: unknown) {
      spinner.fail(`Failed to parse BMAD files: ${String(err)}`);
      process.exit(1);
    }

    const store = new StateStore(WORKSPACE_ROOT);
    const plan = buildSyncPlan(project, store);

    console.log('');
    console.log(chalk.bold('Sync Plan:'));
    console.log(chalk.green(`  + Create: ${plan.toCreate.length} items`));
    console.log(chalk.yellow(`  ~ Transition: ${plan.toTransition.length} items`));
    console.log(chalk.dim(`  = Up to date: ${plan.upToDate.length} items`));
    console.log('');

    if (plan.toCreate.length === 0 && plan.toTransition.length === 0) {
      console.log(chalk.green('Everything is already in sync. Nothing to do.'));
      return;
    }

    if (dryRun) {
      console.log(chalk.bold(chalk.yellow('DRY RUN — no changes will be made to Jira\n')));
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
      for (const { item, jiraKey, fromStatus, toStatus } of plan.toTransition) {
        console.log(
          `  ${chalk.yellow('~')} ${jiraKey} (${item.id})  ${chalk.dim(fromStatus)} → ${chalk.cyan(toStatus)}`
        );
      }
      console.log('');
    }

    if (dryRun) return;

    // Confirm if large batch
    if (plan.toCreate.length > 10) {
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `About to create ${plan.toCreate.length} Jira issues. Continue?`,
        initial: true,
      });
      if (!confirm) {
        console.log(chalk.yellow('Sync cancelled.'));
        return;
      }
    }

    const execSpinner = ora('Syncing to Jira...').start();
    const engine = new SyncEngine(config, store);

    try {
      const result = await engine.executePlan(plan, false);
      execSpinner.stop();

      if (result.created.length > 0) {
        console.log(chalk.bold(chalk.green('\nCreated:')));
        for (const { bmadId, jiraKey } of result.created) {
          console.log(`  ${chalk.green('✓')} ${jiraKey}  ←  ${bmadId}`);
        }
      }

      if (result.transitioned.length > 0) {
        console.log(chalk.bold(chalk.yellow('\nTransitioned:')));
        for (const { jiraKey, toStatus, success } of result.transitioned) {
          const icon = success ? chalk.yellow('✓') : chalk.red('✗');
          console.log(`  ${icon} ${jiraKey} → ${toStatus}${success ? '' : ' (transition not available)'}`);
        }
      }

      if (result.errors.length > 0) {
        console.log(chalk.bold(chalk.red('\nErrors:')));
        for (const { bmadId, error } of result.errors) {
          console.log(`  ${chalk.red('✗')} ${bmadId}: ${error}`);
        }
      }

      console.log('');
      console.log(
        chalk.green(
          `Done. ${result.created.length} created, ${result.transitioned.length} transitioned, ${result.errors.length} errors.`
        )
      );
    } catch (err: unknown) {
      execSpinner.fail(`Sync failed: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show current sync state (BMAD ↔ Jira mapping)')
  .action(() => {
    let config: SyncConfig;
    try {
      config = loadConfig(WORKSPACE_ROOT);
    } catch (err: unknown) {
      console.error(chalk.red(`\nConfig error: ${String(err)}\n`));
      process.exit(1);
    }

    const store = new StateStore(WORKSPACE_ROOT);
    const state = store.all();
    const entries = Object.entries(state);

    if (entries.length === 0) {
      console.log(chalk.yellow('\nNo sync state found. Run "bmad-jira sync" first.\n'));
      return;
    }

    const sprintStatusPath = path.join(WORKSPACE_ROOT, config.bmad.sprintStatusFile);
    const storiesDir = path.join(WORKSPACE_ROOT, config.bmad.storiesDir);
    const project = parseSprintStatus(sprintStatusPath, storiesDir);
    const currentStatusMap = new Map<string, string>();
    for (const epic of project.epics) currentStatusMap.set(epic.id, epic.status);
    for (const story of project.stories) currentStatusMap.set(story.id, story.status);

    console.log(chalk.bold('\nBMAD ↔ Jira Sync State\n'));
    console.log(chalk.dim('BMAD ID'.padEnd(60) + 'Jira Key'.padEnd(12) + 'Synced'.padEnd(16) + 'Current'));
    console.log(chalk.dim('─'.repeat(100)));

    for (const [bmadId, ref] of entries) {
      const current = currentStatusMap.get(bmadId) ?? '?';
      const drift = current !== ref.lastSyncedStatus ? chalk.red(' ← DRIFT') : '';
      console.log(
        bmadId.padEnd(60) +
          chalk.cyan(ref.jiraKey.padEnd(12)) +
          chalk.dim(ref.lastSyncedStatus.padEnd(16)) +
          current +
          drift
      );
    }

    const notSynced =
      project.epics
        .filter((e) => !state[e.id])
        .map((e) => e.id)
        .concat(project.stories.filter((s) => !state[s.id]).map((s) => s.id));

    if (notSynced.length > 0) {
      console.log(chalk.bold(chalk.yellow(`\n${notSynced.length} items not yet synced to Jira:`)));
      for (const id of notSynced) {
        console.log(`  ${chalk.yellow('○')} ${id}`);
      }
    }

    console.log('');
  });

// ─── install-hooks ────────────────────────────────────────────────────────────
program
  .command('install-hooks')
  .description('Install git post-commit hook to auto-sync on every commit')
  .action(() => {
    const gitDir = path.join(WORKSPACE_ROOT, '.git');
    if (!fs.existsSync(gitDir)) {
      console.error(chalk.red('Not a git repository. Cannot install hooks.'));
      process.exit(1);
    }

    const hooksDir = path.join(gitDir, 'hooks');
    const hookPath = path.join(hooksDir, 'post-commit');

    const hookScript = `#!/bin/bash
# bmad-jira-sync post-commit hook
# Auto-syncs BMAD stories to Jira when _bmad-output files change

if git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -q "_bmad-output"; then
  echo "[bmad-jira] BMAD files changed, syncing to Jira..."
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
      // Append to existing hook
      fs.appendFileSync(hookPath, '\n' + hookScript);
    } else {
      fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
    }

    // Ensure executable
    fs.chmodSync(hookPath, '755');

    console.log(chalk.green('✓ post-commit hook installed at .git/hooks/post-commit'));
    console.log(chalk.dim('  Jira sync will run automatically on commits that touch _bmad-output/\n'));
  });

// ─── diagnose ────────────────────────────────────────────────────────────────
program
  .command('diagnose')
  .description('Probe Jira and show available issue types, fields, and a test payload')
  .action(async () => {
    let config: SyncConfig;
    try {
      config = loadConfig(WORKSPACE_ROOT);
    } catch (err: unknown) {
      console.error(chalk.red(`\nConfig error: ${String(err)}\n`));
      process.exit(1);
    }

    const client = new JiraClient(config.jira);
    console.log(chalk.bold('\nBMAD → Jira Diagnostics\n'));

    // 1. List all accessible projects so the user can verify the project key
    const projectsSpinner = ora('Fetching accessible projects...').start();
    try {
      const projects = await client.listProjects();
      projectsSpinner.succeed(`Connected to Jira (${projects.length} project${projects.length !== 1 ? 's' : ''} accessible)`);

      if (projects.length === 0) {
        console.log(chalk.yellow('\nNo projects returned by the API.'));
        console.log(chalk.dim('  This usually means your API token account has no project access,'));
        console.log(chalk.dim('  or the Jira project has not been created yet.'));
        console.log(chalk.dim(`\n  Check: ${config.jira.baseUrl.replace(/\/$/, '')}/jira/projects`));
        console.log(chalk.dim('  Ensure the account used for the API token is a project member.\n'));
        process.exit(1);
      }

      console.log(chalk.bold('\nAccessible projects:'));
      for (const p of projects) {
        const marker = p.key === config.jira.projectKey ? chalk.green(' ← configured') : '';
        console.log(`  ${chalk.cyan(p.key.padEnd(12))} ${p.name}${marker}`);
      }
      const found = projects.find((p) => p.key === config.jira.projectKey);
      if (!found) {
        console.log(chalk.red(`\n✗ Project key "${config.jira.projectKey}" not found in your Jira.`));
        console.log(chalk.yellow('  → Update "jira.projectKey" in bmad-jira.config.json to one of the keys above.\n'));
        process.exit(1);
      }
      console.log('');
    } catch (err: unknown) {
      projectsSpinner.fail('Could not fetch projects');
      console.error(chalk.red(String(err)));
      process.exit(1);
    }

    // 2. Check connectivity + issue types
    const typesSpinner = ora('Fetching project issue types...').start();
    try {
      const types = await client.getIssueTypes();
      typesSpinner.succeed('Connected to Jira');
      console.log(chalk.bold('\nAvailable issue types in project ' + config.jira.projectKey + ':'));
      for (const t of types) {
        console.log(`  ${chalk.cyan(t.name)} ${chalk.dim(`(id: ${t.id}, subtask: ${t.subtask})`)}`);
      }

      const configuredEpicType = config.issueTypeMap['epic'] ?? 'Epic';
      const configuredStoryType = config.issueTypeMap['story'] ?? 'Story';
      const epicMatch = types.find((t) => t.name === configuredEpicType);
      const storyMatch = types.find((t) => t.name === configuredStoryType);

      console.log('');
      if (!epicMatch) {
        console.log(chalk.red(`✗ Epic type "${configuredEpicType}" not found in project.`));
        const suggestion = types.find((t) => t.name.toLowerCase().includes('epic'));
        if (suggestion) console.log(chalk.yellow(`  → Try setting issueTypeMap.epic to "${suggestion.name}" in bmad-jira.config.json`));
      } else {
        console.log(chalk.green(`✓ Epic type "${configuredEpicType}" found`));
      }

      if (!storyMatch) {
        console.log(chalk.red(`✗ Story type "${configuredStoryType}" not found in project.`));
        const suggestion = types.find((t) => t.name.toLowerCase().includes('story') || t.name.toLowerCase() === 'task');
        if (suggestion) console.log(chalk.yellow(`  → Try setting issueTypeMap.story to "${suggestion.name}" in bmad-jira.config.json`));
      } else {
        console.log(chalk.green(`✓ Story type "${configuredStoryType}" found`));
      }
    } catch (err: unknown) {
      typesSpinner.fail('Failed to connect to Jira');
      console.error(chalk.red(String(err)));
      process.exit(1);
    }

    // 2. Try creating a minimal test issue to surface field errors
    console.log(chalk.bold('\nTesting minimal issue creation (will delete after)...'));
    const testPayload = {
      fields: {
        project: { key: config.jira.projectKey },
        summary: '[bmad-jira-sync] diagnostic test — safe to delete',
        issuetype: { name: config.issueTypeMap['story'] ?? 'Story' },
      },
    };
    console.log(chalk.dim('Payload: ' + JSON.stringify(testPayload, null, 2)));

    const testSpinner = ora('Creating test issue...').start();
    try {
      const issue = await client.createIssue(testPayload);
      testSpinner.succeed(`Test issue created: ${chalk.cyan(issue.key)}`);
      console.log(chalk.dim(`  Delete it at: ${config.jira.baseUrl.replace(/\/$/, '')}/browse/${issue.key}`));
    } catch (err: unknown) {
      testSpinner.fail('Test issue creation failed');
      console.error(chalk.red('\nJira error details:'));
      console.error(String(err));
      console.log(chalk.yellow('\nCommon fixes:'));
      console.log('  • Check issueTypeMap in bmad-jira.config.json matches the names shown above');
      console.log('  • For team-managed projects, "Story" may not exist — try "Task"');
      console.log('  • Ensure your API token has "Create Issues" permission in the project');
    }

    console.log('');
  });

program.parse(process.argv);
