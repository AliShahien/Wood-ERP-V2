"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const label = t(theme === "dark" ? "common.enableLightMode" : "common.enableDarkMode");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("edge-theme", next); } catch { /* Theme still works for this tab. */ }
    setTheme(next);
  }

  return (
    <Button type="button" variant="ghost" size={showLabel ? "sm" : "icon"} onClick={toggle} aria-label={label} aria-pressed={theme === "dark"} title={label}>
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {showLabel ? <span>{label}</span> : null}
    </Button>
  );
}
