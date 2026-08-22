type ServiceMetricsInput = {
  serviceId: string;
  status: string;
  quantity: number;
  createdAt: Date;
  firstSyncedAt: Date | null;
  completedAt: Date | null;
};

export type ServiceInsight = {
  orderCount: number;
  requestedUnits: number;
  completionRate: number | null;
  medianDurationMinutes: number | null;
  medianFirstUpdateMinutes: number | null;
  isDataSufficient: boolean;
  tags: string[];
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const isCompleted = (status: string) => status === "Completado";
const isFinal = (status: string) => ["Completado", "Cancelado", "Reembolso"].includes(status);

export const calculateServiceInsights = (services: Array<{ id: string; pricePerThousandMicros: number | null }>, orders: ServiceMetricsInput[]) => {
  const values = new Map<string, ServiceInsight>();
  for (const service of services) {
    const ownOrders = orders.filter((order) => order.serviceId === service.id);
    const finalOrders = ownOrders.filter((order) => isFinal(order.status));
    const completed = finalOrders.filter((order) => isCompleted(order.status));
    const durations = completed
      .filter((order) => order.completedAt)
      .map((order) => Math.max(0, Math.round((order.completedAt!.getTime() - order.createdAt.getTime()) / 60000)));
    const firstUpdates = ownOrders
      .filter((order) => order.firstSyncedAt)
      .map((order) => Math.max(0, Math.round((order.firstSyncedAt!.getTime() - order.createdAt.getTime()) / 60000)));
    values.set(service.id, {
      orderCount: ownOrders.length,
      requestedUnits: ownOrders.reduce((sum, order) => sum + order.quantity, 0),
      completionRate: finalOrders.length ? Math.round((completed.length / finalOrders.length) * 100) : null,
      medianDurationMinutes: median(durations),
      medianFirstUpdateMinutes: median(firstUpdates),
      isDataSufficient: ownOrders.length >= 3 && completed.length >= 2,
      tags: [],
    });
  }

  const sufficient = services.filter((service) => values.get(service.id)?.isDataSufficient);
  const addWinnerTag = (candidates: typeof sufficient, compare: (a: ServiceInsight, b: ServiceInsight) => number, tag: string) => {
    if (!candidates.length) return;
    const winner = candidates
      .map((service) => ({ service, insight: values.get(service.id)! }))
      .sort((a, b) => compare(a.insight, b.insight))[0];
    if (winner) winner.insight.tags.push(tag);
  };

  addWinnerTag(sufficient, (a, b) => b.orderCount - a.orderCount, "Mas solicitado");
  addWinnerTag(
    sufficient.filter((service) => values.get(service.id)?.medianDurationMinutes != null),
    (a, b) => (a.medianDurationMinutes ?? Number.MAX_SAFE_INTEGER) - (b.medianDurationMinutes ?? Number.MAX_SAFE_INTEGER),
    "Mas rapido",
  );
  addWinnerTag(
    sufficient.filter((service) => values.get(service.id)?.completionRate != null),
    (a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1),
    "Mas estable",
  );

  const cheapest = services
    .filter((service) => service.pricePerThousandMicros != null)
    .sort((a, b) => (a.pricePerThousandMicros ?? Number.MAX_SAFE_INTEGER) - (b.pricePerThousandMicros ?? Number.MAX_SAFE_INTEGER))[0];
  if (cheapest) values.get(cheapest.id)?.tags.push("Mejor costo");
  return values;
};