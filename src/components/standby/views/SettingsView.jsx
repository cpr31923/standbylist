import React, { useMemo } from "react";

export default function SettingsView({
  email = "—",
  homePlatoon = "",
  saveHomePlatoon = () => {},
  onSignOut = () => {},
  onChangePassword = () => {},
  onResetTour = () => {},
  onSendFeedback = () => {},
}) {
  const appVersion = useMemo(() => {
  return String(import.meta.env?.VITE_APP_VERSION || "MISSING_ENV").trim();
}, []);


  const buildLabel = useMemo(() => {
    // Optional: define VITE_BUILD_SHA / VITE_BUILD_DATE later if you want.
    const sha = (import.meta?.env?.VITE_BUILD_SHA || "").trim();
    const date = (import.meta?.env?.VITE_BUILD_DATE || "").trim();
    const parts = [];
    if (sha) parts.push(sha);
    if (date) parts.push(date);
    return parts.length ? parts.join(" • ") : "";
  }, []);

  const handleSendFeedback = () => {
    // Support either signature:
    // - onSendFeedback(versionString)
    // - onSendFeedback({ version, buildLabel })
    try {
      if (typeof onSendFeedback !== "function") return;

      // If the handler looks like it wants an object, send an object.
      // Otherwise, send a simple string.
      if (onSendFeedback.length >= 1) {
        // Try object first (more future-proof), but don’t break older handlers.
        try {
          onSendFeedback({ version: appVersion, buildLabel });
        } catch {
          onSendFeedback(appVersion);
        }
      } else {
        onSendFeedback();
      }
    } catch {
      // no-op: feedback shouldn't crash settings
    }
  };

  return (
    <div>
      <div className="mb-3">
        <div className="text-xl font-extrabold text-slate-900">Settings</div>
      </div>

      <div className="space-y-3">
        {/* Account */}
        <div className="rounded-md shadow-sm border border-slate-200 bg-white p-4">
          <div className="text-md font-extrabold text-slate-900">Account</div>

          <div className="mt-2 text-sm text-slate-700">
            <div className="text-xs font-semibold text-slate-500">Email</div>
            <div className="mt-0.5 font-semibold">{email}</div>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="text-xs font-semibold text-slate-500">Home platoon</div>
            <select
              value={homePlatoon || ""}
              onChange={(e) => saveHomePlatoon(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold"
            >
              <option value="">— Select —</option>
              <option value="A">A Platoon</option>
              <option value="B">B Platoon</option>
              <option value="C">C Platoon</option>
              <option value="D">D Platoon</option>
            </select>
            <div className="mt-1 text-xs text-slate-500">
              Used to display your shifts in Calendar → My Calendar
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Sign out
            </button>

            <button
              type="button"
              onClick={onChangePassword}
              className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Change password
            </button>
          </div>
        </div>

        {/* Help */}
        <div className="rounded-md shadow-sm border border-slate-200 bg-white p-4">
          <div className="text-md font-extrabold text-slate-900">Help</div>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={onResetTour}
              className="w-full rounded-md border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-50 active:scale-[0.99] transition"
            >
              Re-run app tour
            </button>
          </div>
        </div>

        {/* About */}
        <div className="rounded-md shadow-sm border border-slate-200 bg-white p-4">
          <div className="text-md font-extrabold text-slate-900">About</div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleSendFeedback}
              className="w-full rounded-md bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 active:scale-[0.99] transition shadow-sm"
            >
              Send app feedback
            </button>
          </div>

          <div className="mt-3 text-sm text-slate-700 leading-relaxed space-y-3">
            <p>
              This app started as a personal side project. I built it because I was frustrated that there wasn’t an easy way
              to track standby commitments, after trying spreadsheets, Notes apps, and old-fashioned pen and paper with limited
              success.
            </p>
            <p>
              Shift IOU is designed as a simple, private tool to help individuals keep track of their own standby arrangements.
              It is not an official system of record and should not be relied on as your only source of truth.
            </p>
            <p>This app is not affiliated with, endorsed by, or connected to DFES or any other organisation.</p>
            <p>
              Your data is stored per-account and protected by access controls, but this is a personal beta project and no
              guarantees are made about uptime, accuracy, or data retention. Please keep your own backup if the information
              matters to you.
            </p>
            <p>
              By using this app you accept that it is provided “as-is”, and that no responsibility is taken for data loss,
              errors, or consequences arising from its use.
            </p>

            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500">Privacy</div>
              <div className="text-sm text-slate-700">
                Your entries are private to your account and are not visible to other users. No data is sold, shared, or used
                for any purpose other than providing the app’s functionality.
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
          © {new Date().getFullYear()} Shift IOU developed by Cam Reyniers • v{appVersion} • BETA
        </div>
      </div>
    </div>
  );
}
