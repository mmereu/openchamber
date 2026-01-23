import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RiRefreshLine, RiDeleteBinLine, RiServerLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

interface OpenCodeProcessInfo {
  pid: number;
  port: number | null;
  command: string;
  started: string;
}

export const ServerManagementSettings: React.FC = () => {
  const [servers, setServers] = React.useState<OpenCodeProcessInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCleaningUp, setIsCleaningUp] = React.useState(false);
  const [lastCleanupResult, setLastCleanupResult] = React.useState<number | null>(null);

  const fetchServers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.opencodeDesktop?.getRunningServers) {
        const result = await window.opencodeDesktop.getRunningServers();
        setServers(result || []);
      }
    } catch (error) {
      console.error('Failed to fetch running servers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCleanup = React.useCallback(async () => {
    setIsCleaningUp(true);
    setLastCleanupResult(null);
    try {
      if (window.opencodeDesktop?.cleanupOrphanProcesses) {
        const killed = await window.opencodeDesktop.cleanupOrphanProcesses();
        setLastCleanupResult(killed);
        // Refresh the list after cleanup
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to cleanup orphan processes:', error);
    } finally {
      setIsCleaningUp(false);
    }
  }, [fetchServers]);

  React.useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Auto-refresh every 10 seconds
  React.useEffect(() => {
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const isDesktopRuntime = typeof window !== 'undefined' && typeof window.opencodeDesktop !== 'undefined';

  if (!isDesktopRuntime) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="typography-ui-header font-semibold text-foreground">Server Management</h3>
          <p className="typography-meta text-muted-foreground">
            Server management is only available in the desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">Server Management</h3>
        <p className="typography-meta text-muted-foreground">
          Monitor and manage running opencode server processes.
        </p>
      </div>

      {/* Stats card */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              servers.length > 1 ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
            )}>
              <RiServerLine className="h-5 w-5" />
            </div>
            <div>
              <p className="typography-ui-label font-medium">
                {servers.length} server{servers.length !== 1 ? 's' : ''} running
              </p>
              <p className="typography-micro text-muted-foreground">
                {servers.length > 1 ? 'Consider cleaning up orphan processes' : 'System is healthy'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchServers}
              disabled={isLoading}
            >
              <RiRefreshLine className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanup}
              disabled={isCleaningUp || servers.length <= 1}
              className={cn(
                servers.length > 1 && 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'
              )}
            >
              <RiDeleteBinLine className={cn('h-4 w-4 mr-1', isCleaningUp && 'animate-pulse')} />
              Cleanup Orphans
            </Button>
          </div>
        </div>

        {lastCleanupResult !== null && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <p className="typography-meta text-muted-foreground">
              {lastCleanupResult === 0
                ? 'No orphan processes found'
                : `Cleaned up ${lastCleanupResult} orphan process${lastCleanupResult !== 1 ? 'es' : ''}`}
            </p>
          </div>
        )}
      </Card>

      {/* Server list */}
      {servers.length > 0 && (
        <div className="space-y-2">
          <h4 className="typography-ui-label text-muted-foreground">Running Processes</h4>
          <div className="space-y-2">
            {servers.map((server, index) => (
              <Card key={server.pid} className="p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="typography-ui-label font-mono">PID {server.pid}</span>
                      {server.port && (
                        <span className="typography-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          :{server.port}
                        </span>
                      )}
                      {index === 0 && (
                        <span className="typography-micro px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                          current
                        </span>
                      )}
                    </div>
                    <p className="typography-micro text-muted-foreground truncate mt-0.5">
                      {server.started}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Info about automatic cleanup */}
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="typography-micro text-muted-foreground">
          <strong>Automatic cleanup:</strong> Orphan processes are automatically cleaned up when the app starts.
          If you notice performance issues, you can manually clean up processes above.
        </p>
      </div>
    </div>
  );
};
