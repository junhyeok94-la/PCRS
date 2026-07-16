"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (online) return null;

  return <p role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-md rounded-xl bg-slate-900 px-4 py-3 text-center text-xs font-bold text-white shadow-lg">오프라인 상태입니다. 저장된 화면은 볼 수 있지만 새 날씨 분석은 연결 후 갱신됩니다.</p>;
}
