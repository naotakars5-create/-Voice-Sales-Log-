import type { DealStatus, Temperature } from "@/types/db";

export function temperatureClass(t: Temperature | null): string {
  switch (t) {
    case "高":
      return "bg-red-50 text-red-700";
    case "中":
      return "bg-amber-50 text-amber-700";
    case "低":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-neutral-100 text-neutral-500";
  }
}

export function dealStatusClass(s: DealStatus): string {
  switch (s) {
    case "受注":
      return "bg-green-50 text-green-700";
    case "失注":
      return "bg-neutral-200 text-neutral-500";
    case "検討中":
      return "bg-amber-50 text-amber-700";
    case "提案中":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}
