const FormField = ({ label, children, required, description, htmlFor, className = "" }) => {
  return (
    <label className={`flex flex-col gap-2 text-sm ${className}`} htmlFor={htmlFor}>
      <span className="text-slate-600 font-semibold">
        {label}
        {required ? <span className="text-rose-400"> *</span> : null}
      </span>
      {description ? <span className="text-xs text-slate-400">{description}</span> : null}
      {children}
    </label>
  );
};

export default FormField;
