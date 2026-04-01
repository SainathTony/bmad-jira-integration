import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SyncConfig } from '../types';

const CONFIG_FILE = 'bmad-jira.config.json';

function resolveEnvPlaceholder(value: string | undefined): string | undefined {
  if (!value) return value;
  if (!value.startsWith('${')) return value;
  const key = value.slice(2, -1);
  return process.env[key];
}

export function loadConfig(workspaceRoot: string): SyncConfig {
  dotenv.config({ path: path.join(workspaceRoot, '.env') });

  const configPath = path.join(workspaceRoot, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. Run "bmad-jira init" to set up.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SyncConfig;
  const provider = raw.provider ?? 'jira';

  if (provider === 'jira') {
    const resolved = resolveEnvPlaceholder(raw.jira.apiToken);
    if (!resolved) {
      const key = raw.jira.apiToken.startsWith('${') ? raw.jira.apiToken.slice(2, -1) : 'JIRA_API_TOKEN';
      throw new Error(
        `Environment variable ${key} is not set. ` +
        `Set it in your shell or create a .env file at the project root.`
      );
    }
    raw.jira.apiToken = resolved;
  }

  if (provider === 'trello' && raw.trello) {
    const apiKey = resolveEnvPlaceholder(raw.trello.apiKey);
    const token  = resolveEnvPlaceholder(raw.trello.token);
    if (!apiKey) {
      const key = raw.trello.apiKey.startsWith('${') ? raw.trello.apiKey.slice(2, -1) : 'TRELLO_API_KEY';
      throw new Error(`Environment variable ${key} is not set.`);
    }
    if (!token) {
      const key = raw.trello.token.startsWith('${') ? raw.trello.token.slice(2, -1) : 'TRELLO_TOKEN';
      throw new Error(`Environment variable ${key} is not set.`);
    }
    raw.trello.apiKey = apiKey;
    raw.trello.token  = token;
  }

  return raw;
}

export function saveConfig(workspaceRoot: string, config: SyncConfig): void {
  const toSave: SyncConfig = {
    ...config,
    jira: { ...config.jira, apiToken: '${JIRA_API_TOKEN}' },
  };
  if (toSave.trello) {
    toSave.trello = {
      ...toSave.trello,
      apiKey: '${TRELLO_API_KEY}',
      token:  '${TRELLO_TOKEN}',
    };
  }
  const configPath = path.join(workspaceRoot, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
}

export function configExists(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, CONFIG_FILE));
}
