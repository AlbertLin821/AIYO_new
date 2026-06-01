import assert from "node:assert/strict";
import test from "node:test";
import { reorderItemsWithRetime, retimeDayItems, toMinutes } from "@/lib/itineraryRetime";
import type { TripPlanItem } from "@/types";

function makeItem(
  id: string,
  time: string,
  extras?: Partial<TripPlanItem>,
): TripPlanItem {
  return {
    id,
    dayNumber: 1,
    time,
    title: id,
    type: "attraction",
    ...extras,
  };
}

function swapAdjacent(items: TripPlanItem[], index: number): TripPlanItem[] {
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(index + 1, 0, moved);
  return next;
}

test("swap keeps original day start and does not clamp to 23:59", () => {
  const previous = [
    makeItem("a", "09:00"),
    makeItem("b", "10:30"),
    makeItem("c", "12:00"),
  ];
  const swapped = [previous[1]!, previous[0]!, previous[2]!];
  const result = retimeDayItems(swapped, {
    dayStartMinutes: toMinutes(previous[0]!.time),
    previousItems: previous,
  });

  assert.equal(result[0]?.time, "09:00");
  assert.equal(result[1]?.time, "10:30");
  assert.equal(result[2]?.time, "12:00");
  assert.notEqual(result[2]?.time, "23:59");
});

test("stale transportDurationMinutes is not reused after reorder", () => {
  const previous = [
    makeItem("a", "09:00", { location: { name: "A", lat: 35.68, lng: 139.76, description: "A" } }),
    makeItem("b", "11:00", {
      location: { name: "B", lat: 35.7, lng: 139.77, description: "B" },
      transportDurationMinutes: 120,
    }),
  ];
  const swapped = [previous[1]!, previous[0]!];
  const result = retimeDayItems(swapped, {
    dayStartMinutes: toMinutes(previous[0]!.time),
    previousItems: previous,
  });

  assert.equal(result[0]?.time, "09:00");
  assert.ok(
    typeof result[1]?.transportDurationMinutes === "number" &&
      result[1].transportDurationMinutes > 0 &&
      result[1].transportDurationMinutes < 120,
  );
});

test("round-trip adjacent swaps keep stable times", () => {
  const previous = [
    makeItem("a", "09:00"),
    makeItem("b", "10:30"),
    makeItem("c", "12:00"),
  ];

  const once = retimeDayItems(swapAdjacent(previous, 0), {
    dayStartMinutes: toMinutes(previous[0]!.time),
    previousItems: previous,
  });
  const twice = retimeDayItems(swapAdjacent(once, 0), {
    dayStartMinutes: toMinutes(previous[0]!.time),
    previousItems: once,
  });

  assert.deepEqual(
    twice.map((item) => item.time),
    previous.map((item) => item.time),
  );
});

test("items without coordinates use default travel minutes", () => {
  const previous = [makeItem("a", "09:00"), makeItem("b", "10:00")];
  const result = retimeDayItems(previous, { previousItems: previous });

  assert.equal(result[1]?.transportDurationMinutes, 30);
});

test("reorderItemsWithRetime matches manual swap retime", () => {
  const previous = [
    makeItem("a", "09:00"),
    makeItem("b", "10:30"),
    makeItem("c", "12:00"),
  ];
  const manual = retimeDayItems([previous[1]!, previous[0]!, previous[2]!], {
    dayStartMinutes: toMinutes(previous[0]!.time),
    previousItems: previous,
  });
  const viaHelper = reorderItemsWithRetime(previous, ["b", "a", "c"]);

  assert.deepEqual(
    viaHelper.map((item) => item.time),
    manual.map((item) => item.time),
  );
});
