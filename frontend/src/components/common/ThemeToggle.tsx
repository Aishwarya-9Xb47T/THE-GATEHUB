import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-md w-9 h-9 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
