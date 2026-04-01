import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SyncConfig } from '../types';

const CONFIG_FILE = 'bmad-jira.config.json';

export function loadConfig(workspaceRoot: string): SyncConfig {
  // Load .env from workspace root if it exists
  dotenv.config({ path: path.join(workspaceRoot, '.env') });

  const configPath = path.join(workspaceRoot, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. Run "bmad-jira init" to set up.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SyncConfig;

  // Resolve env var placeholders like "${JIRA_API_TOKEN}"
  if (raw.jira.apiToken.startsWith('${')) {
    const envKey = raw.jira.apiToken.slice(2, -1);
    const resolved = process.env[envKey];
    if (!resolved) {
      throw new Error(
        `Environment variable ${envKey} is not set. ` +
          `Set it in your shell or create a .env file in the project root.`
      );
    }
    raw.jira.apiToken = resolved;
  }

  return raw;
}

export function saveConfig(workspaceRoot: string, config: SyncConfig): void {
  // Save with apiToken as env var placeholder, never plaintext
  const toSave = {
    ...config,
    jira: { ...config.jira, apiToken: '${JIRA_API_TOKEN}' },
  };
  const configPath = path.join(workspaceRoot, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
}

export function configExists(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, CONFIG_FILE));
}
