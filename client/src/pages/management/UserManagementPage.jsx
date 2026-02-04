import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";
import { useAuthStore } from "../../store/auth.js";

const ROLE_DEFINITIONS = {
  admin: {
    label: "Administrator",
    privileges: [
      "Manage users",
      "Maintain all master records",
      "Enter and edit transactions",
      "View reports and histories",
      "Manage backups"
    ]
  },
  manager: {
    label: "Manager",
    privileges: [
      "Maintain master records",
      "Enter and edit transactions",
      "View reports and histories"
    ]
  },
  viewer: {
    label: "Viewer",
    privileges: ["View dashboards", "View reports", "Review history"]
  }
};

const ROLE_OPTIONS = Object.entries(ROLE_DEFINITIONS).map(([value, definition]) => ({
  value,
  label: definition.label
}));

const makeCreateForm = () => ({
  username: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  isActive: true,
  salesmanCode: ""
});

const makeEditForm = (user, salesmanCode = "") => ({
  id: user?.id ?? null,
  username: user?.username ?? "",
  role: user?.role ?? "viewer",
  isActive: user?.isActive ?? true,
  password: "",
  confirmPassword: "",
  salesmanCode
});

const generateUsernameFromSalesman = (name) =>
  name ? name.trim().toLowerCase().replace(/\s+/g, ".") : "";

const privilegeList = (role) => ROLE_DEFINITIONS[role]?.privileges ?? [];

const UserManagementPage = () => {
  const queryClient = useQueryClient();
  const canManageUsers = useAuthStore((state) => state.user?.privileges?.includes("users.manage"));
  const [createForm, setCreateForm] = useState(makeCreateForm);
  const [editSelection, setEditSelection] = useState(null);
  const [editForm, setEditForm] = useState(makeEditForm(null));
  const [statusMessage, setStatusMessage] = useState(null);
  const createAutoUsernameRef = useRef(null);
  const editAutoUsernameRef = useRef(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await api.get("/users");
      return response.data.users ?? [];
    },
    enabled: Boolean(canManageUsers)
  });

  const salesmenQuery = useQuery({
    queryKey: ["salesmen"],
    queryFn: async () => {
      const response = await api.get("/salesmen");
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: Boolean(canManageUsers)
  });

  const salesmen = useMemo(() => salesmenQuery.data ?? [], [salesmenQuery.data]);
  const salesmenById = useMemo(() => {
    const map = new Map();
    salesmen.forEach((entry) => {
      if (entry?.id != null) {
        map.set(entry.id, entry);
      }
    });
    return map;
  }, [salesmen]);
  const salesmenByCode = useMemo(() => {
    const map = new Map();
    salesmen.forEach((entry) => {
      if (entry?.code) {
        map.set(entry.code, entry);
      }
    });
    return map;
  }, [salesmen]);
  const salesmenOptions = useMemo(
    () =>
      salesmen.map((entry) => ({
        value: entry.code,
        label: entry.name ? `${entry.name} (${entry.code})` : entry.code
      })),
    [salesmen]
  );

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/users", payload);
      return response.data.user;
    },
    onSuccess: () => {
      setStatusMessage({ type: "success", message: "User account created." });
      setCreateForm(makeCreateForm());
      createAutoUsernameRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      setStatusMessage({ type: "error", message: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const response = await api.put(`/users/${id}`, payload);
      return response.data.user;
    },
    onSuccess: (user) => {
      setStatusMessage({ type: "success", message: "User account updated." });
      setEditSelection(user);
      const assignedSalesman = user?.salesmanId ? salesmenById.get(user.salesmanId) : null;
      const assignedCode = assignedSalesman?.code ?? "";
      const generated = assignedSalesman ? generateUsernameFromSalesman(assignedSalesman.name) : "";
      editAutoUsernameRef.current = user?.username === generated ? generated : null;
      setEditForm(makeEditForm(user, assignedCode));
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      setStatusMessage({ type: "error", message: error.message });
    }
  });

  const handleCreate = (event) => {
    event.preventDefault();
    if (!createForm.username.trim()) {
      setStatusMessage({ type: "error", message: "Username is required." });
      return;
    }
    if (createForm.password.length < 8) {
      setStatusMessage({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      setStatusMessage({ type: "error", message: "Passwords do not match." });
      return;
    }
    if (createForm.salesmanCode && salesmenQuery.isSuccess && !salesmenByCode.has(createForm.salesmanCode)) {
      setStatusMessage({ type: "error", message: "Selected salesman is not available." });
      return;
    }
    createMutation.mutate({
      username: createForm.username.trim(),
      password: createForm.password,
      role: createForm.role,
      isActive: createForm.isActive,
      salesmanCode: createForm.salesmanCode ? createForm.salesmanCode : null
    });
  };

  const handleCreateUsernameChange = (value) => {
    setCreateForm((prev) => ({ ...prev, username: value }));
    createAutoUsernameRef.current = null;
  };

  const handleCreateSalesmanChange = (code) => {
    const selected = code ? salesmenByCode.get(code) : null;
    const generated = selected ? generateUsernameFromSalesman(selected.name) : "";
    const previousAuto = createAutoUsernameRef.current ?? "";
    setCreateForm((prev) => {
      const shouldApply = selected && (!prev.username || prev.username === previousAuto);
      if (shouldApply) {
        createAutoUsernameRef.current = generated;
      } else if (!selected) {
        createAutoUsernameRef.current = null;
      }
      return {
        ...prev,
        salesmanCode: code,
        username: shouldApply ? generated : prev.username
      };
    });
    if (!selected) {
      createAutoUsernameRef.current = null;
    }
  };

  const handleSelectUser = (user) => {
    setEditSelection(user);
    const assignedSalesman = user?.salesmanId ? salesmenById.get(user.salesmanId) : null;
    const assignedCode = assignedSalesman?.code ?? "";
    const generated = assignedSalesman ? generateUsernameFromSalesman(assignedSalesman.name) : "";
    editAutoUsernameRef.current = user?.username === generated ? generated : null;
    setEditForm(makeEditForm(user, assignedCode));
    setStatusMessage(null);
  };

  const handleEditUsernameChange = (value) => {
    setEditForm((prev) => ({ ...prev, username: value }));
    editAutoUsernameRef.current = null;
  };

  const handleEditSalesmanChange = (code) => {
    const selected = code ? salesmenByCode.get(code) : null;
    const generated = selected ? generateUsernameFromSalesman(selected.name) : "";
    const previousAuto = editAutoUsernameRef.current ?? "";
    setEditForm((prev) => {
      const shouldApply = selected && (!prev.username || prev.username === previousAuto);
      if (shouldApply) {
        editAutoUsernameRef.current = generated;
      } else if (!selected) {
        editAutoUsernameRef.current = null;
      }
      return {
        ...prev,
        salesmanCode: code,
        username: shouldApply ? generated : prev.username
      };
    });
    if (!selected) {
      editAutoUsernameRef.current = null;
    }
  };

  const handleUpdate = (event) => {
    event.preventDefault();
    if (!editForm.id) {
      setStatusMessage({ type: "error", message: "Select a user to update." });
      return;
    }

    if (editForm.password && editForm.password.length < 8) {
      setStatusMessage({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }

    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      setStatusMessage({ type: "error", message: "Passwords do not match." });
      return;
    }
    if (editForm.salesmanCode && salesmenQuery.isSuccess && !salesmenByCode.has(editForm.salesmanCode)) {
      setStatusMessage({ type: "error", message: "Selected salesman is not available." });
      return;
    }

    const payload = {};
    if (editForm.username.trim() !== editSelection.username) {
      payload.username = editForm.username.trim();
    }
    if (editForm.role !== editSelection.role) {
      payload.role = editForm.role;
    }
    if (editForm.isActive !== editSelection.isActive) {
      payload.isActive = editForm.isActive;
    }
    if (editForm.password) {
      payload.password = editForm.password;
    }
    const currentSalesmanCode = editSelection?.salesmanId
      ? salesmenById.get(editSelection.salesmanId)?.code ?? ""
      : "";
    const desiredSalesmanCode = editForm.salesmanCode || "";
    if (desiredSalesmanCode !== currentSalesmanCode) {
      payload.salesmanCode = desiredSalesmanCode || null;
    }

    if (Object.keys(payload).length === 0) {
      setStatusMessage({ type: "error", message: "No changes to save." });
      return;
    }

    updateMutation.mutate({ id: editForm.id, payload });
  };

  const sortedUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    return [...usersQuery.data].sort((a, b) => a.username.localeCompare(b.username));
  }, [usersQuery.data]);

  if (!canManageUsers) {
    return (
      <div className="space-y-6">
        <SectionCard title="User Management" description="Administrator access required.">
          <p className="text-sm text-rose-500">You do not have permission to manage user accounts.</p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Create User"
        description="Register a new operator and assign privileges."
      >
        <form className="grid gap-4" onSubmit={handleCreate}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Username</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={createForm.username}
                onChange={(event) => handleCreateUsernameChange(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Role</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, role: event.target.value }))
                }
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Assign Salesman</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={createForm.salesmanCode}
              onChange={(event) => handleCreateSalesmanChange(event.target.value)}
              disabled={salesmenQuery.isLoading || salesmenQuery.isError}
            >
              <option value="">None</option>
              {salesmenOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Selecting a salesman will auto-fill the username; adjust manually if needed.
            </p>
            {salesmenQuery.isError ? (
              <p className="text-xs text-rose-500">
                {salesmenQuery.error?.message || "Unable to load salesmen."}
              </p>
            ) : null}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Password</label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Confirm Password</label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={createForm.confirmPassword}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
              checked={createForm.isActive}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active account
          </label>

          <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-600">Privileges for {ROLE_DEFINITIONS[createForm.role].label}</p>
            <ul className="list-disc list-inside space-y-1">
              {privilegeList(createForm.role).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Manage Existing Users"
        description="Select an operator to update their credentials or privileges."
      >
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">
              Registered Users
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {usersQuery.isLoading ? (
                <p className="px-4 py-6 text-sm text-slate-500">Loading users...</p>
              ) : usersQuery.isError ? (
                <p className="px-4 py-6 text-sm text-rose-500">
                  {usersQuery.error?.message || "Unable to load users."}
                </p>
              ) : sortedUsers.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No users found.</p>
              ) : (
                sortedUsers.map((user) => {
                  const assignedSalesman = user?.salesmanId ? salesmenById.get(user.salesmanId) : null;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                        editSelection?.id === user.id ? "bg-emerald-50" : ""
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-slate-700">{user.username}</p>
                        <p className="text-xs text-slate-500">{ROLE_DEFINITIONS[user.role]?.label ?? user.role}</p>
                        {assignedSalesman ? (
                          <p className="text-xs text-slate-400">Salesman · {assignedSalesman.name}</p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          user.isActive ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleUpdate}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Username</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={editForm.username}
                onChange={(event) => handleEditUsernameChange(event.target.value)}
                disabled={!editForm.id}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Role</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={editForm.role}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, role: event.target.value }))
                }
                disabled={!editForm.id}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Assign Salesman</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={editForm.salesmanCode}
                onChange={(event) => handleEditSalesmanChange(event.target.value)}
                disabled={!editForm.id || salesmenQuery.isLoading || salesmenQuery.isError}
              >
                <option value="">None</option>
                {salesmenOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Reassigning a salesman will auto-adjust the username when it still matches the previous suggestion.
              </p>
              {salesmenQuery.isError ? (
                <p className="text-xs text-rose-500">
                  {salesmenQuery.error?.message || "Unable to load salesmen."}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                checked={editForm.isActive}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                disabled={!editForm.id}
              />
              Active account
            </label>
            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">New Password</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={editForm.password}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  disabled={!editForm.id}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Confirm Password</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={editForm.confirmPassword}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  disabled={!editForm.id}
                  placeholder="Repeat new password"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-600">
                Privileges for {ROLE_DEFINITIONS[editForm.role]?.label ?? "Role"}
              </p>
              <ul className="list-disc list-inside space-y-1">
                {privilegeList(editForm.role).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="primary"
                disabled={!editForm.id || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
        {statusMessage ? (
          <p
            className={`text-xs ${statusMessage.type === "error" ? "text-rose-500" : "text-emerald-500"}`}
          >
            {statusMessage.message}
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
};

export default UserManagementPage;
