import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

const BackupControl = () => {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);

  const { data: backups = [], isFetching } = useQuery({
    queryKey: ["db-backups"],
    queryFn: async () => {
      const response = await api.get("/db/backups");
      return response.data;
    }
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/db/backup");
      return response.data;
    },
    onSuccess: (data) => {
      alert(`Backup created successfully!\n\nLocation: ${data.path}\n\nIncludes: ${data.includes.join(", ")}`);
      queryClient.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (error) => {
      alert(`Backup failed: ${error.response?.data?.message || error.message}`);
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async (backupName) => {
      const response = await api.post(`/db/restore/${backupName}`);
      return response.data;
    },
    onSuccess: (data) => {
      alert(`${data.message}\n\nRestored: ${data.restored.join(", ")}\n\n${data.note}\n\nPlease refresh the page after servers restart.`);
      queryClient.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (error) => {
      alert(`Restore failed: ${error.response?.data?.message || error.message}`);
    }
  });

  const handleRestoreSelected = () => {
    if (!selectedBackup) return;
    const confirmed = confirm(
      `⚠️ WARNING: This will overwrite your current databases!\n\n` +
      `You are about to restore: ${selectedBackup}\n\n` +
      `All current data will be replaced with the backup data.\n\n` +
      `The application will need to restart. Continue?`
    );
    if (confirmed) {
      restoreMutation.mutate(selectedBackup);
    }
  };

  const busy = backupMutation.isPending || restoreMutation.isPending;

  return (
    <div className="border-t border-slate-200 bg-white/80 backdrop-blur shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
      <div className="max-w-6xl mx-auto px-8 py-6 flex flex-col gap-6 text-slate-700">
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="primary text-sm"
            onClick={() => backupMutation.mutate()}
            disabled={busy}
          >
            {backupMutation.isPending ? "Creating backup..." : "Create New Backup"}
          </button>
          <button
            className="secondary text-sm bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
            onClick={handleRestoreSelected}
            disabled={!selectedBackup || busy}
          >
            {restoreMutation.isPending ? "Restoring..." : "Restore Selected Backup"}
          </button>
          {busy ? <span className="text-xs text-slate-500">Please wait...</span> : null}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Available Backups</h2>
            {isFetching ? <span className="text-xs text-slate-500">Refreshing...</span> : null}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 max-h-96 overflow-y-auto scrollbar-thin text-sm text-slate-700 shadow-inner">
            {backups.length === 0 ? (
              <p className="text-slate-500">No backups yet. Click "Create New Backup" to create one.</p>
            ) : (
              <ul className="space-y-2">
                {backups.map((file) => {
                  const isFolder = file.startsWith('backup-');
                  const isSelected = selectedBackup === file;
                  return (
                    <li 
                      key={file} 
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-indigo-50 border-2 border-indigo-500' 
                          : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                      }`}
                      onClick={() => setSelectedBackup(file)}
                    >
                      <div className="flex items-center gap-3">
                        <input 
                          type="radio" 
                          checked={isSelected} 
                          onChange={() => setSelectedBackup(file)}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium text-slate-700">{file}</div>
                          {isFolder && (
                            <div className="text-xs text-slate-500 mt-1">
                              Complete backup (inventory.db + app.db)
                            </div>
                          )}
                          {!isFolder && file.endsWith('.db') && (
                            <div className="text-xs text-amber-600 mt-1">
                              ⚠️ Old format (inventory.db only)
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {selectedBackup && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-amber-800 mb-2">⚠️ Selected: {selectedBackup}</p>
            <p className="text-amber-700">
              Click "Restore Selected Backup" to replace your current databases with this backup. 
              The application will restart automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupControl;
