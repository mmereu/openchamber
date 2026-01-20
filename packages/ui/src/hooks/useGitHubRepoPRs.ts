import { useState, useEffect, useCallback } from 'react';
import type { BoardColumn, BoardColumnType, PullRequest } from '@/lib/github-repos/types';

interface UseGitHubRepoPRsResult {
  columns: BoardColumn[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const COLUMN_CONFIGS: Array<{ id: BoardColumnType; label: string; color: string }> = [
  { id: 'branches', label: 'Branches', color: '#6B7280' },
  { id: 'behind-prs', label: 'Behind', color: '#F59E0B' },
  { id: 'draft-prs', label: 'Draft', color: '#9CA3AF' },
  { id: 'pending-prs', label: 'Pending', color: '#3B82F6' },
  { id: 'failing-prs', label: 'Failing', color: '#EF4444' },
  { id: 'changes-requested-prs', label: 'Changes Requested', color: '#F97316' },
  { id: 'in-review-prs', label: 'In Review', color: '#8B5CF6' },
  { id: 'ready-to-merge-prs', label: 'Ready to Merge', color: '#10B981' },
  { id: 'merged-prs', label: 'Merged', color: '#6366F1' },
];

function assignPRToColumn(pr: PullRequest): BoardColumnType {
  if (pr.state === 'merged') {
    return 'merged-prs';
  }

  if (pr.isDraft) {
    return 'draft-prs';
  }

  if (pr.mergeable === 'CONFLICTING') {
    return 'behind-prs';
  }

  if (pr.statusCheckRollup === 'FAILURE') {
    return 'failing-prs';
  }

  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return 'changes-requested-prs';
  }

  if (pr.reviewDecision === 'APPROVED' && pr.statusCheckRollup === 'SUCCESS') {
    return 'ready-to-merge-prs';
  }

  if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    return 'in-review-prs';
  }

  return 'pending-prs';
}

export function useGitHubRepoPRs(owner: string, repo: string): UseGitHubRepoPRsResult {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchPRs() {
      if (!owner || !repo) {
        setError('Owner and repo are required');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/github/${owner}/${repo}/prs`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to fetch PRs' }));
          throw new Error(errorData.message || errorData.error || 'Failed to fetch PRs');
        }

        const data = await response.json();
        
        if (cancelled) return;

        const prs: PullRequest[] = data.prs || [];

        const columnMap = new Map<BoardColumnType, PullRequest[]>();
        COLUMN_CONFIGS.forEach(config => {
          columnMap.set(config.id, []);
        });

        prs.forEach(pr => {
          const columnId = assignPRToColumn(pr);
          const items = columnMap.get(columnId) || [];
          items.push(pr);
          columnMap.set(columnId, items);
        });

        const newColumns: BoardColumn[] = COLUMN_CONFIGS.map(config => ({
          id: config.id,
          label: config.label,
          color: config.color,
          items: (columnMap.get(config.id) || []).map(pr => ({
            type: 'pr' as const,
            data: pr,
          })),
        }));

        setColumns(newColumns);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch PRs');
        setIsLoading(false);
      }
    }

    fetchPRs();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, refreshTrigger]);

  return { columns, isLoading, error, refresh };
}
