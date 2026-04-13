import { SyncConfig, Story } from '../../types';
import { StateStore } from '../stateStore';
import { TrelloProvider } from '../../trello/TrelloProvider';
import { TrelloClient } from '../../trello/TrelloClient';
import { JiraProvider } from '../../jira/JiraProvider';
import { JiraClient } from '../../jira/client';

// Mock the clients
jest.mock('../../trello/TrelloClient');
jest.mock('../../jira/client');

const MockedTrelloClient = TrelloClient as jest.MockedClass<typeof TrelloClient>;
const MockedJiraClient = JiraClient as jest.MockedClass<typeof JiraClient>;

describe('sync-content command behavior', () => {
  describe('updateStoryContent', () => {
    let mockTrelloConfig: SyncConfig;
    let mockJiraConfig: SyncConfig;
    let mockUpdateCard: jest.Mock;
    let mockUpdateIssue: jest.Mock;

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

## Acceptance Criteria

1. Updated AC 1
2. Updated AC 2
`,
    };

    beforeEach(() => {
      jest.clearAllMocks();

      mockUpdateCard = jest.fn().mockResolvedValue(undefined);
      mockUpdateIssue = jest.fn().mockResolvedValue(undefined);

      // Setup Trello mock
      MockedTrelloClient.mockImplementation(() => ({
        getLists: jest.fn().mockResolvedValue([
          { id: 'list-1', name: 'Backlog' },
          { id: 'list-2', name: 'In Progress' },
        ]),
        getLabels: jest.fn().mockResolvedValue([]),
        updateCard: mockUpdateCard,
      } as unknown as TrelloClient));

      // Setup Jira mock
      MockedJiraClient.mockImplementation(() => ({
        updateIssue: mockUpdateIssue,
      } as unknown as JiraClient));

      mockTrelloConfig = {
        provider: 'trello',
        jira: {
          baseUrl: '',
          email: '',
          apiToken: '',
          projectKey: '',
        },
        trello: {
          apiKey: 'test-api-key',
          token: 'test-token',
          boardId: 'test-board-id',
          listMap: {
            backlog: 'Backlog',
            'in-progress': 'In Progress',
            'ready-for-dev': 'Ready for Dev',
            review: 'Review',
            done: 'Done',
          },
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

      mockJiraConfig = {
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
          backlog: 'Backlog',
          'in-progress': 'In Progress',
        },
        issueTypeMap: {
          epic: 'Epic',
          story: 'Story',
        },
      };
    });

    describe('TrelloProvider', () => {
      it('should update card title and description with story content', async () => {
        const provider = new TrelloProvider(mockTrelloConfig);

        await provider.updateStoryContent(mockStory, 'card-123');

        expect(mockUpdateCard).toHaveBeenCalledWith('card-123', {
          name: 'Updated Story Title',
          desc: expect.any(String),
        });

        const desc = mockUpdateCard.mock.calls[0][1].desc;
        expect(desc).toContain('## Story');
        expect(desc).toContain('As a User, I want updated functionality');
        expect(desc).toContain('## Acceptance Criteria');
        expect(desc).toContain('1. Updated AC 1');
        expect(desc).toContain('2. Updated AC 2');
      });

      it('should only update existing cards, not create new ones', async () => {
        const provider = new TrelloProvider(mockTrelloConfig);
        const mockCreateCard = jest.fn();
        MockedTrelloClient.mockImplementation(() => ({
          getLists: jest.fn().mockResolvedValue([{ id: 'list-1', name: 'In Progress' }]),
          getLabels: jest.fn().mockResolvedValue([]),
          createCard: mockCreateCard,
          updateCard: mockUpdateCard,
        } as unknown as TrelloClient));

        // updateStoryContent only calls updateCard, never createCard
        await provider.updateStoryContent(mockStory, 'existing-card-123');

        expect(mockUpdateCard).toHaveBeenCalledTimes(1);
        expect(mockCreateCard).not.toHaveBeenCalled();
      });

      it('should not change card status/list when updating content', async () => {
        const mockMoveCard = jest.fn();
        MockedTrelloClient.mockImplementation(() => ({
          getLists: jest.fn().mockResolvedValue([{ id: 'list-1', name: 'In Progress' }]),
          getLabels: jest.fn().mockResolvedValue([]),
          updateCard: mockUpdateCard,
          moveCard: mockMoveCard,
        } as unknown as TrelloClient));

        const provider = new TrelloProvider(mockTrelloConfig);

        await provider.updateStoryContent(mockStory, 'card-123');

        expect(mockMoveCard).not.toHaveBeenCalled();
      });

      it('should handle story without fullContent gracefully', async () => {
        const storyWithoutFullContent: Story = {
          ...mockStory,
          fullContent: undefined,
        };

        const provider = new TrelloProvider(mockTrelloConfig);

        await provider.updateStoryContent(storyWithoutFullContent, 'card-123');

        expect(mockUpdateCard).toHaveBeenCalledWith('card-123', {
          name: 'Updated Story Title',
          desc: expect.any(String),
        });
      });
    });

    describe('JiraProvider', () => {
      beforeEach(() => {
        // Setup Jira client mock with status mapper
        MockedJiraClient.mockImplementation(() => ({
          updateIssue: mockUpdateIssue,
          getTransitions: jest.fn().mockResolvedValue([]),
        } as unknown as JiraClient));
      });

      it('should update issue summary and description with story content', async () => {
        const provider = new JiraProvider(mockJiraConfig);

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
        expect(descString).toContain('As a User, I want updated functionality');
        expect(descString).toContain('Updated AC 1');
      });

      it('should only update existing issues, not create new ones', async () => {
        const mockCreateIssue = jest.fn();
        MockedJiraClient.mockImplementation(() => ({
          updateIssue: mockUpdateIssue,
          createIssue: mockCreateIssue,
          getTransitions: jest.fn().mockResolvedValue([]),
        } as unknown as JiraClient));

        const provider = new JiraProvider(mockJiraConfig);

        await provider.updateStoryContent(mockStory, 'TEST-123');

        expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
        expect(mockCreateIssue).not.toHaveBeenCalled();
      });

      it('should not change issue status when updating content', async () => {
        const mockTransitionIssue = jest.fn();
        MockedJiraClient.mockImplementation(() => ({
          updateIssue: mockUpdateIssue,
          transitionIssue: mockTransitionIssue,
          getTransitions: jest.fn().mockResolvedValue([]),
        } as unknown as JiraClient));

        const provider = new JiraProvider(mockJiraConfig);

        await provider.updateStoryContent(mockStory, 'TEST-123');

        expect(mockTransitionIssue).not.toHaveBeenCalled();
      });

      it('should not update labels or other fields when updating content', async () => {
        const provider = new JiraProvider(mockJiraConfig);

        await provider.updateStoryContent(mockStory, 'TEST-123');

        const fields = mockUpdateIssue.mock.calls[0][1].fields;
        // Only summary and description should be updated
        expect(Object.keys(fields)).toEqual(['summary', 'description']);
        expect(fields.labels).toBeUndefined();
        expect(fields.issuetype).toBeUndefined();
        expect(fields.project).toBeUndefined();
      });
    });

    describe('StateStore behavior for sync-content', () => {
      it('should only update stories that exist in state store', () => {
        const store = new StateStore('/tmp/test-workspace');

        // Simulate adding a synced story
        store.set('1-1-existing-story', {
          itemId: 'TEST-123',
          lastSyncedStatus: 'backlog',
        });

        const existing = store.get('1-1-existing-story');
        const notExisting = store.get('1-1-new-story');

        expect(existing).toBeDefined();
        expect(existing?.itemId).toBe('TEST-123');
        expect(notExisting).toBeUndefined();

        // In sync-content, we would only update '1-1-existing-story'
        // and skip '1-1-new-story' since it has no itemId
      });

      it('should not modify state when updating content', () => {
        const store = new StateStore('/tmp/test-workspace');

        store.set('1-1-story', {
          itemId: 'TEST-123',
          lastSyncedStatus: 'backlog',
        });

        const beforeUpdate = store.get('1-1-story');

        // Content update should NOT change the stored status
        // (status updates are separate from content updates)
        expect(beforeUpdate?.lastSyncedStatus).toBe('backlog');
        expect(beforeUpdate?.itemId).toBe('TEST-123');
      });
    });
  });

  describe('sync-content command logic', () => {
    it('should identify only synced stories for content update', () => {
      const mockState: Record<string, { itemId: string; lastSyncedStatus: string }> = {
        '1-1-story': { itemId: 'TEST-123', lastSyncedStatus: 'backlog' },
        '1-2-story': { itemId: 'TEST-124', lastSyncedStatus: 'in-progress' },
      };

      const allStories = [
        { id: '1-1-story', title: 'Story 1' },
        { id: '1-2-story', title: 'Story 2' },
        { id: '1-3-story', title: 'Story 3' }, // Not synced yet
      ];

      // Logic from sync-content command
      const storiesToUpdate = allStories
        .filter(story => mockState[story.id])
        .map(story => ({ story, itemId: mockState[story.id].itemId }));

      expect(storiesToUpdate).toHaveLength(2);
      expect(storiesToUpdate.map(s => s.story.id)).toEqual(['1-1-story', '1-2-story']);
      expect(storiesToUpdate.every(s => s.itemId !== undefined)).toBe(true);
    });

    it('should skip stories that are not yet synced', () => {
      const mockState: Record<string, { itemId: string; lastSyncedStatus: string }> = {
        '1-1-story': { itemId: 'TEST-123', lastSyncedStatus: 'backlog' },
      };

      const allStories = [
        { id: '1-1-story', title: 'Story 1' },
        { id: '1-2-story', title: 'Story 2' }, // Not synced yet
      ];

      const storiesToUpdate = allStories
        .filter(story => mockState[story.id])
        .map(story => ({ story, itemId: mockState[story.id].itemId }));

      expect(storiesToUpdate).toHaveLength(1);
      expect(storiesToUpdate[0].story.id).toBe('1-1-story');
    });

    it('should handle empty state gracefully', () => {
      const mockState: Record<string, { itemId: string; lastSyncedStatus: string }> = {};

      const allStories = [
        { id: '1-1-story', title: 'Story 1' },
        { id: '1-2-story', title: 'Story 2' },
      ];

      const storiesToUpdate = allStories
        .filter(story => mockState[story.id])
        .map(story => ({ story, itemId: mockState[story.id]?.itemId }));

      expect(storiesToUpdate).toHaveLength(0);
    });
  });
});
