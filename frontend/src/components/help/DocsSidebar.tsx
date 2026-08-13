import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { DOC_NAV } from "@/content/docs/docsManifest";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { DOC_GROUP_ICONS, getDocIcon } from "./docsNavIcons";
import { useDocsReadingProgress } from "./useDocsReadingProgress";

interface DocsSidebarProps {
  basePath?: string;
  audience?: "student" | "instructor" | "admin";
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DocsSidebar({
  basePath = "/help",
  audience,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: DocsSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const progress = useDocsReadingProgress(location.pathname.match(/\/help\/[^/]+$/) !== null);

  const currentSlug = location.pathname.replace(basePath, "").replace(/^\//, "") || "";

  const openGroups = useMemo(() => {
    const initial: Record<string, boolean> = {};
    DOC_NAV.forEach((g) => {
      initial[g.id] = g.items.some((i) => i.slug === currentSlug);
    });
    return initial;
  }, [currentSlug]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(openGroups);

  useEffect(() => {
    setExpanded((prev) => ({ ...prev, ...openGroups }));
  }, [openGroups]);

  const toggleGroup = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const goSearch = () => {
    if (filter.trim()) {
      navigate(`${basePath}/search?q=${encodeURIComponent(filter.trim())}`);
      onNavigate?.();
    } else {
      navigate(`${basePath}/search`);
      onNavigate?.();
    }
  };

  return (
    <aside className={cn("docs-sidebar", collapsed && "docs-sidebar--collapsed")}>
      <div className="docs-sidebar__toolbar">
        {!collapsed && (
          <div className="docs-sidebar__search">
            <Search className="docs-sidebar__search-icon" />
            <input
              type="search"
              placeholder="Search…"
              className="docs-sidebar__search-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goSearch()}
            />
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            className="docs-sidebar__collapse-btn hidden lg:flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="docs-sidebar__nav">
        {DOC_NAV.map((group) => {
          const GroupIcon = DOC_GROUP_ICONS[group.id] ?? ChevronRight;
          const items = group.items
            .filter((item) => !filter || item.label.toLowerCase().includes(filter.toLowerCase()))
            .filter(
              (item) =>
                !audience ||
                !item.audience ||
                item.audience === audience ||
                item.slug === "getting-started" ||
                item.slug === "faq",
            );

          if (!items.length) return null;
          const isOpen = collapsed || expanded[group.id] !== false;

          return (
            <div key={group.id} className="docs-sidebar__group">
              {!collapsed ? (
                <button
                  type="button"
                  className="docs-sidebar__group-label"
                  onClick={() => toggleGroup(group.id)}
                >
                  <GroupIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{group.label}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 ml-auto shrink-0 transition-transform", isOpen && "rotate-180")} />
                </button>
              ) : null}

              <ul className={cn("docs-sidebar__list", !isOpen && "docs-sidebar__list--hidden")}>
                {items.map((item) => {
                  const href = item.slug === "search" ? `${basePath}/search` : `${basePath}/${item.slug}`;
                  const active =
                    currentSlug === item.slug || (item.slug === "search" && currentSlug === "search");
                  const Icon = getDocIcon(item.slug);

                  return (
                    <li key={item.slug}>
                      <Link
                        to={href}
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        className={cn("docs-sidebar__link", active && "docs-sidebar__link--active")}
                      >
                        <Icon className="docs-sidebar__link-icon" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="docs-sidebar__footer">
          <div className="docs-sidebar__progress-track">
            <div className="docs-sidebar__progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </aside>
  );
}
