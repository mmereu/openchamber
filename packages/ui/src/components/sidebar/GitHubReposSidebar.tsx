import { useState, useCallback, useEffect } from 'react';
import { RiCloseLine, RiGitRepositoryLine } from '@remixicon/react';
import { useGitHubReposStore } from '@/stores/useGitHubReposStore';
import { usePanes } from '@/stores/usePaneStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

export function GitHubReposSidebar() {
  const { trackedRepos, addRepo, removeRepo } = useGitHubReposStore();
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
  const { addTab } = usePanes(currentDirectory);
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [repoInput, setRepoInput] = useState('');

  useEffect(() => {
    const handleAddTrigger = () => setIsAddingRepo(true);
    document.addEventListener('github-repos-add-trigger', handleAddTrigger);
    return () => document.removeEventListener('github-repos-add-trigger', handleAddTrigger);
  }, []);

  const handleAddRepo = useCallback(() => {
    const owner = ownerInput.trim();
    const repo = repoInput.trim();

    if (!owner || !repo) {
      return;
    }

    addRepo(owner, repo);
    setOwnerInput('');
    setRepoInput('');
    setIsAddingRepo(false);
  }, [ownerInput, repoInput, addRepo]);

  const handleOpenRepo = useCallback((owner: string, repo: string) => {
    addTab('right', {
      type: 'github-repo',
      title: `${owner}/${repo}`,
      metadata: { owner, repo },
    });
  }, [addTab]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
        {isAddingRepo && (
          <div className="border-b border-border p-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Owner (e.g., facebook)"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <input
                type="text"
                placeholder="Repo (e.g., react)"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddRepo();
                  } else if (e.key === 'Escape') {
                    setIsAddingRepo(false);
                    setOwnerInput('');
                    setRepoInput('');
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddRepo}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAddingRepo(false);
                    setOwnerInput('');
                    setRepoInput('');
                  }}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {trackedRepos.length === 0 && !isAddingRepo ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <RiGitRepositoryLine className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No repositories tracked</p>
            <p className="mt-1 text-xs text-muted-foreground">Click + to add a repository</p>
          </div>
        ) : (
          <div className="p-2">
            {trackedRepos.map((repo) => (
              <div
                key={`${repo.owner}/${repo.repo}`}
                className="group flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent"
              >
                <button
                  onClick={() => handleOpenRepo(repo.owner, repo.repo)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <RiGitRepositoryLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-foreground">
                    {repo.owner}/{repo.repo}
                  </span>
                </button>
                <button
                  onClick={() => removeRepo(repo.owner, repo.repo)}
                  className="opacity-0 rounded-md p-1 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="Remove repository"
                >
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
