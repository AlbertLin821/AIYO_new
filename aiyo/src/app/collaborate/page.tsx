import { redirect } from "next/navigation";

/**
 * 舊版協作路徑；實際導向以 `next.config.ts` 的 redirects 為主（保留查詢字串）。
 * 此頁面供路由與型別產物一致，避免建置快取指向已移除的模組。
 */
export default function LegacyCollaboratePage() {
  redirect("/itinerary");
}
