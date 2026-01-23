import React from "react";

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  disabled = false,
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 disabled:opacity-60"
      />
    </div>
  );
}

export function TextAreaField({ label, value, onChange, disabled = false, placeholder }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-1 w-full min-h-[90px] rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 disabled:opacity-60"
      />
    </div>
  );
}
