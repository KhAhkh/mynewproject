const SectionCard = ({ title, description, children, actions, className = "" }) => {
  return (
    <section
      className={`relative overflow-visible rounded-[28px] border border-[#d8deeb] bg-white/95 shadow-[0_32px_70px_-38px_rgba(15,23,42,0.58)] backdrop-blur-[2px] p-8 space-y-6 print:bg-white print:shadow-none print:border-0 print:p-0 print:space-y-3 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.7),_transparent_65%)] print:hidden" />
      <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/60 opacity-20 print:hidden" />
      <div className="relative">
        <header className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2 print:hidden">{actions}</div> : null}
        </header>
        <div className="mt-4 grid gap-4 text-sm text-slate-700 print:gap-3">{children}</div>
      </div>
    </section>
  );
};

export default SectionCard;
