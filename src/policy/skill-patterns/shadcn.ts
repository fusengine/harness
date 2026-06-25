/**
 * shadcn/ui HTML-to-component detection patterns, ported verbatim from the
 * shared `shadcn_patterns.py` (FORM/OVERLAY/DATA/NAV/LAYOUT/FEEDBACK groups).
 * 32 patterns total (3+6+8+5+5+5). Matched case-insensitively (source `re.IGNORECASE`).
 */

/** Forms: Button, Input, Textarea, Select, Checkbox, Radio, Switch, etc. */
const FORM: ReadonlyArray<string> = [
  "<(button|input|select|textarea|label|option|optgroup)\\b",
  "type=\"(checkbox|radio|range|file)\"",
  "<input[^>]*maxLength=\"[1-2]\"",
];

/** Overlay: Dialog, AlertDialog, Sheet, Popover, Tooltip, ContextMenu, etc. */
const OVERLAY: ReadonlyArray<string> = [
  "<dialog\\b",
  "role=\"(dialog|alertdialog)\"",
  "(aria-haspopup|aria-expanded|aria-pressed)=\"",
  "(onContextMenu|onMouseEnter.*onMouseLeave)\\b",
  "\\b(confirm|window\\.confirm)\\(",
  "title=\"[^\"]{2,}\"",
];

/** Data: Table, Card, Badge, Avatar, Calendar, Chart, Carousel, Pagination. */
const DATA: ReadonlyArray<string> = [
  "<(table|thead|tbody|tfoot|th|td|tr|caption|colgroup)\\b",
  "<(article|section)\\b[^>]*className",
  "rounded-full[^>]*className|className[^>]*rounded-full",
  "<img\\b[^>]*rounded",
  "(new Date|\\.toLocaleDateString|date-fns|dayjs)\\b",
  "(recharts|chart\\.js|<svg[^>]*viewBox)",
  "(scroll-snap|embla-carousel|useEmbla)\\b",
  "(page=|currentPage|totalPages|pageSize)\\b",
];

/** Navigation: Breadcrumb, NavigationMenu, Menubar, Sidebar, Tabs. */
const NAV: ReadonlyArray<string> = [
  "<(nav|aside)\\b",
  "<(menu|menuitem)\\b",
  "role=\"(menubar|menu|menuitem|tablist|tab|tabpanel)\"",
  "aria-label=\"(breadcrumb|navigation|sidebar)\"",
  "aria-current=\"(page|step)\"",
];

/** Layout: Accordion, Collapsible, Separator, ScrollArea, AspectRatio. */
const LAYOUT: ReadonlyArray<string> = [
  "<(hr|details|summary)\\b",
  "role=\"separator\"",
  "overflow-(auto|scroll|y-auto|x-auto)",
  "(aspect-ratio|aspect-video|aspect-square)\\b",
  "(resize|cursor-(col|row)-resize)\\b",
];

/** Feedback: Alert, Toast, Progress, Skeleton, Spinner. */
const FEEDBACK: ReadonlyArray<string> = [
  "role=\"(alert|status|progressbar)\"",
  "aria-live=\"(polite|assertive)\"",
  "<progress\\b",
  "(animate-pulse|animate-spin)\\b",
  "(sonner|react-hot-toast|\\.toast\\()\\b",
];

/** All 32 shadcn detection patterns combined. */
export const SHADCN: ReadonlyArray<string> = [
  ...FORM, ...OVERLAY, ...DATA, ...NAV, ...LAYOUT, ...FEEDBACK,
];
