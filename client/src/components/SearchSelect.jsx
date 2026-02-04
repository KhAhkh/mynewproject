import { useEffect, useState } from "react";

const scrollbarStyles = `
  .thick-scrollbar::-webkit-scrollbar {
    width: 12px;
  }
  .thick-scrollbar::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 10px;
  }
  .thick-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5f5;
    border-radius: 10px;
  }
  .thick-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  .thick-scrollbar {
    scrollbar-width: thick;
    scrollbar-color: #cbd5f5 #f1f5f9;
  }
`;

const SearchSelect = ({
  label,
  value,
  onSelect,
  placeholder,
  results = [],
  renderItem,
  onSearch,
  className = "",
  dataTestId,
  emptyMessage = "No matches",
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled]);

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    if (onSearch) onSearch(query);
  };

  const handleChange = (event) => {
    if (disabled) return;
    const newQuery = event.target.value;
    setQuery(newQuery);
    if (onSearch) onSearch(newQuery);
  };

  return (
    <div className={`relative text-sm ${className}`}>
      {label ? <label className="block text-slate-600 mb-1 font-semibold">{label}</label> : null}
      <input
        className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 transition ${
          disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-white"
        }`}
        value={open ? query : value?.label || ""}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-test-id={dataTestId}
        disabled={disabled}
      />
      {open && !disabled ? (
        <>
          <style>{scrollbarStyles}</style>
          <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-[0_20px_45px_rgba(15,23,42,0.12)] max-h-64 overflow-y-auto thick-scrollbar">
          {results.length === 0 ? (
            <p className="p-3 text-slate-500 text-xs">{emptyMessage}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((item) => (
                <li
                  key={item.value ?? item.code ?? item.label}
                  className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-slate-700"
                  onMouseDown={() => {
                    if (disabled) return;
                    onSelect?.(item);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {renderItem ? renderItem(item) : <span>{item.label}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        </>
      ) : null}
    </div>
  );
};

export default SearchSelect;
