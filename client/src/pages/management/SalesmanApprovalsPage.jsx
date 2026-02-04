import React, { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

const approvalsQueryKey = ["salesman-approvals", { status: "pending" }];

const fetchPendingApprovals = async ({ queryKey }) => {
  const [, params] = queryKey;
  const response = await api.get("/management/salesman-approvals", { params });
  return response.data?.entries ?? [];
};

const Section = ({ title, description, entries, renderCard }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start justify-between gap-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-slate-600">{description}</p>
      </div>
      <span className="text-sm font-semibold text-slate-500">{entries.length} pending</span>
    </div>
    {entries.length === 0 ? (
      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        Nothing waiting for review.
      </div>
    ) : (
      <div className="mt-6 space-y-4">{entries.map(renderCard)}</div>
    )}
  </section>
);

const LocationDetails = ({ location }) => {
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const accuracy = Number(location.accuracy);
  const recordedDate = location.recordedAt ? new Date(location.recordedAt) : null;
  const capturedAt = recordedDate && !Number.isNaN(recordedDate.getTime()) ? recordedDate.toLocaleString() : null;
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  return (
    <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">GPS capture</span>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline"
        >
          View map
        </a>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <span>
          Lat/Lng: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        {Number.isFinite(accuracy) ? <span>±{accuracy.toFixed(1)} m</span> : null}
      </div>
      {capturedAt ? <p className="mt-1 text-xs text-slate-500">Captured {capturedAt}</p> : null}
    </div>
  );
};

const SalesmanApprovalsPage = () => {
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: approvalsQueryKey,
    queryFn: fetchPendingApprovals,
    refetchInterval: 60_000
  });

  const pendingOrders = useMemo(() => data.filter((entry) => entry.entryType === "order"), [data]);
  const pendingRecoveries = useMemo(
    () => data.filter((entry) => entry.entryType === "recovery"),
    [data]
  );

  const invalidateApprovals = () => queryClient.invalidateQueries({ queryKey: approvalsQueryKey });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/management/salesman-approvals/${id}/approve`),
    onSuccess: invalidateApprovals
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) =>
      api.post(`/management/salesman-approvals/${id}/reject`, { reason }),
    onSuccess: invalidateApprovals
  });

  const actionInFlight = approveMutation.isPending || rejectMutation.isPending;
  const actionError = approveMutation.error?.message || rejectMutation.error?.message || null;

  const handleApprove = (id) => {
    approveMutation.mutate(id);
  };

  const handleReject = (id) => {
    const reason = window.prompt("Add a short rejection note:", "Incomplete details");
    if (reason === null) {
      return;
    }
    rejectMutation.mutate({ id, reason });
  };

  const renderOrderCard = (entry) => {
    const items = entry.payload?.items ?? [];
    const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";
    return (
      <article
        key={entry.id}
        className="rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:border-slate-300"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-indigo-500">Mobile Order</p>
            <h3 className="text-lg font-semibold text-slate-900">
              {entry.customerCode} · {entry.customerName}
            </h3>
            <p className="text-sm text-slate-500">Salesman: {entry.salesmanName || "—"}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Queued: {created || "Just now"}</p>
            <p>Ref: {entry.clientReference}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Items: {items.length}</span>
            <span>Total Qty: {entry.summaryAmount ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</span>
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {items.slice(0, 4).map((item) => (
              <li key={`${entry.id}-${item.itemCode}`} className="flex items-center justify-between">
                <span>
                  {item.itemName || item.itemCode} <span className="text-slate-400">({item.itemCode})</span>
                </span>
                <span>
                  Qty {item.quantity}
                  {item.bonus ? ` · Bonus ${item.bonus}` : ""}
                </span>
              </li>
            ))}
            {items.length > 4 ? (
              <li className="text-xs text-slate-500">+{items.length - 4} more lines</li>
            ) : null}
          </ul>
        </div>
        <LocationDetails location={entry.location} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionInFlight}
            onClick={() => handleApprove(entry.id)}
          >
            Approve & Post
          </button>
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionInFlight}
            onClick={() => handleReject(entry.id)}
          >
            Reject
          </button>
        </div>
      </article>
    );
  };

  const renderRecoveryCard = (entry) => {
    const payload = entry.payload ?? {};
    const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";
    return (
      <article
        key={entry.id}
        className="rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:border-slate-300"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-teal-500">Recovery</p>
            <h3 className="text-lg font-semibold text-slate-900">
              {entry.customerCode} · {entry.customerName}
            </h3>
            <p className="text-sm text-slate-500">Salesman: {entry.salesmanName || "—"}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Queued: {created || "Just now"}</p>
            <p>Ref: {entry.clientReference}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center justify-between">
            <span>Amount</span>
            <span className="font-semibold text-emerald-600">{payload.amount?.toLocaleString?.() ?? payload.amount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Mode</span>
            <span className="font-medium capitalize">{payload.paymentMode || "cash"}</span>
          </div>
          {payload.bankCode ? (
            <div className="flex items-center justify-between">
              <span>Bank</span>
              <span>{payload.bankCode}</span>
            </div>
          ) : null}
          {payload.slipNo ? (
            <div className="flex items-center justify-between">
              <span>Reference</span>
              <span>{payload.slipNo}</span>
            </div>
          ) : null}
          {payload.details ? <p className="text-xs text-slate-500">Notes: {payload.details}</p> : null}
        </div>
        <LocationDetails location={entry.location} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionInFlight}
            onClick={() => handleApprove(entry.id)}
          >
            Approve & Post
          </button>
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionInFlight}
            onClick={() => handleReject(entry.id)}
          >
            Reject
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500">Management</p>
        <h1 className="text-3xl font-semibold text-slate-900">Salesman Approvals</h1>
        <p className="mt-2 text-slate-600">
          Every mobile submission lands here first. Approve to post into orders/receipts or reject with a note for
          follow-up.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>{pendingOrders.length} orders pending</span>
          <span>{pendingRecoveries.length} recoveries pending</span>
          <button
            type="button"
            className="text-slate-700 underline-offset-2 hover:underline"
            onClick={() => refetch()}
          >
            Refresh
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>
      ) : null}
      {isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Unable to load pending approvals.
          <button className="ml-2 underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {actionError}
        </div>
      ) : null}

      <Section
        title="Pending Orders"
        description="Review orders captured via the mobile application before they affect inventory."
        entries={pendingOrders}
        renderCard={renderOrderCard}
      />

      <Section
        title="Pending Recoveries"
        description="Confirm salesman recovery entries before posting to receivables."
        entries={pendingRecoveries}
        renderCard={renderRecoveryCard}
      />
    </div>
  );
};

export default SalesmanApprovalsPage;
