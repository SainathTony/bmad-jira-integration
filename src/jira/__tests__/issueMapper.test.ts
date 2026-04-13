import { storyToJiraPayload, epicToJiraPayload } from '../issueMapper';
import { Story, Epic, SyncConfig } from '../../types';

describe('issueMapper', () => {
  const mockConfig: SyncConfig = {
    jira: {
      baseUrl: 'https://test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
      projectKey: 'TEST',
    },
    bmad: {
      sprintStatusFile: '',
      storiesDir: '',
      epicsFile: '',
    },
    statusMap: {},
    issueTypeMap: {
      epic: 'Epic',
      story: 'Story',
    },
  };

  describe('storyToJiraPayload', () => {
    it('should create Jira payload with full content reference', () => {
      const story: Story = {
        id: '1-1-unified-hk-status-multi-selection',
        epicId: 'epic-1',
        title: 'Unified HK Status Multi-Selection',
        status: 'ready-for-dev',
        description: 'As a Housekeeping Manager, I want to select multiple rooms...',
        acceptanceCriteria: [
          'Given I am viewing the Room Status Dashboard When I activate multi-selection mode Then I can select rooms',
          'Given I have selected rooms When I attempt a bulk action Then the system allows the action',
        ],
        filePath: '_bmad-output/implementation-artifacts/1-1-unified-hk-status-multi-selection.md',
        fullContent: '# Full story content here',
      };

      const payload = storyToJiraPayload(story, 'EPIC-1', mockConfig);

      expect(payload.fields.project.key).toBe('TEST');
      expect(payload.fields.summary).toBe('Unified HK Status Multi-Selection');
      expect(payload.fields.issuetype.name).toBe('Story');
      expect(payload.fields.labels).toContain('bmad-story');
      expect(payload.fields.labels).toContain('bmad-epic-1');
      expect(payload.fields.labels).toContain('bmad-id-1-1-unified-hk-status-multi-selection');
      expect(payload.fields.parent).toEqual({ key: 'EPIC-1' });

      // Verify description contains all sections
      const description = JSON.stringify(payload.fields.description);
      expect(description).toContain('h2. Story');
      expect(description).toContain('As a Housekeeping Manager');
      expect(description).toContain('Acceptance Criteria');
      expect(description).toContain('Given I am viewing the Room Status Dashboard');
      expect(description).toContain('Full story document');
      expect(description).toContain('_bmad-output/implementation-artifacts/1-1-unified-hk-status-multi-selection.md');
    });

    it('should create Jira payload without full content', () => {
      const story: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: ['Criteria 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        // fullContent not provided
      };

      const payload = storyToJiraPayload(story, undefined, mockConfig);

      expect(payload.fields.summary).toBe('Test Story');
      expect(payload.fields.parent).toBeUndefined();

      const description = JSON.stringify(payload.fields.description);
      expect(description).toContain('As a User, I want a feature');
      expect(description).toContain('Acceptance Criteria');
      expect(description).toContain('Criteria 1');
      // Should not contain full content reference
      expect(description).not.toContain('Full story document');
    });

    it('should handle story with empty description', () => {
      const story: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: '',
        acceptanceCriteria: [],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Test Story',
      };

      const payload = storyToJiraPayload(story, undefined, mockConfig);

      // Should still include full content reference
      const description = JSON.stringify(payload.fields.description);
      expect(description).toContain('Full story document');
    });

    it('should use custom issue type from config', () => {
      const customConfig: SyncConfig = {
        ...mockConfig,
        issueTypeMap: {
          epic: 'Custom Epic',
          story: 'Custom Story',
        },
      };

      const story: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: 'Test description',
        acceptanceCriteria: [],
        filePath: 'test.md',
      };

      const payload = storyToJiraPayload(story, undefined, customConfig);

      expect(payload.fields.issuetype.name).toBe('Custom Story');
    });

    it('should format acceptance criteria with numbered list', () => {
      const story: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: 'Test description',
        acceptanceCriteria: [
          'First criteria with Given When Then',
          'Second criteria with multiple conditions',
          'Third criteria',
        ],
        filePath: 'test.md',
      };

      const payload = storyToJiraPayload(story, undefined, mockConfig);

      const description = JSON.stringify(payload.fields.description);
      expect(description).toContain('1. First criteria with Given When Then');
      expect(description).toContain('2. Second criteria with multiple conditions');
      expect(description).toContain('3. Third criteria');
    });
  });

  describe('epicToJiraPayload', () => {
    it('should create epic payload with correct structure', () => {
      const epic: Epic = {
        id: 'epic-1',
        title: 'Enhanced Bulk Operations',
        status: 'in-progress',
      };

      const payload = epicToJiraPayload(epic, mockConfig);

      expect(payload.fields.project.key).toBe('TEST');
      expect(payload.fields.summary).toBe('Enhanced Bulk Operations');
      expect(payload.fields.issuetype.name).toBe('Epic');
      expect(payload.fields.labels).toContain('bmad-epic');
      expect(payload.fields.labels).toContain('bmad-epic-1');
    });

    it('should include epic ID and status in description', () => {
      const epic: Epic = {
        id: 'epic-1',
        title: 'Test Epic',
        status: 'in-progress',
      };

      const payload = epicToJiraPayload(epic, mockConfig);

      const description = JSON.stringify(payload.fields.description);
      expect(description).toContain('BMAD Epic: epic-1');
      expect(description).toContain('Status: in-progress');
    });

    it('should use custom epic issue type from config', () => {
      const customConfig: SyncConfig = {
        ...mockConfig,
        issueTypeMap: {
          epic: 'Custom Epic Type',
          story: 'Story',
        },
      };

      const epic: Epic = {
        id: 'epic-1',
        title: 'Test Epic',
        status: 'backlog',
      };

      const payload = epicToJiraPayload(epic, customConfig);

      expect(payload.fields.issuetype.name).toBe('Custom Epic Type');
    });
  });
});
