import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { creditLedgerTable, creditPeriodsTable, db, orderStatusEventsTable, ordersTable, servicesTable } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetDashboardResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  GetServicesResponse,
  RefillOrderBody,
  RefillOrderResponse,
  ReconcileOrderReservationBody,
  SyncOrderStatusBody,
  SyncOrderStatusResponse,
} from "@workspace/api-zod";
import { deriveOrderMetrics, toNonNegativeInteger } from "../lib/order-metrics";
import { CreditNotStartedError, InsufficientCreditError, UnpricedServiceError, decimalToMicros, estimateCostMicros, getCreditBalance, getCreditWindow, getOrCreateCreditPeriod, microsToUsd } from "../lib/credit";
import { calculateServiceInsights } from "../lib/service-insights";
import { getUserFromToken, SESSION_COOKIE } from "../lib/auth";
import { ProviderRejectedError, marketerum } from "../lib/marketerum";
import { isFinalOrderStatus, normalizeProviderStatus, settleOrderCredit } from "../lib/order-status";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();
const statuses = ["En proceso", "Completado", "Pendiente", "Cancelado", "Reembolso", "Parcial"];
const configuredServiceIds = new Set(["1934", "8631", "910", "998", "1129", "5559", "4665", "4668", "11161", "9397", "11228", "11241"]);
const RESERVATION_RECONCILIATION_GRACE_MS = 30_000;
const whitelabelServiceProfiles: Record<string, { name: string; platform?: string; contentType: string; description: string }> = {
  "8631": { name: "Facebook Perfil · Seguidores Globales", contentType: "Seguidores", description: "Crecimiento de seguidores para perfiles publicos de Facebook." },
  "1934": { name: "Facebook Seguidores · Audiencia de Pagina", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook." },
  "910": { name: "Facebook Pagina · Likes y Seguidores", contentType: "Likes y Seguidores", description: "Interaccion combinada para paginas de Facebook." },
  "1129": { name: "Facebook Seguidores · Calidad Estable", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook." },
  "5559": { name: "Facebook Seguidores · Calidad Estable", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook." },
  "998": { name: "Facebook Seguidores · Paginas", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook." },
  "4665": { name: "Facebook Likes · Recarga 7 Dias", contentType: "Me gusta", description: "Interaccion para publicaciones con recarga durante 7 dias." },
  "4668": { name: "Facebook Likes · Recarga 60 Dias", contentType: "Me gusta", description: "Interaccion para publicaciones con recarga durante 60 dias." },
  "11161": { name: "Facebook Reproducciones", contentType: "Reproducciones", description: "Visualizaciones para videos publicados en Facebook." },
  "9397": { name: "Kick Visualizaciones de Clip", contentType: "Reproducciones", description: "Visualizaciones para clips publicados en Kick." },
  "11228": { name: "Kick Audiencia en Vivo", contentType: "Audiencia", description: "Audiencia para transmisiones en vivo en Kick." },
  "11241": { name: "Kick Audiencia en Vivo Flexible", contentType: "Audiencia", description: "Audiencia para transmisiones en vivo con control flexible." },
};
const LIVE_SERVICES_CACHE_MS = 60_000;
class PendingReservationError extends Error {}

let liveServicesCache: { fetchedAt: number; services: Array<typeof servicesTable.$inferSelect> } | null = null;
let liveServicesRefresh: Promise<Array<typeof servicesTable.$inferSelect>> | null = null;

const validateLinkForPlatform = (platform: string, value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.pathname || url.pathname === "/") return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowedHosts: Record<string, string[]> = {
    Facebook: ["facebook.com", "m.facebook.com", "fb.watch"],
    Kick: ["kick.com"],
    Instagram: ["instagram.com"],
    TikTok: ["tiktok.com"],
    YouTube: ["youtube.com", "youtu.be"],
    Twitter: ["twitter.com", "x.com"],
    Telegram: ["t.me", "telegram.me", "telegram.org"],
    Spotify: ["spotify.com", "open.spotify.com"],
  };
  const allowed = allowedHosts[platform];
  return !allowed || allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
};

const ensureServices = async () => {
  const existing = await db.select().from(servicesTable);
  if (existing.length) return existing;
  const seed = [
    { id: "8631", name: "Facebook Perfil · Seguidores Globales", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para perfiles publicos de Facebook.", minQuantity: 10, maxQuantity: 1000000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "8631" },
    { id: "1934", name: "Facebook Seguidores · Audiencia de Pagina", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook.", minQuantity: 50, maxQuantity: 200000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "1934" },
    { id: "910", name: "Facebook Pagina · Likes y Seguidores", platform: "Facebook", contentType: "Likes y Seguidores", description: "Interaccion combinada para paginas de Facebook.", minQuantity: 100, maxQuantity: 2000000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "910" },
    { id: "1129", name: "Facebook Seguidores · Calidad Estable", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook.", minQuantity: 10, maxQuantity: 1000000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "1129" },
    { id: "5559", name: "Facebook Seguidores · Calidad Estable", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook.", minQuantity: 10, maxQuantity: 1000000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "5559" },
    { id: "998", name: "Facebook Seguidores · Paginas", platform: "Facebook", contentType: "Seguidores", description: "Crecimiento de seguidores para paginas de Facebook.", minQuantity: 10, maxQuantity: 1000000, supportsRefill: false, estimatedTime: "En tiempo real", providerServiceId: "998" },
    { id: "4665", name: "Facebook Likes · Recarga 7 Dias", platform: "Facebook", contentType: "Me gusta", description: "Interaccion para publicaciones con recarga durante 7 dias.", minQuantity: 20, maxQuantity: 500000, supportsRefill: true, estimatedTime: "Tiempo variable", providerServiceId: "4665" },
  ];
  await db.insert(servicesTable).values(seed);
  return db.select().from(servicesTable);
};

const providerPlatform = (service: Record<string, unknown>) => {
  const source = `${service.category ?? ""} ${service.name ?? ""}`.toLowerCase();
  const platforms = ["Instagram", "Facebook", "TikTok", "YouTube", "Twitter", "Telegram", "Spotify", "Kick", "Twitch", "Discord"];
  return platforms.find((platform) => source.includes(platform.toLowerCase())) ?? "Red social";
};

const syncLiveServices = async () => {
  if (liveServicesCache && Date.now() - liveServicesCache.fetchedAt < LIVE_SERVICES_CACHE_MS) {
    return liveServicesCache.services;
  }
  if (liveServicesRefresh) return liveServicesRefresh;
  liveServicesRefresh = (async () => {
    const remoteServices = await marketerum.services();
    if (!Array.isArray(remoteServices)) throw new Error("Invalid provider services response");
    const existing = new Map((await db.select().from(servicesTable)).map((service) => [service.id, service]));
    const selected = remoteServices
      .filter((service) => configuredServiceIds.has(String(service.service ?? service.id ?? "")))
      .map((service) => {
        const id = String(service.service ?? service.id);
        const profile = whitelabelServiceProfiles[id];
        return {
          id,
          name: profile?.name ?? `Servicio social ${id}`,
          platform: profile?.platform ?? providerPlatform(service),
          contentType: profile?.contentType ?? "Servicio",
          description: profile?.description ?? "Servicio social disponible en tiempo real.",
          minQuantity: Number(service.min),
          maxQuantity: Number(service.max),
          supportsRefill: service.refill === true || service.refill === "true",
          estimatedTime: "En tiempo real",
          providerServiceId: id,
          pricePerThousandMicros: decimalToMicros(service.rate) ?? existing.get(id)?.pricePerThousandMicros ?? null,
        };
      })
      .filter((service) => Number.isFinite(service.minQuantity) && Number.isFinite(service.maxQuantity));
    if (!selected.length) throw new Error("Configured provider service not found");
    for (const service of selected) {
      await db.insert(servicesTable).values(service).onConflictDoUpdate({
        target: servicesTable.id,
        set: service,
      });
    }
    const refreshed = await db.select().from(servicesTable).where(inArray(servicesTable.id, [...configuredServiceIds]));
    liveServicesCache = { fetchedAt: Date.now(), services: refreshed };
    return refreshed;
  })();
  try {
    return await liveServicesRefresh;
  } finally {
    liveServicesRefresh = null;
  }
};

const elapsed = (createdAt: Date) => {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

const toOrder = (row: { order: typeof ordersTable.$inferSelect; service: typeof servicesTable.$inferSelect }) => ({
  ...(() => {
    const metrics = deriveOrderMetrics({
      quantity: row.order.quantity,
      status: row.order.status,
      progress: row.order.progress,
      remains: row.order.remains,
    });
    return { remains: row.order.remains, ...metrics };
  })(),
  id: row.order.id,
  serviceId: row.order.serviceId,
  serviceName: row.service.name,
  platform: row.service.platform,
  contentType: row.service.contentType,
  link: row.order.link,
  quantity: row.order.quantity,
  status: row.order.status,
  startCount: row.order.startCount,
  createdAt: row.order.createdAt.toISOString(),
  lastSyncedAt: row.order.lastSyncedAt?.toISOString() ?? null,
  elapsed: elapsed(row.order.createdAt),
  costUsd: microsToUsd(row.order.costMicros),
  durationMinutes: row.order.completedAt ? Math.max(0, Math.round((row.order.completedAt.getTime() - row.order.createdAt.getTime()) / 60000)) : null,
  refillAvailable: row.order.refillAvailable,
  needsReconciliation: !row.order.providerOrderId
    && row.order.status === "Pendiente"
    && Date.now() - row.order.createdAt.getTime() >= RESERVATION_RECONCILIATION_GRACE_MS,
});

const getCreditSummary = async (userId: string) => db.transaction(async (tx) => {
  const window = getCreditWindow();
  if (!window.isActive) {
    return {
      allowanceUsd: microsToUsd(0),
      spentUsd: microsToUsd(0),
      availableUsd: microsToUsd(0),
      periodStartedAt: window.startsAt.toISOString(),
      resetsAt: window.resetsAt.toISOString(),
    };
  }
  const period = await getOrCreateCreditPeriod(tx, userId);
  const { spentMicros, availableMicros } = await getCreditBalance(tx, period);
  return {
    allowanceUsd: microsToUsd(period.allowanceMicros),
    spentUsd: microsToUsd(spentMicros),
    availableUsd: microsToUsd(Math.max(0, availableMicros)),
    periodStartedAt: period.startsAt.toISOString(),
    resetsAt: period.resetsAt.toISOString(),
  };
});

const getServiceCatalog = async (userId: string) => {
  const services = await syncLiveServices();
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.userId, userId));
  const insights = calculateServiceInsights(services, orders);
  return services.map(({ providerServiceId: _providerServiceId, pricePerThousandMicros, ...service }) => {
    const insight = insights.get(service.id)!;
    return {
      ...service,
      pricePerThousandUsd: microsToUsd(pricePerThousandMicros),
      ...insight,
    };
  });
};

const requireUser = async (req: any, res: any) => {
  const user = await getUserFromToken(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return undefined;
  }
  return user;
};

const getRows = async (userId: string, status?: string) => {
  const services = await ensureServices();
  const rows = await db
    .select({ order: ordersTable, service: servicesTable })
    .from(ordersTable)
    .innerJoin(servicesTable, eq(ordersTable.serviceId, servicesTable.id))
    .where(status && statuses.includes(status) ? and(eq(ordersTable.userId, userId), eq(ordersTable.status, status)) : eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt));
  return rows;
};

router.get("/panel/services", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    res.json(GetServicesResponse.parse(await getServiceCatalog(user.id)));
  } catch {
    res.status(503).json({ error: "El catálogo no está disponible en este momento." });
  }
});

router.get("/panel/orders", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = GetOrdersQueryParams.safeParse(req.query);
  const rows = await getRows(user.id, parsed.success ? parsed.data.status : undefined);
  res.json(GetOrdersResponse.parse(rows.map(toOrder)));
});

router.post("/panel/orders", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revisa los datos del pedido." });
    return;
  }
  let [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, parsed.data.serviceId)).limit(1);
  try {
    if (configuredServiceIds.has(parsed.data.serviceId)) {
      [service] = (await syncLiveServices()).filter((candidate) => candidate.id === parsed.data.serviceId);
    }
  } catch {
    res.status(503).json({ error: "El servicio no está disponible en este momento." });
    return;
  }
  if (!service || !validateLinkForPlatform(service.platform, parsed.data.link)) {
    res.status(400).json({ error: `El enlace debe corresponder a ${service?.platform ?? "la red social"} y apuntar a un contenido válido.` });
    return;
  }
  if (!service || parsed.data.quantity < service.minQuantity || parsed.data.quantity > service.maxQuantity) {
    res.status(400).json({ error: "La cantidad no está disponible para este servicio." });
    return;
  }
  const costMicros = service ? estimateCostMicros(service.pricePerThousandMicros, parsed.data.quantity) : undefined;
  if (costMicros == null) {
    res.status(503).json({ error: "El precio del servicio no esta disponible. Intenta mas tarde." });
    return;
  }
  let reservationResult: { order: typeof ordersTable.$inferSelect; isNew: boolean };
  try {
    reservationResult = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(ordersTable)
        .where(and(eq(ordersTable.userId, user.id), eq(ordersTable.requestId, parsed.data.requestId)))
        .limit(1);
      if (existing) return { order: existing, isNew: false };
      const period = await getOrCreateCreditPeriod(tx, user.id);
      const [reservationAfterLock] = await tx.select().from(ordersTable)
        .where(and(eq(ordersTable.userId, user.id), eq(ordersTable.requestId, parsed.data.requestId)))
        .limit(1);
      if (reservationAfterLock) return { order: reservationAfterLock, isNew: false };
      const [unresolvedReservation] = await tx.select().from(ordersTable)
        .where(and(eq(ordersTable.userId, user.id), eq(ordersTable.status, "Pendiente"), isNull(ordersTable.providerOrderId)))
        .limit(1);
      if (unresolvedReservation) throw new PendingReservationError();
      const { availableMicros } = await getCreditBalance(tx, period);
      if (availableMicros < costMicros) throw new InsufficientCreditError();
      const orderId = randomUUID();
      const [createdOrder] = await tx.insert(ordersTable).values({
        id: orderId,
        userId: user.id,
        serviceId: service!.id,
        link: parsed.data.link,
        quantity: parsed.data.quantity,
        requestId: parsed.data.requestId,
        creditPeriodId: period.id,
        costMicros,
        status: "Pendiente",
        progress: 0,
      }).returning();
      await tx.insert(creditLedgerTable).values({
        id: randomUUID(),
        userId: user.id,
        periodId: period.id,
        orderId,
        kind: "reserva-pedido",
        amountMicros: costMicros,
      });
      await tx.insert(orderStatusEventsTable).values({ id: randomUUID(), orderId, userId: user.id, status: "Pendiente" });
      return { order: createdOrder, isNew: true };
    });
  } catch (error) {
    if (error instanceof InsufficientCreditError) {
      res.status(402).json({ error: "Credito insuficiente para este pedido. Espera al proximo reinicio mensual." });
      return;
    }
    if (error instanceof CreditNotStartedError) {
      res.status(503).json({ error: "El credito mensual aun no esta activo." });
      return;
    }
    if (error instanceof PendingReservationError) {
      res.status(409).json({ error: "Ya existe un pedido pendiente de verificacion. Intenta mas tarde." });
      return;
    }
    if (error instanceof UnpricedServiceError) {
      res.status(503).json({ error: "El precio del servicio no esta disponible." });
      return;
    }
    res.status(502).json({ error: "No fue posible reservar el pedido en este momento." });
    return;
  }
  const reservation = reservationResult.order;
  if (reservation.providerOrderId) {
    res.json(CreateOrderResponse.parse(toOrder({ order: reservation, service })));
    return;
  }
  if (reservation.status === "Cancelado") {
    res.status(409).json({ error: "La solicitud anterior fue rechazada. Intenta crear un pedido nuevo." });
    return;
  }
  if (!reservationResult.isNew) {
    res.status(202).json(CreateOrderResponse.parse(toOrder({ order: reservation, service })));
    return;
  }
  const cancelReservation = async () => db.transaction(async (tx) => {
    const [locked] = await tx.select().from(ordersTable).where(eq(ordersTable.id, reservation.id)).for("update");
    if (!locked || locked.providerOrderId || locked.status === "Cancelado") return;
    await tx.update(ordersTable).set({ status: "Cancelado", costMicros: 0, lastSyncedAt: new Date() }).where(eq(ordersTable.id, locked.id));
    if (locked.creditPeriodId && locked.costMicros) {
      await tx.select().from(creditPeriodsTable).where(eq(creditPeriodsTable.id, locked.creditPeriodId)).for("update");
      await tx.insert(creditLedgerTable).values({ id: randomUUID(), userId: user.id, periodId: locked.creditPeriodId, orderId: locked.id, kind: "reversion-reserva", amountMicros: -locked.costMicros });
    }
    await tx.insert(orderStatusEventsTable).values({ id: randomUUID(), orderId: locked.id, userId: user.id, status: "Cancelado" });
  });
  const dispatchOrder = async () => {
    try {
      const provider = await marketerum.add({ service: service.providerServiceId ?? service.id, link: parsed.data.link, quantity: parsed.data.quantity });
      const providerOrderId = String(provider.order ?? provider.id ?? "");
      if (!providerOrderId) throw new Error("Provider did not return an order ID");
      await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(ordersTable).where(eq(ordersTable.id, reservation.id)).for("update");
        if (!locked || locked.providerOrderId || locked.status === "Cancelado") return;
        await tx.update(ordersTable).set({ providerOrderId, status: "En proceso", lastSyncedAt: new Date() }).where(eq(ordersTable.id, locked.id));
        await tx.insert(orderStatusEventsTable).values({ id: randomUUID(), orderId: locked.id, userId: user.id, status: "En proceso" });
      });
    } catch (error) {
      if (error instanceof ProviderRejectedError) {
        try {
          await cancelReservation();
        } catch (releaseError) {
          logger.error({ err: releaseError, orderId: reservation.id }, "Could not release rejected order reservation");
        }
        return;
      }
      logger.warn({ err: error, orderId: reservation.id }, "Order dispatch remains pending");
    }
  };

  void dispatchOrder();
  res.status(202).json(CreateOrderResponse.parse(toOrder({ order: reservation, service })));
});

const action = async (req: any, res: any, type: "status" | "refill"): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const schema = type === "status" ? SyncOrderStatusBody : RefillOrderBody;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida." });
    return;
  }
  const [row] = await db.select({ order: ordersTable, service: servicesTable }).from(ordersTable).innerJoin(servicesTable, eq(ordersTable.serviceId, servicesTable.id)).where(and(eq(ordersTable.id, parsed.data.orderId), eq(ordersTable.userId, user.id))).limit(1);
  if (!row) {
    res.status(404).json({ error: "Pedido no encontrado." });
    return;
  }
  if (type === "refill" && !row.order.refillAvailable) {
    res.status(400).json({ error: "Este pedido no admite recarga." });
    return;
  }
  if (!row.order.providerOrderId) {
    res.status(409).json({ error: "El pedido esta reservado y pendiente de verificacion. Intenta mas tarde." });
    return;
  }
  try {
    const provider = type === "status"
      ? await marketerum.status({ order: row.order.providerOrderId })
      : await marketerum.refill({ order: row.order.providerOrderId });
    const providerRemains = type === "status" ? toNonNegativeInteger(provider.remains) : undefined;
    const providerStartCount = type === "status" ? toNonNegativeInteger(provider.start_count) : undefined;
    const remains = providerRemains ?? row.order.remains;
    const startCount = providerStartCount ?? row.order.startCount;
    const providerStatus = type === "status" ? normalizeProviderStatus(provider.status, row.order.status) : row.order.status;
    const status = type === "status" && isFinalOrderStatus(row.order.status) && !isFinalOrderStatus(providerStatus)
      ? row.order.status
      : providerStatus;
    const { progress } = deriveOrderMetrics({ quantity: row.order.quantity, status, progress: row.order.progress, remains });
    const now = new Date();
    const confirmedCostMicros = type === "status" ? decimalToMicros(provider.charge) : undefined;
    const [updated] = await db.transaction(async (tx) => {
      const [lockedOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, row.order.id)).for("update");
      if (!lockedOrder) throw new Error("Order not found");
      const [existingProviderRefund] = type === "status" && (status === "Cancelado" || status === "Reembolso")
        ? await tx.select({ id: creditLedgerTable.id }).from(creditLedgerTable).where(and(
          eq(creditLedgerTable.orderId, lockedOrder.id),
          eq(creditLedgerTable.kind, "reversion-proveedor"),
        )).limit(1)
        : [];
      const settlement = type === "status"
        ? settleOrderCredit({
          status,
          currentCostMicros: lockedOrder.costMicros,
          providerChargeMicros: confirmedCostMicros,
          finalRefundApplied: Boolean(existingProviderRefund),
        })
        : { nextCostMicros: lockedOrder.costMicros, adjustmentMicros: 0, refundMicros: 0 };
      if (settlement.adjustmentMicros !== 0 && lockedOrder.creditPeriodId) {
        await tx.select().from(creditPeriodsTable).where(eq(creditPeriodsTable.id, lockedOrder.creditPeriodId)).for("update");
        await tx.insert(creditLedgerTable).values({
          id: randomUUID(),
          userId: user.id,
          periodId: lockedOrder.creditPeriodId,
          orderId: lockedOrder.id,
          kind: "ajuste-coste-confirmado",
          amountMicros: settlement.adjustmentMicros,
        });
      }
      if (settlement.refundMicros !== 0 && lockedOrder.creditPeriodId) {
        await tx.select().from(creditPeriodsTable).where(eq(creditPeriodsTable.id, lockedOrder.creditPeriodId)).for("update");
        await tx.insert(creditLedgerTable).values({
          id: randomUUID(),
          userId: user.id,
          periodId: lockedOrder.creditPeriodId,
          orderId: lockedOrder.id,
          kind: "reversion-proveedor",
          amountMicros: settlement.refundMicros,
        });
      }
      const [nextOrder] = await tx.update(ordersTable).set({
        status,
        progress,
        startCount,
        remains,
        costMicros: settlement.nextCostMicros,
        firstSyncedAt: row.order.firstSyncedAt ?? now,
        completedAt: status === "Completado" ? row.order.completedAt ?? now : row.order.completedAt,
        lastSyncedAt: now,
        refillAvailable: type === "refill" ? false : row.order.refillAvailable,
      }).where(eq(ordersTable.id, lockedOrder.id)).returning();
       if (type === "status" && status !== lockedOrder.status) {
        await tx.insert(orderStatusEventsTable).values({ id: randomUUID(), orderId: row.order.id, userId: user.id, status, recordedAt: now });
      }
      return [nextOrder];
    });
    const schemaResponse = type === "status" ? SyncOrderStatusResponse : RefillOrderResponse;
    res.json(schemaResponse.parse(toOrder({ order: updated, service: row.service })));
  } catch {
    res.status(502).json({ error: "No fue posible sincronizar el pedido en este momento." });
  }
};

router.post("/panel/orders/status", (req, res) => void action(req, res, "status"));
router.post("/panel/orders/refill", (req, res) => void action(req, res, "refill"));

router.post("/panel/orders/reconcile", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = ReconcileOrderReservationBody.safeParse(req.body);
  if (!parsed.success || (parsed.data.resolution === "attach" && !parsed.data.trackingId)) {
    res.status(400).json({ error: "Revisa los datos de reconciliacion." });
    return;
  }
  const [existing] = await db.select({ order: ordersTable, service: servicesTable }).from(ordersTable)
    .innerJoin(servicesTable, eq(ordersTable.serviceId, servicesTable.id))
    .where(and(eq(ordersTable.id, parsed.data.orderId), eq(ordersTable.userId, user.id))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Pedido no encontrado." });
    return;
  }
  if (existing.order.providerOrderId || existing.order.status !== "Pendiente") {
    res.status(400).json({ error: "Este pedido no requiere reconciliacion." });
    return;
  }
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(ordersTable).where(eq(ordersTable.id, existing.order.id)).for("update");
    if (!locked || locked.providerOrderId || locked.status !== "Pendiente") throw new Error("Reservation already resolved");
    if (parsed.data.resolution === "release" && locked.creditPeriodId && locked.costMicros) {
      await tx.select().from(creditPeriodsTable).where(eq(creditPeriodsTable.id, locked.creditPeriodId)).for("update");
      await tx.insert(creditLedgerTable).values({ id: randomUUID(), userId: user.id, periodId: locked.creditPeriodId, orderId: locked.id, kind: "reversion-verificada", amountMicros: -locked.costMicros });
    }
    const status = parsed.data.resolution === "attach" ? "En proceso" : "Cancelado";
    const [nextOrder] = await tx.update(ordersTable).set({
      status,
      providerOrderId: parsed.data.resolution === "attach" ? parsed.data.trackingId : null,
      costMicros: parsed.data.resolution === "release" ? 0 : locked.costMicros,
      lastSyncedAt: now,
    }).where(eq(ordersTable.id, locked.id)).returning();
    await tx.insert(orderStatusEventsTable).values({ id: randomUUID(), orderId: locked.id, userId: user.id, status, recordedAt: now });
    return [nextOrder];
  });
  res.json(CreateOrderResponse.parse(toOrder({ order: updated, service: existing.service })));
});

router.get("/panel/dashboard", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const rows = await getRows(user.id);
  const orders = rows.map(toOrder);
   const active = orders.filter((order) => !isFinalOrderStatus(order.status));
  const completed = orders.filter((order) => order.status === "Completado");
   const needsAttention = orders.filter((order) => ["Cancelado", "Reembolso", "Parcial"].includes(order.status));
  const lastSync = rows.map(({ order }) => order.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  const metricsPendingOrders = orders.filter((order) => order.delivered == null || order.remains == null).length;
  const deliveredQuantity = metricsPendingOrders ? null : orders.reduce((total, order) => total + (order.delivered ?? 0), 0);
  const remainingQuantity = metricsPendingOrders ? null : orders.reduce((total, order) => total + (order.remains ?? 0), 0);
  const credit = await getCreditSummary(user.id);
  res.json(GetDashboardResponse.parse({ activeOrders: active.length, completedOrders: completed.length, totalOrders: orders.length, needsAttention: needsAttention.length, deliveredQuantity, remainingQuantity, metricsPendingOrders, recentOrders: orders.slice(0, 5), lastSyncAt: lastSync?.toISOString() ?? null, credit }));
});

export default router;