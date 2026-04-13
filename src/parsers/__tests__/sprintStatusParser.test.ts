import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { parseSprintStatus } from '../sprintStatusParser';
import { Story, StoryStatus } from '../../types';

// Mock fs and js-yaml
jest.mock('fs');
jest.mock('js-yaml');

describe('parseSprintStatus', () => {
  const mockSprintStatusPath = '/mock/sprint-status.yaml';
  const mockStoriesDir = '/mock/stories';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Story Foundation section extraction', () => {
    it('should extract Story Foundation section as description', () => {
      const storyContent = `---
story_id: 1.1
epic: 1
---

# Story 1.1: Unified HK Status Multi-Selection

## Story Foundation

**As a** Housekeeping Manager,
**I want** to select multiple rooms,
**So that** I can process them simultaneously.

## Business Context

Some business context here.

## Acceptance Criteria

1. First criteria
2. Second criteria
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          'epic-1': 'in-progress',
          '1-1-unified-hk-status-multi-selection': 'ready-for-dev',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].description).toContain('**As a** Housekeeping Manager');
      expect(result.stories[0].description).toContain('**I want** to select multiple rooms');
    });

    it('should fall back to ## Story section if ## Story Foundation not found', () => {
      const storyContent = `---
story_id: 1.1
---

# Story 1.1: Test Story

## Story

**As a** User,
**I want** a feature,
**So that** I can do something.

## Acceptance Criteria

1. Criteria one
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-test-story': 'backlog',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].description).toContain('**As a** User');
    });
  });

  describe('BDD-style Acceptance Criteria extraction', () => {
    it('should extract BDD-style AC from ### AC-1: headers', () => {
      const storyContent = `---
story_id: 1.1
---

# Story 1.1: Test Story

## Story Foundation

**As a** User,
**I want** a feature,
**So that** I can do something.

## Acceptance Criteria (BDD)

### AC-1: Unified HK Status Selection
\`\`\`gherkin
Given I am viewing the Room Status Dashboard
When I activate multi-selection mode
Then I can select rooms that share the same HK Status
\`\`\`

### AC-2: Cross-Occupancy Bulk Actions
\`\`\`gherkin
Given I have selected rooms across multiple occupancy types
When I attempt a bulk action
Then the system allows the action if HK status matches
\`\`\`
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-test-story': 'backlog',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].acceptanceCriteria).toHaveLength(2);
      expect(result.stories[0].acceptanceCriteria).toHaveLength(2);
      // AC blocks contain the full text including the title
      expect(result.stories[0].acceptanceCriteria[0]).toContain('Unified HK Status Selection');
      expect(result.stories[0].acceptanceCriteria[1]).toContain('Cross-Occupancy Bulk Actions');
    });

    it('should fall back to numbered list format for AC', () => {
      const storyContent = `---
story_id: 1.1
---

# Story 1.1: Test Story

## Story Foundation

**As a** User,
**I want** a feature.

## Acceptance Criteria

1. First criteria item
2. Second criteria item
3. Third criteria item
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-test-story': 'backlog',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].acceptanceCriteria).toHaveLength(3);
      expect(result.stories[0].acceptanceCriteria[0]).toBe('First criteria item');
      expect(result.stories[0].acceptanceCriteria[1]).toBe('Second criteria item');
    });
  });

  describe('Full content capture', () => {
    it('should capture full story content in fullContent field', () => {
      const storyContent = `---
story_id: 1.1
epic: 1
epic_title: Enhanced Bulk Operations
---

# Story 1.1: Unified HK Status Multi-Selection

## Story Foundation

**As a** Housekeeping Manager,
**I want** to select multiple rooms,
**So that** I can process them simultaneously.

## Business Context

This story enables managers to perform bulk operations.

## Current Implementation Analysis

### What Already Exists
- Room Selection Base
- Selection State

### What's Missing
- Unified HK status selection logic

## Technical Requirements

### Frontend Changes
- Add selectionMode state
- Modify handleRoomSelection

### Backend Changes

No backend changes required.

## Acceptance Criteria (BDD)

### AC-1: Unified HK Status Selection
\`\`\`gherkin
Given I am viewing the Room Status Dashboard
When I activate multi-selection mode
Then I can select rooms that share the same HK Status
\`\`\`

## Testing Requirements

### Unit Tests
- Selection Logic Tests
- Component Tests

### E2E Tests
- A1: Unified HK status selection works
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-unified-hk-status-multi-selection': 'ready-for-dev',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].fullContent).toBe(storyContent);
      expect(result.stories[0].fullContent).toContain('## Business Context');
      expect(result.stories[0].fullContent).toContain('## Technical Requirements');
      expect(result.stories[0].fullContent).toContain('## Testing Requirements');
    });
  });

  describe('Title extraction', () => {
    it('should extract title from H1 heading', () => {
      const storyContent = `---
story_id: 1.1
---

# Story 1.1: Unified HK Status Multi-Selection

## Story Foundation

**As a** Manager,
**I want** to select rooms.
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-unified-hk-status-multi-selection': 'backlog',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].title).toBe('Story 1.1: Unified HK Status Multi-Selection');
    });

    it('should fall back to generated title from story ID if no H1 found', () => {
      const storyContent = `---
story_id: 1.1
---

## Story Foundation

**As a** Manager,
**I want** to select rooms.
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-unified-hk-status-multi-selection': 'backlog',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      expect(result.stories[0].title).toBe('Unified Hk Status Multi Selection');
    });
  });

  describe('Complete story parsing', () => {
    it('should parse story 1.1 with all sections correctly', () => {
      // This simulates the actual 1-1-unified-hk-status-multi-selection.md file
      const storyContent = `---
story_id: 1.1
epic: 1
epic_title: Enhanced Bulk Operations & Multi-Selection
title: Unified HK Status Multi-Selection
status: ready-for-dev
priority: P1
created: 2026-04-10
---

# Story 1.1: Unified HK Status Multi-Selection

## Story Foundation

**As a** Housekeeping Manager,
**I want** to select multiple rooms with the same HK Status regardless of their occupancy (Vacant/Occupied),
**So that** I can process them simultaneously.

## Business Context

This story enables managers to perform bulk operations across all rooms with the same housekeeping status.

## Acceptance Criteria (BDD)

### AC-1: Unified HK Status Selection
\`\`\`gherkin
Given I am viewing the Room Status Dashboard
When I activate multi-selection mode
Then I can select rooms that share the same HK Status (Dirty, Clean, Inspected, Pickup)
And the selection logic ignores occupancy status (Vacant vs Occupied)
And a visible count shows "X rooms selected"
\`\`\`

### AC-2: Cross-Occupancy Bulk Actions
\`\`\`gherkin
Given I have selected rooms across multiple occupancy types
When I attempt a bulk action
Then the system allows the action if HK status matches
And provides visual confirmation of the selection scope
\`\`\`

## Current Implementation Analysis

### What Already Exists
- **Room Selection Base**: existing selection logic
- **Selection State**: selectedRooms array

### What's Missing
- Unified HK status selection logic
- Selection mode toggle

## Technical Requirements

### Frontend Changes
- Add SelectionModeEnum
- Enhance RoomStatusView state

### Backend Changes

No backend changes required.

## Testing Requirements

### Unit Tests
- Selection Logic Tests
- Component Tests

### E2E Tests
- A1: Unified HK status selection works
`;

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(storyContent);
      (yaml.loadAll as jest.Mock).mockReturnValue([{
        development_status: {
          '1-1-unified-hk-status-multi-selection': 'ready-for-dev',
        },
        story_location: '_bmad-output/implementation-artifacts',
      }]);

      const result = parseSprintStatus(mockSprintStatusPath, mockStoriesDir);

      const story = result.stories[0];
      expect(story.id).toBe('1-1-unified-hk-status-multi-selection');
      expect(story.epicId).toBe('epic-1');
      expect(story.title).toBe('Story 1.1: Unified HK Status Multi-Selection');
      expect(story.status).toBe('ready-for-dev');
      
      // Verify description contains user story (with markdown bold markers)
      expect(story.description).toContain('**As a** Housekeeping Manager');
      expect(story.description).toContain('**I want** to select multiple rooms with the same HK Status');
      expect(story.description).toContain('**So that** I can process them simultaneously');
      
      // Verify BDD acceptance criteria are extracted
      expect(story.acceptanceCriteria).toHaveLength(2);
      expect(story.acceptanceCriteria[0]).toContain('Given I am viewing the Room Status Dashboard');
      expect(story.acceptanceCriteria[1]).toContain('Given I have selected rooms across multiple occupancy types');
      
      // Verify full content is captured
      expect(story.fullContent).toBe(storyContent);
      expect(story.fullContent).toContain('## Business Context');
      expect(story.fullContent).toContain('## Current Implementation Analysis');
      expect(story.fullContent).toContain('## Technical Requirements');
      expect(story.fullContent).toContain('## Testing Requirements');
    });
  });
});
