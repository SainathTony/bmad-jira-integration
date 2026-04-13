import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Epic, EpicStatus, Story, StoryStatus, BmadProject } from '../types';

interface RawSprintStatus {
  development_status: Record<string, string>;
  story_location: string;
}

const EPIC_KEY_PATTERN = /^epic-\d+$/;
const RETROSPECTIVE_PATTERN = /^epic-\d+-retrospective$/;
const STORY_KEY_PATTERN = /^\d+-\d+-.+$/;

function epicIdFromStoryId(storyId: string): string {
  const epicNumber = storyId.split('-')[0];
  return `epic-${epicNumber}`;
}

function titleFromId(id: string): string {
  // "1-1-candidate-account-registration" → "Candidate Account Registration"
  const parts = id.split('-');
  // Drop leading numeric segments (epic number, story number)
  const words = parts.filter((p) => isNaN(Number(p)));
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function parseSprintStatus(
  sprintStatusPath: string,
  storiesDir: string
): BmadProject {
  const raw = fs.readFileSync(sprintStatusPath, 'utf-8');

  // sprint-status.yaml has two YAML documents separated by a repeated header block;
  // we only need the second document which contains development_status
  const docs = yaml.loadAll(raw) as RawSprintStatus[];
  const statusDoc = docs.find((d) => d && d.development_status) as RawSprintStatus | undefined;

  if (!statusDoc) {
    throw new Error(`Could not find development_status block in ${sprintStatusPath}`);
  }

  const devStatus = statusDoc.development_status;
  const epicMap: Record<string, Epic> = {};
  const storyIds: string[] = [];

  for (const [key, status] of Object.entries(devStatus)) {
    if (RETROSPECTIVE_PATTERN.test(key)) continue;

    if (EPIC_KEY_PATTERN.test(key)) {
      epicMap[key] = {
        id: key,
        title: `Epic ${key.split('-')[1]}`,
        status: status as EpicStatus,
      };
    } else if (STORY_KEY_PATTERN.test(key)) {
      storyIds.push(key);
    }
  }

  const stories: Story[] = storyIds.map((id) => {
    const storyStatus = devStatus[id] as StoryStatus;
    const filePath = path.join(storiesDir, `${id}.md`);
    const epicId = epicIdFromStoryId(id);

    let title = titleFromId(id);
    let description = '';
    let acceptanceCriteria: string[] = [];
    let fullContent = '';

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      fullContent = content;
      const parsed = parseStoryFile(content);
      title = parsed.title || title;
      description = parsed.description;
      acceptanceCriteria = parsed.acceptanceCriteria;
    }

    return { id, epicId, title, status: storyStatus, description, acceptanceCriteria, filePath, fullContent };
  });

  return {
    epics: Object.values(epicMap),
    stories,
  };
}

function parseStoryFile(content: string): {
  title: string;
  description: string;
  acceptanceCriteria: string[];
} {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  const acceptanceCriteria: string[] = [];

  // First H1 heading is the title (skip frontmatter)
  const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const titleLine = lines.find((l) => l.startsWith('# '));
  if (titleLine) {
    title = titleLine.replace(/^#\s+/, '').trim();
  }

  // Extract the "Story Foundation" section (supports both "## Story" and "## Story Foundation")
  const storySection = extractSection(content, '## Story Foundation') || extractSection(content, '## Story');
  if (storySection) {
    description = storySection.trim();
  }

  // Extract Acceptance Criteria - support both BDD style (### AC-1:) and numbered lists
  const acSection = extractSection(content, '## Acceptance Criteria') || 
                    extractSection(content, '## Acceptance Criteria (BDD)');
  if (acSection) {
    // Try BDD format first: ### AC-1: Title followed by Gherkin
    const bddMatches = acSection.match(/###\s+AC-\d+:.*/g);
    if (bddMatches) {
      // Extract each AC block by matching the AC headers and capturing content after them
      for (const match of bddMatches) {
        const acTitle = match.replace('### ', '').trim();
        const acIndex = acSection.indexOf(match);
        const nextAcMatch = acSection.slice(acIndex + match.length).match(/###\s+AC-\d+:/);
        const nextAcIndex = nextAcMatch ? acSection.indexOf(nextAcMatch[0], acIndex + match.length) : -1;
        const acContent = acSection.slice(
          acIndex + match.length,
          nextAcIndex > 0 ? nextAcIndex : undefined
        );
        const cleanContent = acContent
          .replace(/```gherkin\n?/g, '')
          .replace(/```/g, '')
          .trim();
        if (cleanContent) {
          acceptanceCriteria.push(`${acTitle} ${cleanContent}`.replace(/\n/g, ' '));
        }
      }
    } else {
      // Fall back to numbered items (1. 2. 3.)
      const acLines = acSection.split('\n').filter((l) => /^\d+\./.test(l.trim()));
      acceptanceCriteria.push(...acLines.map((l) => l.replace(/^\d+\.\s*/, '').trim()));
    }
  }

  return { title, description, acceptanceCriteria };
}

function extractSection(content: string, heading: string): string {
  const headingIndex = content.indexOf(heading);
  if (headingIndex === -1) return '';

  const start = headingIndex + heading.length;
  // Find the next ## heading
  const nextHeading = content.indexOf('\n## ', start);
  const end = nextHeading === -1 ? content.length : nextHeading;
  return content.slice(start, end).trim();
}
