import { Story, Epic, SyncConfig } from '../types';
import { JiraIssuePayload } from './client';

function markdownToAdf(text: string): object {
  // Converts plain text / simple markdown to Atlassian Document Format (ADF)
  // Jira Cloud's REST API v3 requires ADF for description fields
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: block }],
    }));

  return {
    type: 'doc',
    version: 1,
    content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph', content: [] }],
  };
}

export function epicToJiraPayload(epic: Epic, config: SyncConfig): JiraIssuePayload {
  return {
    fields: {
      project: { key: config.jira.projectKey },
      summary: epic.title,
      issuetype: { name: config.issueTypeMap['epic'] ?? 'Epic' },
      labels: [`bmad-epic`, `bmad-${epic.id}`],
      description: markdownToAdf(`BMAD Epic: ${epic.id}\n\nStatus: ${epic.status}`),
    },
  };
}

export function storyToJiraPayload(
  story: Story,
  epicJiraKey: string | undefined,
  config: SyncConfig
): JiraIssuePayload {
  const acText =
    story.acceptanceCriteria.length > 0
      ? `Acceptance Criteria:\n${story.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}`
      : '';

  // Build rich description with all available content
  const descParts: string[] = [];
  if (story.description) {
    descParts.push('h2. Story', story.description);
  }
  if (acText) {
    descParts.push('', acText);
  }
  if (story.fullContent) {
    descParts.push('', `----`, `Full story document: ${story.filePath}`);
  }
  
  const descText = descParts.join('\n\n') || `BMAD Story: ${story.id}`;

  const payload: JiraIssuePayload = {
    fields: {
      project: { key: config.jira.projectKey },
      summary: story.title,
      issuetype: { name: config.issueTypeMap['story'] ?? 'Story' },
      labels: [`bmad-story`, `bmad-${story.epicId}`, `bmad-id-${story.id}`],
      description: markdownToAdf(descText),
    },
  };

  if (epicJiraKey) {
    payload.fields.parent = { key: epicJiraKey };
  }

  return payload;
}
