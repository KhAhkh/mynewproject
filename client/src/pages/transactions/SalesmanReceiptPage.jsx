import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const SalesmanReceiptPage = () => {
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [formState, setFormState] = useState({
    salesmanCode: "",
    salesmanDisplay: "",
    receiptDate: toDisplay(new Date()),
    voucherNo: "SR000001"
  });

  useEffect(() => {
    api.get("/metadata/next/salesman-receipt").then((response) => {
      if (response.data?.nextReceipt) {
        setFormState((prev) => ({ ...prev, voucherNo: response.data.nextReceipt }));
      }
    });
  }, []);

  const salesmanLookup = useQuery({
    queryKey: ["salesmen", { search: salesmanQuery }],
    queryFn: async () => {
      const response = await api.get("/salesmen", { params: { search: salesmanQuery } });
      return response.data;
    }
  });

  const receivableQuery = useQuery({
    queryKey: ["salesman-receivables", formState.salesmanCode, formState.receiptDate],
    enabled: Boolean(formState.salesmanCode),
    queryFn: async () => {
      const response = await api.get(`/salesmen/${encodeURIComponent(formState.salesmanCode)}/receivables`, {
        params: { date: formState.receiptDate }
      });
      return response.data;
    }
  });

  useEffect(() => {
    if (receivableQuery.data?.salesman) {
      const { salesman } = receivableQuery.data;
      setFormState((prev) => ({
        ...prev,
        salesmanDisplay: `${salesman.code} — ${salesman.name}`
      }));
    }
  }, [receivableQuery.data]);

  const hasSelection = Boolean(formState.salesmanCode);

  const summary = useMemo(() => {
    const currentRows = hasSelection ? receivableQuery.data?.rows ?? [] : [];
    return currentRows.reduce(
      (acc, row) => {
        const received = parseFloat(row.receivedAmount) || 0;
        const net = parseFloat(row.netBalance) || 0;
        const previous = parseFloat(row.previousBalance) || 0;
        return {
          totalReceived: acc.totalReceived + received,
          totalNet: acc.totalNet + net,
          totalPrevious: acc.totalPrevious + previous
        };
      },
      { totalReceived: 0, totalNet: 0, totalPrevious: 0 }
    );
  }, [hasSelection, receivableQuery.data]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Salesman Receipt"
        description="Summarize receivables collected by salesman."
        actions={
          <Link to="/history/transactions?type=salesman-receipt" className="secondary text-xs px-3 py-1">
            View saved receipts
          </Link>
        }
      >
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <FormField label="Voucher No.">
              <input value={formState.voucherNo} disabled />
            </FormField>
            <SearchSelect
              label="Salesman"
              placeholder="Search salesman"
              value={
                formState.salesmanCode
                  ? { label: formState.salesmanDisplay || formState.salesmanCode }
                  : null
              }
              onSelect={(option) => {
                setFormState((prev) => ({
                  ...prev,
                  salesmanCode: option.code,
                  salesmanDisplay: option.label
                }));
              }}
              onSearch={setSalesmanQuery}
              results={
                salesmanLookup.data?.map((salesman) => ({
                  value: salesman.id,
                  code: salesman.code,
                  label: `${salesman.code} — ${salesman.name}`
                })) ?? []
              }
            />
            <FormField label="Receipt Date" required>
              <input
                value={formState.receiptDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, receiptDate: event.target.value }))
                }
              />
            </FormField>
          </div>

          {receivableQuery.isFetching ? (
            <p className="text-xs text-slate-500">Loading receivables…</p>
          ) : null}

          <div className="bg-white border border-slate-200 rounded-3xl shadow-[0_18px_45px_rgba(15,23,42,0.12)] overflow-hidden">
            <header className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Collected Receivables</h3>
                {formState.salesmanDisplay ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Voucher {formState.voucherNo} • {formState.salesmanDisplay} • {formState.receiptDate}
                  </p>
                ) : null}
              </div>
              <span className="text-xs text-slate-500">
                {(hasSelection ? receivableQuery.data?.rows?.length : 0) ?? 0} record(s)
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Customer Code</th>
                    <th className="px-4 py-2 text-left">Customer Name</th>
                    <th className="px-4 py-2 text-right">Received Amount</th>
                    <th className="px-4 py-2 text-right">Previous Balance</th>
                    <th className="px-4 py-2 text-right">Net Balance</th>
                    <th className="px-4 py-2 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hasSelection && receivableQuery.data?.rows?.length ? (
                    receivableQuery.data.rows.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 align-middle">{row.customerCode}</td>
                        <td className="px-4 py-3 align-middle">{row.customerName}</td>
                        <td className="px-4 py-3 align-middle text-right">
                          {Number(row.receivedAmount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          {Number(row.previousBalance || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          {Number(row.netBalance || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-middle">{row.remarks || ""}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        {formState.salesmanCode ? "No receivables found for the selected criteria." : "Select a salesman to view receivables."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-8 text-sm text-slate-700">
              <span>Total Received: <strong>{summary.totalReceived.toFixed(2)}</strong></span>
              <span>Total Previous: <strong>{summary.totalPrevious.toFixed(2)}</strong></span>
              <span>Total Net: <strong>{summary.totalNet.toFixed(2)}</strong></span>
            </footer>
          </div>

                  <div className="flex justify-end">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                        setSalesmanQuery("");
                        setFormState((prev) => ({
                          salesmanCode: "",
                          salesmanDisplay: "",
                          receiptDate: toDisplay(new Date()),
                          voucherNo: prev.voucherNo
                        }));
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default SalesmanReceiptPage;
