import { JiraProvider } from '../JiraProvider';
import { JiraClient } from '../client';
import { Story, SyncConfig } from '../../types';

// Mock the JiraClient
jest.mock('../client');

const MockedJiraClient = JiraClient as jest.MockedClass<typeof JiraClient>;

describe('JiraProvider', () => {
  let mockConfig: SyncConfig;
  let provider: JiraProvider;
  let mockCreateIssue: jest.Mock;
  let mockUpdateIssue: jest.Mock;
  let mockGetTransitions: jest.Mock;
  let mockTransitionIssue: jest.Mock;
  let mockFindTransitionId: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock functions
    mockCreateIssue = jest.fn().mockResolvedValue({
      id: 'issue-123',
      key: 'TEST-123',
      fields: { summary: 'Test Issue' },
    });
    mockUpdateIssue = jest.fn().mockResolvedValue(undefined);
    mockGetTransitions = jest.fn().mockResolvedValue([
      { id: 'trans-1', name: 'To Do', to: { name: 'To Do' } },
      { id: 'trans-2', name: 'In Progress', to: { name: 'In Progress' } },
      { id: 'trans-3', name: 'Done', to: { name: 'Done' } },
    ]);
    mockTransitionIssue = jest.fn().mockResolvedValue(undefined);
    mockFindTransitionId = jest.fn().mockImplementation((_key: string, status: string) => {
      const transitions: Record<string, string> = {
        'to do': 'trans-1',
        'in progress': 'trans-2',
        'done': 'trans-3',
      };
      return transitions[status.toLowerCase()] || null;
    });

    // Reset mock implementation
    MockedJiraClient.mockImplementation(() => ({
      createIssue: mockCreateIssue,
      updateIssue: mockUpdateIssue,
      getTransitions: mockGetTransitions,
      transitionIssue: mockTransitionIssue,
      findTransitionId: mockFindTransitionId,
    } as unknown as JiraClient));

    mockConfig = {
      provider: 'jira',
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
      statusMap: {
        backlog: 'To Do',
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

    provider = new JiraProvider(mockConfig);
  });

  describe('updateStoryContent', () => {
    it('should update existing issue title and description without creating new issue', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'in-progress',
        description: 'As a User, I want updated functionality',
        acceptanceCriteria: ['Updated AC 1', 'Updated AC 2'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: `# Updated Story Title

## Story Foundation

As a User, I want updated functionality

## Acceptance Criteria (BDD)

### AC-1: First Criteria
Given I am a user
When I do something
Then I expect results

### AC-2: Second Criteria
Given I am a user
When I do another thing
Then I expect other results
`,
      };

      await provider.updateStoryContent(mockStory, 'TEST-123');

      // Should only update, not create
      expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
      expect(mockCreateIssue).not.toHaveBeenCalled();

      // Verify update was called with correct arguments
      expect(mockUpdateIssue).toHaveBeenCalledWith('TEST-123', {
        fields: {
          summary: 'Updated Story Title',
          description: expect.any(Object),
        },
      });

      const summary = mockUpdateIssue.mock.calls[0][1].fields.summary;
      const description = mockUpdateIssue.mock.calls[0][1].fields.description;
      const descString = JSON.stringify(description);
      expect(summary).toBe('Updated Story Title');
      expect(descString).toContain('As a User, I want updated functionality');
      expect(descString).toContain('Updated AC 1');
    });

    it('should NOT change issue status when updating content', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'in-progress',
        description: 'As a User, I want updated functionality',
        acceptanceCriteria: ['Updated AC 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      await provider.updateStoryContent(mockStory, 'TEST-123');

      // transitionIssue should never be called during content update
      expect(mockTransitionIssue).not.toHaveBeenCalled();
      expect(mockGetTransitions).not.toHaveBeenCalled();
    });

    it('should NOT update labels, parent, project, or issue type when updating content', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'in-progress',
        description: 'As a User, I want updated functionality',
        acceptanceCriteria: ['Updated AC 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      await provider.updateStoryContent(mockStory, 'TEST-123');

      // Only summary and description should be in the update payload
      const fields = mockUpdateIssue.mock.calls[0][1].fields;
      expect(Object.keys(fields)).toEqual(['summary', 'description']);
      expect(fields.labels).toBeUndefined();
      expect(fields.issuetype).toBeUndefined();
      expect(fields.project).toBeUndefined();
      expect(fields.parent).toBeUndefined();
    });

    it('should handle story without fullContent gracefully', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: ['Criteria 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        // fullContent not provided
      };

      await provider.updateStoryContent(mockStory, 'TEST-123');

      expect(mockUpdateIssue).toHaveBeenCalledWith('TEST-123', {
        fields: {
          summary: 'Updated Story Title',
          description: expect.any(Object),
        },
      });

      const summary = mockUpdateIssue.mock.calls[0][1].fields.summary;
      const description = mockUpdateIssue.mock.calls[0][1].fields.description;
      const descString = JSON.stringify(description);
      expect(summary).toBe('Updated Story Title');
      expect(descString).toContain('As a User, I want a feature');
    });

    it('should handle story with empty acceptance criteria', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: [],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      await provider.updateStoryContent(mockStory, 'TEST-123');

      const summary = mockUpdateIssue.mock.calls[0][1].fields.summary;
      const description = mockUpdateIssue.mock.calls[0][1].fields.description;
      const descString = JSON.stringify(description);
      expect(summary).toBe('Updated Story Title');
      expect(descString).toContain('As a User, I want a feature');
      // Should not contain acceptance criteria section when empty
      expect(descString).not.toContain('Acceptance Criteria');
    });

    it('should overwrite existing content without checking for changes', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: ['Criteria 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      // Call updateStoryContent twice with the same story
      await provider.updateStoryContent(mockStory, 'TEST-123');
      await provider.updateStoryContent(mockStory, 'TEST-123');

      // Should call updateIssue both times (no change detection)
      expect(mockUpdateIssue).toHaveBeenCalledTimes(2);
    });

    it('should throw error if updateIssue fails', async () => {
      mockUpdateIssue.mockRejectedValueOnce(new Error('Jira API error: 403 Forbidden'));

      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: [],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      await expect(provider.updateStoryContent(mockStory, 'TEST-123')).rejects.toThrow('Jira API error: 403 Forbidden');
    });
  });

  describe('createStory vs updateStoryContent distinction', () => {
    it('createStory should create a new issue with all fields', async () => {
      const mockStory: Story = {
        id: '1-1-new-story',
        epicId: 'epic-1',
        title: 'New Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: ['Criteria 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-new-story.md',
        fullContent: '# New Story Title',
      };

      await provider.createStory(mockStory, 'EPIC-1');

      // Should call createIssue with full payload including project, issuetype, labels
      expect(mockCreateIssue).toHaveBeenCalledTimes(1);
      const payload = mockCreateIssue.mock.calls[0][0];
      expect(payload.fields.project.key).toBe('TEST');
      expect(payload.fields.issuetype.name).toBe('Story');
      expect(payload.fields.summary).toBe('New Story Title');
      expect(payload.fields.labels).toContain('bmad-story');
      expect(payload.fields.parent.key).toBe('EPIC-1');
    });

    it('updateStoryContent should NOT create a new issue even if itemId is wrong', async () => {
      mockUpdateIssue.mockRejectedValueOnce(new Error('Issue does not exist'));

      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Updated Story Title',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: [],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Updated Story Title',
      };

      // Should throw error rather than trying to create
      await expect(provider.updateStoryContent(mockStory, 'NONEXISTENT-123')).rejects.toThrow('Issue does not exist');
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });
  });
});
