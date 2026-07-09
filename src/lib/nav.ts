/**
 * Where the central "+" should log. On the Today screen a past day is carried
 * in `?date=YYYY-MM-DD`; the new meal must land on that day, not today.
 */
export function addMealHref(pathname: string, date: string | null): string {
  if (pathname === "/" && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `/add?date=${date}`;
  }
  return "/add";
}
