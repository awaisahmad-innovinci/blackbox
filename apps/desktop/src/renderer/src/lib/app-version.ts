import { useEffect, useState } from "react";

export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    let cancelled = false;
    void window.blackbox?.getAppVersion?.().then((value) => {
      if (!cancelled && value) setVersion(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return version;
}
