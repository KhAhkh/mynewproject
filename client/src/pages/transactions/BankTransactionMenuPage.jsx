import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";

const options = [
  {
    to: "/transactions/bank/deposit",
    title: "Bank Deposit",
    description: "Record incoming funds and keep the bank balance up to date."
  },
  {
    to: "/transactions/bank/drawing",
    title: "Bank Drawing",
    description: "Capture withdrawals or drawings made from the bank account."
  }
];

const BankTransactionMenuPage = () => (
  <div className="space-y-6">
    <SectionCard
      title="Bank Transactions"
      description="Choose the type of bank transaction you want to capture."
    >
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {options.map((option) => (
          <Link
            key={option.to}
            to={option.to}
            className="group block rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_18px_45px_rgba(79,70,229,0.18)]"
          >
            <h3 className="text-base font-semibold text-slate-800 group-hover:text-indigo-600">
              {option.title}
            </h3>
            <p className="mt-2 text-sm text-slate-500">{option.description}</p>
            <span className="mt-4 inline-flex items-center text-xs font-medium text-indigo-500">
              Continue
              <svg
                aria-hidden="true"
                className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M5.5 3.5L10 8L5.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  </div>
);

export default BankTransactionMenuPage;
