import { agentUISchema, type AgentUI } from "@/lib/agentUI/schema";
import { osmSourceUrl } from "@/lib/osmSourceUrl";

type Change = { type: string; before?: { title: string; time?: string; dayNumber?: number }; after?: { title: string; time?: string; dayNumber?: number; location?: { placeId?: string; resolvedFrom?: string; checkedAt?: string; website?: string } } };

function itemLabel(item?: { title: string; time?: string; dayNumber?: number }) {
  if (!item) return undefined;
  return `${item.dayNumber ? `第 ${item.dayNumber} 天 · ` : ""}${item.time ? `${item.time} ` : ""}${item.title}`;
}

export function buildPreviewUI(changes: Change[], operations: Array<{ type: string; time?: string }> = []): AgentUI {
  const components = changes.map((change, index) => ({
    kind: "itinerary_diff" as const,
    actionId: `change_${index}`,
    props: {
      summary: change.type === "add_item" ? "加入地點" : change.type === "remove_item" ? "移除地點" : change.type === "move_item" ? "移動地點" : "替換地點",
      before: itemLabel(change.before),
      after: itemLabel(change.after),
    },
  }));
  const timeControls = operations.flatMap((operation, index) =>
    (operation.type === "add_item" || operation.type === "replace_item" || operation.type === "move_item") && changes[index]?.after?.time
      ? [{ kind: "date_time" as const, actionId: `time_${index}`, props: { label: `${changes[index].after?.title || "地點"}時間`, day: changes[index].after?.dayNumber || 1, time: changes[index].after!.time! } }]
      : []);
  const placeControls = operations.flatMap((operation, index) => {
    const after = changes[index]?.after;
    if ((operation.type !== "add_item" && operation.type !== "replace_item") || !after) return [];
    const provider = after.location?.resolvedFrom;
    return [
      { kind: "place_card" as const, actionId: `place_card_${index}`, props: { title: after.title, category: provider === "photon" ? "Photon 地圖資料" : provider === "overpass" ? "OpenStreetMap 地點" : "已選地點", checkedAt: after.location?.checkedAt, sourceUrl: osmSourceUrl(after.location?.placeId) || undefined } },
      { kind: "form" as const, actionId: `place_${index}`, props: { label: `替換${after.title}`, placeholder: "輸入另一個景點或店家名稱" } },
    ];
  });
  return agentUISchema.parse({ version: 1, components: [...components, ...placeControls, ...timeControls, { kind: "confirm_button", actionId: "apply_preview", props: { label: "確認套用" } }] });
}
