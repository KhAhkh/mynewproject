import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const formatCurrency = (value) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const SalesmanBonusPage = () => {
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [meta, setMeta] = useState({ nextVoucher: "SB000001" });
  const [formState, setFormState] = useState({
    salesmanCode: "",
    salesmanLabel: "",
    startDate: toDisplay(new Date()),
    endDate: toDisplay(new Date()),
    targetAmount: "",
    bonusPercent: "",
    notes: ""
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    api.get("/metadata/next/salesman-bonus").then((response) => {
      if (response.data?.nextVoucher) {
        setMeta({ nextVoucher: response.data.nextVoucher });
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

  const previewQuery = useQuery({
    queryKey: ["salesman-bonus-preview", formState.salesmanCode],
    enabled: Boolean(formState.salesmanCode),
    queryFn: async () => {
      const response = await api.get(
        `/salesmen/${encodeURIComponent(formState.salesmanCode)}/total-sales`
      );
      return response.data;
    }
  });

  const bonusPreview = useMemo(() => {
    const achieved = Number(previewQuery.data?.totalAmount ?? 0);
    const target = Number(formState.targetAmount || 0);
    const bonusPercent = Number(formState.bonusPercent || 0);
    const targetMet = target > 0 ? achieved >= target : false;
    const totalBonus = targetMet ? achieved * (bonusPercent / 100) : 0;

    return {
      achieved,
      target,
      targetMet,
      bonusPercent,
      totalBonus
    };
  }, [previewQuery.data, formState.targetAmount, formState.bonusPercent]);

  const bonusQuery = useQuery({
    queryKey: ["salesman-bonuses", formState.salesmanCode],
    queryFn: async () => {
      const response = await api.get("/salesman-bonuses", {
        params: {
          salesmanCode: formState.salesmanCode || undefined,
          limit: 20,
          offset: 0
        }
      });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        salesmanCode: formState.salesmanCode,
        startDate: formState.startDate,
        endDate: formState.endDate,
        targetAmount: Number(formState.targetAmount) || 0,
        bonusPercent: Number(formState.bonusPercent) || 0,
        notes: formState.notes
      };
      const response = await api.post("/salesman-bonuses", payload);
      return response.data;
    },
    onSuccess: () => {
      api.get("/metadata/next/salesman-bonus").then((response) => {
        if (response.data?.nextVoucher) {
          setMeta({ nextVoucher: response.data.nextVoucher });
        }
      });
      setFormState({
        salesmanCode: "",
        salesmanLabel: "",
        startDate: toDisplay(new Date()),
        endDate: toDisplay(new Date()),
        targetAmount: "",
        bonusPercent: "",
        notes: ""
      });
      queryClient.invalidateQueries({ queryKey: ["salesman-bonuses"] });
    }
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Salesman Bonus"
        description="Assign target-based bonuses with fixed amounts and/or percentage incentives."
        actions={
          <div className="flex items-center gap-3">
            {mutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Bonus saved</span>
            ) : mutation.isError ? (
              <span className="text-xs text-rose-400">{mutation.error.message}</span>
            ) : null}
          </div>
        }
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <FormField label="Voucher No.">
            <input value={meta.nextVoucher} disabled />
          </FormField>
          <SearchSelect
            label="Salesman"
            placeholder="Search salesman"
            value={
              formState.salesmanCode
                ? { label: formState.salesmanLabel || formState.salesmanCode }
                : null
            }
            onSelect={(option) =>
              setFormState((prev) => ({
                ...prev,
                salesmanCode: option.code,
                salesmanLabel: option.label
              }))
            }
            onSearch={setSalesmanQuery}
            results={
              salesmanLookup.data?.map((salesman) => ({
                value: salesman.id,
                code: salesman.code,
                label: `${salesman.code} — ${salesman.name}`
              })) ?? []
            }
          />
          <FormField label="Start Date" required>
            <input
              value={formState.startDate}
              onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
          <FormField label="End Date" required>
            <input
              value={formState.endDate}
              onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
          <FormField label="Target Sale Amount" required>
            <input
              type="number"
              value={formState.targetAmount}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, targetAmount: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Bonus Percent" required>
            <input
              type="number"
              value={formState.bonusPercent}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, bonusPercent: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Total Amount">
            <input value={formatCurrency(bonusPreview.achieved)} disabled />
          </FormField>
          <FormField label="Gained Amount">
            <input value={formatCurrency(bonusPreview.totalBonus)} disabled />
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </FormField>

          <div className="md:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-4">
                <span>Total Sale: <strong>{formatCurrency(bonusPreview.achieved)}</strong></span>
                <span>Target: <strong>{formatCurrency(bonusPreview.target)}</strong></span>
                <span>Status: <strong>{bonusPreview.targetMet ? "Target Met" : "Pending"}</strong></span>
                <span>Gained Amount: <strong>{formatCurrency(bonusPreview.totalBonus)}</strong></span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Gained Amount is calculated when target is met: total sale × bonus percent.
              </p>
            </div>
          </div>

          <div className="flex items-end justify-end gap-3 md:col-span-2">
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Bonus"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Recent Bonuses"
        description="Latest bonus plans created for salesmen."
      >
        {bonusQuery.isLoading || bonusQuery.isFetching ? (
          <p className="text-xs text-slate-500">Loading bonuses…</p>
        ) : bonusQuery.isError ? (
          <p className="text-xs text-rose-600">{bonusQuery.error.message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Voucher</th>
                  <th className="px-4 py-2 text-left">Salesman</th>
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-right">Target</th>
                  <th className="px-4 py-2 text-right">Total Sale</th>
                  <th className="px-4 py-2 text-right">Bonus %</th>
                  <th className="px-4 py-2 text-right">Gained Amount</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bonusQuery.data?.length ? (
                  bonusQuery.data.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-middle">{row.voucher_no}</td>
                      <td className="px-4 py-3 align-middle">
                        {row.salesman_name ? `${row.salesman_code} — ${row.salesman_name}` : row.salesman_code}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {row.start_date} → {row.end_date}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">{formatCurrency(row.target_amount)}</td>
                      <td className="px-4 py-3 align-middle text-right">{formatCurrency(row.achieved_sales)}</td>
                      <td className="px-4 py-3 align-middle text-right">{Number(row.bonus_percent || 0).toFixed(2)}%</td>
                      <td className="px-4 py-3 align-middle text-right">
                        {formatCurrency(row.bonus_earned)}
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <span
                          className={
                            row.target_met
                              ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                              : "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
                          }
                        >
                          {row.target_met ? "Met" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No bonus records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default SalesmanBonusPage;
