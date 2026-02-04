import { Link, useRouteError } from "react-router-dom";

const ErrorPage = () => {
  const error = useRouteError();
  const message = error?.status === 404 ? "Page not found" : "Unexpected application error";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-100 gap-6 p-6">
      <h1 className="text-3xl font-semibold">{message}</h1>
      <p className="text-neutral-400">
        {error?.statusText ?? error?.message ?? "We ran into a problem while rendering this page."}
      </p>
      <div className="flex items-center gap-3">
        <Link to="/" className="primary inline-flex items-center gap-2">
          Go to Dashboard
        </Link>
        <button type="button" className="secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </div>
  );
};

export default ErrorPage;
