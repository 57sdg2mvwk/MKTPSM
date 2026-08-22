export const toNonNegativeInteger = (value: unknown): number | undefined => {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
};

export const deriveOrderMetrics = ({
  quantity,
  status,
  progress,
  remains,
}: {
  quantity: number;
  status: string;
  progress: number;
  remains: number | null;
}) => {
  const delivered = remains == null
    ? null
    : Math.max(0, Math.min(quantity, quantity - remains));
  const nextProgress = status === "Completado"
    ? 100
    : delivered == null
      ? progress
      : Math.round((delivered / quantity) * 100);
  return { delivered, progress: nextProgress };
};