import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuthStore } from "../store/auth.js";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const hydrate = useAuthStore((state) => state.hydrate);
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (initialized && user) {
      const redirectTo = location.state?.from?.pathname ?? "/";
      navigate(redirectTo, { replace: true });
    }
  }, [initialized, user, navigate, location.state]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    setError("");
    try {
      setPending(true);
      const response = await api.post("/auth/login", {
        username: username.trim(),
        password
      });
      setSession({ user: response.data.user, token: response.data.token });
      const redirectTo = location.state?.from?.pathname ?? "/";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setPending(false);
    }
  };

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Inventory Console Login</h1>
          <p className="text-sm text-slate-500">Sign in with your authorized account credentials.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Username</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600">Password</label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-xs text-rose-500">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
            disabled={pending}
          >
            {pending ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-600">Privileges by role</p>
          <ul className="list-disc list-inside space-y-1 text-left">
            <li><span className="font-semibold text-slate-700">Administrator:</span> manage users, master data, transactions, reports, backups.</li>
            <li><span className="font-semibold text-slate-700">Manager:</span> manage master data, execute transactions, view reports and history.</li>
            <li><span className="font-semibold text-slate-700">Viewer:</span> view dashboards, reports, and history.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
