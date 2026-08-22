export const FINAL_ORDER_STATUSES = ["Completado", "Cancelado", "Reembolso", "Parcial"] as const;

export const isFinalOrderStatus = (status: string) => FINAL_ORDER_STATUSES.includes(status as (typeof FINAL_ORDER_STATUSES)[number]);

export const normalizeProviderStatus = (value: unknown, fallback: string) => {
  const status = String(value ?? "").trim().toLowerCase();
  if (!status) return fallback;
  if (status.includes("partial") || status.includes("parcial")) return "Parcial";
  if (status.includes("complete") || status.includes("deliver") || status.includes("finish") || status.includes("complet")) return "Completado";
  if (status.includes("cancel") || status.includes("canceled") || status.includes("cancelled")) return "Cancelado";
  if (status.includes("refund") || status.includes("reembolso")) return "Reembolso";
  if (status.includes("pending") || status.includes("pendiente")) return "Pendiente";
  if (status.includes("progress") || status.includes("process") || status.includes("active") || status.includes("curso") || status.includes("progreso")) return "En proceso";
  return fallback;
};

export const settleOrderCredit = ({
  status,
  currentCostMicros,
  providerChargeMicros,
  finalRefundApplied,
}: {
  status: string;
  currentCostMicros: number | null;
  providerChargeMicros?: number;
  finalRefundApplied: boolean;
}) => {
  const isFullRelease = status === "Cancelado" || status === "Reembolso";
  if (isFullRelease) {
    return {
      nextCostMicros: 0,
      adjustmentMicros: 0,
      refundMicros: finalRefundApplied || currentCostMicros == null ? 0 : -currentCostMicros,
    };
  }
  const nextCostMicros = providerChargeMicros ?? currentCostMicros;
  return {
    nextCostMicros,
    adjustmentMicros: nextCostMicros == null || currentCostMicros == null ? 0 : nextCostMicros - currentCostMicros,
    refundMicros: 0,
  };
};