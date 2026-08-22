import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, ordersTable, servicesTable } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetDashboardResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  GetServicesResponse,
  RefillOrderBody,
  RefillOrderResponse,
  SyncOrderStatusBody,
  SyncOrderStatusResponse,
} from "@workspace/api-zod";
import { getUserFromToken, SESSION_COOKIE } from "../lib/auth";
import { marketerum } from "../lib/marketerum";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();
const statuses = ["En proceso", "Completado", "Pendiente", "Cancelado", "Reembolso"];

const ensureServices = async () => {
  const existing = await db.select().from(servicesTable);
  if (existing.length) return existing;
  const seed = [
    { id: "instagram-followers", name: "Seguidores de Instagram", platform: "Instagram", contentType: "Seguidores", description: "Crecimiento gradual para perfiles públicos.", minQuantity: 100, maxQuantity: 100000, supportsRefill: true, estimatedTime: "0–24 horas", providerServiceId: "instagram-followers" },
    { id: "instagram-likes", name: "Me gusta de Instagram", platform: "Instagram", contentType: "Interacciones", description: "Interacciones para publicaciones públicas.", minQuantity: 50, maxQuantity: 50000, supportsRefill: true, estimatedTime: "0–12 horas", providerServiceId: "instagram-likes" },
    { id: "tiktok-views", name: "Visualizaciones de TikTok", platform: "TikTok", contentType: "Visualizaciones", description: "Mayor alcance para videos publicados.", minQuantity: 500, maxQuantity: 1000000, supportsRefill: false, estimatedTime: "0–6 horas", providerServiceId: "tiktok-views" },
    { id: "youtube-views", name: "Visualizaciones de YouTube", platform: "YouTube", contentType: "Visualizaciones", description: "Impulso para videos y contenido público.", minQuantity: 100, maxQuantity: 500000, supportsRefill: false, estimatedTime: "0–48 horas", providerServiceId: "youtube-views" },
    { id: "facebook-likes", name: "Me gusta de Facebook", platform: "Facebook", contentType: "Interacciones", description: "Interacciones para páginas y publicaciones.", minQuantity: 100, maxQuantity: 100000, supportsRefill: true, estimatedTime: "0–24 horas", providerServiceId: "facebook-likes" },
  ];
  await db.insert(servicesTable).values(seed);
  return db.select().from(servicesTable);
};

const elapsed = (createdAt: Date) => {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

const toOrder = (row: { order: typeof ordersTable.$inferSelect; service: typeof servicesTable.$inferSelect }) => ({
  id: row.order.id,
  serviceId: row.order.serviceId,
  serviceName: row.service.name,
  platform: row.service.platform,
  contentType: row.service.contentType,
  link: row.order.link,
  quantity: row.order.quantity,
  status: row.order.status,
  progress: row.order.progress,
  createdAt: row.order.createdAt.toISOString(),
  lastSyncedAt: row.order.lastSyncedAt?.toISOString() ?? null,
  elapsed: elapsed(row.order.createdAt),
  refillAvailable: row.order.refillAvailable,
});

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
  if (!(await requireUser(req, res))) return;
  void marketerum.services().catch(() => undefined);
  const services = await ensureServices();
  res.json(GetServicesResponse.parse(services.map(({ providerServiceId: _providerServiceId, ...service }) => service)));
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
  if (!parsed.success || !/^https?:\/\/.+/i.test(parsed.data?.link ?? "")) {
    res.status(400).json({ error: "Revisa los datos del pedido." });
    return;
  }
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, parsed.data.serviceId)).limit(1);
  if (!service || parsed.data.quantity < service.minQuantity || parsed.data.quantity > service.maxQuantity) {
    res.status(400).json({ error: "La cantidad no está disponible para este servicio." });
    return;
  }
  let providerOrderId: string | undefined;
  try {
    const provider = await marketerum.add({ service: service.providerServiceId ?? service.id, link: parsed.data.link, quantity: parsed.data.quantity });
    providerOrderId = String(provider.order ?? provider.id ?? "");
  } catch {
    res.status(502).json({ error: "No fue posible procesar el pedido en este momento." });
    return;
  }
  const [created] = await db.insert(ordersTable).values({
    id: randomUUID(),
    userId: user.id,
    serviceId: service.id,
    link: parsed.data.link,
    quantity: parsed.data.quantity,
    providerOrderId,
    status: "En proceso",
    progress: 0,
  }).returning();
  res.status(201).json(CreateOrderResponse.parse(toOrder({ order: created, service })));
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
    res.status(400).json({ error: "Este pedido no admite refill." });
    return;
  }
  try {
    const provider = type === "status"
      ? await marketerum.status({ order: row.order.providerOrderId ?? row.order.id })
      : await marketerum.refill({ order: row.order.providerOrderId ?? row.order.id });
    const providerStatus = String(provider.status ?? "").toLowerCase();
    const status = providerStatus.includes("complete") ? "Completado" : providerStatus.includes("cancel") ? "Cancelado" : row.order.status;
    const progress = status === "Completado" ? 100 : Math.max(row.order.progress, Number(provider.progress ?? 0) || 0);
    const [updated] = await db.update(ordersTable).set({ status, progress, lastSyncedAt: new Date(), refillAvailable: type === "refill" ? false : row.order.refillAvailable }).where(eq(ordersTable.id, row.order.id)).returning();
    const schemaResponse = type === "status" ? SyncOrderStatusResponse : RefillOrderResponse;
    res.json(schemaResponse.parse(toOrder({ order: updated, service: row.service })));
  } catch {
    res.status(502).json({ error: "No fue posible sincronizar el pedido en este momento." });
  }
};

router.post("/panel/orders/status", (req, res) => void action(req, res, "status"));
router.post("/panel/orders/refill", (req, res) => void action(req, res, "refill"));

router.get("/panel/dashboard", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const rows = await getRows(user.id);
  const orders = rows.map(toOrder);
  const active = orders.filter((order) => ["En proceso", "Pendiente"].includes(order.status));
  const completed = orders.filter((order) => order.status === "Completado");
  const needsAttention = orders.filter((order) => ["Cancelado", "Reembolso"].includes(order.status));
  const lastSync = rows.map(({ order }) => order.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  res.json(GetDashboardResponse.parse({ activeOrders: active.length, completedOrders: completed.length, totalOrders: orders.length, needsAttention: needsAttention.length, recentOrders: orders.slice(0, 5), lastSyncAt: lastSync?.toISOString() ?? null }));
});

export default router;