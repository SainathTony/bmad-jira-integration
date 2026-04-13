import { TrelloProvider } from '../TrelloProvider';
import { TrelloClient } from '../TrelloClient';
import { Story, SyncConfig } from '../../types';

// Mock the TrelloClient
jest.mock('../TrelloClient');

const MockedTrelloClient = TrelloClient as jest.MockedClass<typeof TrelloClient>;

describe('TrelloProvider', () => {
  let mockConfig: SyncConfig;
  let provider: TrelloProvider;
  let mockCreateCard: jest.Mock;
  let mockCreateLabel: jest.Mock;
  let mockMoveCard: jest.Mock;
  let mockGetLists: jest.Mock;
  let mockGetLabels: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock functions
    mockGetLists = jest.fn().mockResolvedValue([
      { id: 'list-1', name: 'Backlog' },
      { id: 'list-2', name: 'Ready for Dev' },
      { id: 'list-3', name: 'In Progress' },
    ]);
    mockGetLabels = jest.fn().mockResolvedValue([]);
    mockCreateLabel = jest.fn().mockResolvedValue({ id: 'label-1', name: 'Epic 1' });
    mockCreateCard = jest.fn().mockResolvedValue({ id: 'card-1', name: 'Test Card' });
    mockMoveCard = jest.fn().mockResolvedValue(undefined);
    
    // Reset mock implementation
    MockedTrelloClient.mockImplementation(() => ({
      getLists: mockGetLists,
      getLabels: mockGetLabels,
      createLabel: mockCreateLabel,
      createCard: mockCreateCard,
      moveCard: mockMoveCard,
    } as unknown as TrelloClient));
    
    mockConfig = {
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
          'backlog': 'Backlog',
          'ready-for-dev': 'Ready for Dev',
          'in-progress': 'In Progress',
          'review': 'Review',
          'done': 'Done',
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

    provider = new TrelloProvider(mockConfig);
  });

  describe('createStory', () => {
    it('should create a card with full description when fullContent is available', async () => {
      const mockStory: Story = {
        id: '1-1-unified-hk-status-multi-selection',
        epicId: 'epic-1',
        title: 'Unified HK Status Multi-Selection',
        status: 'ready-for-dev',
        description: 'As a Housekeeping Manager, I want to select multiple rooms...',
        acceptanceCriteria: [
          'Given I am viewing the Room Status Dashboard When I activate multi-selection mode Then I can select rooms that share the same HK Status',
          'Given I have selected rooms across multiple occupancy types When I attempt a bulk action Then the system allows the action',
        ],
        filePath: '_bmad-output/implementation-artifacts/1-1-unified-hk-status-multi-selection.md',
        fullContent: `---
story_id: 1.1
---

# Story 1.1: Unified HK Status Multi-Selection

## Story Foundation

**As a** Housekeeping Manager,
**I want** to select multiple rooms with the same HK Status,
**So that** I can process them simultaneously.

## Business Context

This story enables managers to perform bulk operations.

## Acceptance Criteria (BDD)

### AC-1: Unified HK Status Selection
Given I am viewing the Room Status Dashboard
When I activate multi-selection mode
Then I can select rooms

### AC-2: Cross-Occupancy Bulk Actions
Given I have selected rooms
When I attempt a bulk action
Then the system allows the action
`,
      };

      const result = await provider.createStory(mockStory, 'label-1');

      expect(result.itemId).toBe('card-1');
      
      // Verify createCard was called with correct arguments
      expect(mockCreateCard).toHaveBeenCalledWith(
        'list-2', // Ready for Dev list ID
        'Unified HK Status Multi-Selection',
        expect.stringContaining('## Story'),
        ['label-1']
      );
      
      // Verify the description contains all key parts
      const description = mockCreateCard.mock.calls[0][2];
      expect(description).toContain('## Story');
      expect(description).toContain('As a Housekeeping Manager');
      expect(description).toContain('## Acceptance Criteria');
      expect(description).toContain('1. Given I am viewing the Room Status Dashboard');
      expect(description).toContain('2. Given I have selected rooms');
      expect(description).toContain('---');
      expect(description).toContain('**Full Story:** _bmad-output/implementation-artifacts/1-1-unified-hk-status-multi-selection.md');
    });

    it('should create a card with basic description when fullContent is not available', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        // fullContent not provided
      };

      await provider.createStory(mockStory, undefined);

      const description = mockCreateCard.mock.calls[0][2];
      
      // Basic format without full content markers
      expect(description).toContain('As a User, I want a feature');
      expect(description).toContain('**Acceptance Criteria**');
      expect(description).toContain('1. Criteria 1');
      expect(description).toContain('2. Criteria 2');
      expect(description).not.toContain('## Story');
      expect(description).not.toContain('---');
    });

    it('should handle story with empty acceptance criteria', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: 'As a User, I want a feature',
        acceptanceCriteria: [],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Test Story\n\n## Story Foundation\n\nAs a User, I want a feature',
      };

      await provider.createStory(mockStory, undefined);

      const description = mockCreateCard.mock.calls[0][2];
      
      expect(description).toContain('## Story');
      expect(description).toContain('As a User, I want a feature');
      expect(description).not.toContain('## Acceptance Criteria');
    });

    it('should handle story with empty description', async () => {
      const mockStory: Story = {
        id: '1-1-test-story',
        epicId: 'epic-1',
        title: 'Test Story',
        status: 'backlog',
        description: '',
        acceptanceCriteria: ['Criteria 1'],
        filePath: '_bmad-output/implementation-artifacts/1-1-test-story.md',
        fullContent: '# Test Story\n\n## Acceptance Criteria\n\n1. Criteria 1',
      };

      await provider.createStory(mockStory, undefined);

      const description = mockCreateCard.mock.calls[0][2];
      
      // Should still show acceptance criteria
      expect(description).toContain('## Acceptance Criteria');
      expect(description).toContain('1. Criteria 1');
    });
  });

  describe('createEpic', () => {
    it('should create a label for the epic', async () => {
      const epic = {
        id: 'epic-1',
        title: 'Epic 1',
        status: 'in-progress' as const,
      };

      const result = await provider.createEpic(epic);

      expect(result.itemId).toBe('label-1');
      expect(mockCreateLabel).toHaveBeenCalledWith('test-board-id', 'Epic 1', 0);
    });

    it('should return existing label if epic label already exists', async () => {
      // Mock that the label already exists
      MockedTrelloClient.mockImplementation(() => ({
        getLists: jest.fn().mockResolvedValue([]),
        getLabels: jest.fn().mockResolvedValue([{ id: 'existing-label', name: 'Epic 1' }]),
        createLabel: jest.fn(),
        createCard: jest.fn(),
        moveCard: jest.fn(),
      } as unknown as TrelloClient));

      const epicProvider = new TrelloProvider(mockConfig);
      const epic = {
        id: 'epic-1',
        title: 'Epic 1',
        status: 'in-progress' as const,
      };

      const result = await epicProvider.createEpic(epic);

      expect(result.itemId).toBe('existing-label');
      expect(mockCreateLabel).not.toHaveBeenCalled();
    });
  });

  describe('transitionItem', () => {
    it('should move card to correct list based on status', async () => {
      const result = await provider.transitionItem('card-123', 'in-progress');

      expect(result).toBe(true);
      expect(mockMoveCard).toHaveBeenCalledWith('card-123', 'list-3'); // In Progress list
    });

    it('should return false if list not found', async () => {
      const result = await provider.transitionItem('card-123', 'unknown-status');

      expect(result).toBe(false);
      expect(mockMoveCard).not.toHaveBeenCalled();
    });
  });
});
