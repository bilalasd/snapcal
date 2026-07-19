import { localDateString, type ApiMeal } from "./types";

// Meals → spreadsheet-ready CSV for the Settings export. One row per item;
// times in the device's local time, since that's what "when I ate" means.

export function csvField(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = ["date", "time", "meal", "item", "portion", "calories", "protein_g", "carbs_g", "fat_g", "planned", "source"];

export function mealsCsv(meals: ApiMeal[]): string {
  const rows = [HEADER.join(",")];
  const sorted = [...meals].sort((a, b) => (a.eatenAt < b.eatenAt ? -1 : 1));
  for (const meal of sorted) {
    const eaten = new Date(meal.eatenAt);
    const date = localDateString(eaten);
    const time = `${String(eaten.getHours()).padStart(2, "0")}:${String(eaten.getMinutes()).padStart(2, "0")}`;
    for (const item of meal.items) {
      rows.push(
        [date, time, meal.name, item.name, item.portion, item.calories, item.proteinG, item.carbsG, item.fatG, meal.planned, meal.source]
          .map(csvField)
          .join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n"; // CRLF per RFC 4180
}
