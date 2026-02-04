import { Link } from "react-router-dom";

const NotFoundPage = () => {
  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-10 text-center space-y-4">
      <h2 className="text-2xl font-semibold text-neutral-100">404 — Page Not Found</h2>
      <p className="text-neutral-400">
        We could not find the page you were looking for. Choose another option from the sidebar or head back to the dashboard.
      </p>
      <Link to="/" className="primary inline-flex items-center gap-2">
        Go to Dashboard
      </Link>
    </div>
  );
};

export default NotFoundPage;
