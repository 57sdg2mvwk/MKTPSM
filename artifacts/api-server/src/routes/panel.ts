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
import { deriveOrderMetrics, toNonNegativeInteger } from "../lib/order-metrics";
import { getUserFromToken, SESSION_COOKIE } from "../lib/auth";
import { marketerum } from "../lib/marketerum";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();
const statuses = ["En proceso", "Completado", "Pendiente", "Cancelado", "Reembolso"];
const configuredServiceIds = new Set(["4665", "4668", "11161"]);

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
    { id: "4665", name: "Facebook Post Likes · HQ & Real · 7D Refill", platform: "Facebook", contentType: "Me gusta", description: "Likes de Facebook de alta calidad con recarga durante 7 días.", minQuantity: 20, maxQuantity: 500000, supportsRefill: true, estimatedTime: "Según proveedor", providerServiceId: "4665" },
  ];
  await db.insert(servicesTable).values(seed);
  return db.select().from(servicesTable);
};

const decodeProviderText = (value: unknown) => String(value ?? "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const providerPlatform = (service: Record<string, unknown>) => {
  const source = `${service.category ?? ""} ${service.name ?? ""}`.toLowerCase();
  const platforms = ["Instagram", "Facebook", "TikTok", "YouTube", "Twitter", "Telegram", "Spotify", "Twitch", "Discord"];
  return platforms.find((platform) => source.includes(platform.toLowerCase())) ?? "Red social";
};

const syncLiveServices = async () => {
  const remoteServices = await marketerum.services();
  if (!Array.isArray(remoteServices)) throw new Error("Invalid provider services response");
  const selected = remoteServices
    .filter((service) => configuredServiceIds.has(String(service.service ?? service.id ?? "")))
    .map((service) => {
      const id = String(service.service ?? service.id);
      return {
        id,
        name: decodeProviderText(service.name) || `Servicio ${id}`,
        platform: providerPlatform(service),
        contentType: decodeProviderText(service.type) || "Servicio",
        description: decodeProviderText(service.category) || "Servicio disponible en tiempo real.",
        minQuantity: Number(service.min),
        maxQuantity: Number(service.max),
        supportsRefill: service.refill === true || service.refill === "true",
        estimatedTime: "En tiempo real",
        providerServiceId: id,
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
  return db.select().from(servicesTable).where(inArray(servicesTable.id, [...configuredServiceIds]));
};

const elapsed = (createdAt: Date) => {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
};

const normalizeStatus = (value: unknown, fallback: string) => {
  const status = String(value ?? "").toLowerCase();
  if (status.includes("complete") || status.includes("deliver") || status.includes("finish")) return "Completado";
  if (status.includes("cancel")) return "Cancelado";
  if (status.includes("refund")) return "Reembolso";
  if (status.includes("pending")) return "Pendiente";
  if (status.includes("progress") || status.includes("process") || status.includes("active")) return "En proceso";
  return fallback;
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
  try {
    res.json(GetServicesResponse.parse((await syncLiveServices()).map(({ providerServiceId: _providerServiceId, ...service }) => service)));
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
  let providerOrderId: string | undefined;
  try {
    const provider = await marketerum.add({ service: service.providerServiceId ?? service.id, link: parsed.data.link, quantity: parsed.data.quantity });
    providerOrderId = String(provider.order ?? provider.id ?? "");
    if (!providerOrderId) throw new Error("Provider did not return an order ID");
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
    const providerRemains = type === "status" ? toNonNegativeInteger(provider.remains) : undefined;
    const providerStartCount = type === "status" ? toNonNegativeInteger(provider.start_count) : undefined;
    const remains = providerRemains ?? row.order.remains;
    const startCount = providerStartCount ?? row.order.startCount;
    const status = type === "status" ? normalizeStatus(provider.status, row.order.status) : row.order.status;
    const { progress } = deriveOrderMetrics({ quantity: row.order.quantity, status, progress: row.order.progress, remains });
    const [updated] = await db.update(ordersTable).set({ status, progress, startCount, remains, lastSyncedAt: new Date(), refillAvailable: type === "refill" ? false : row.order.refillAvailable }).where(eq(ordersTable.id, row.order.id)).returning();
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
  const metricsPendingOrders = orders.filter((order) => order.delivered == null || order.remains == null).length;
  const deliveredQuantity = metricsPendingOrders ? null : orders.reduce((total, order) => total + (order.delivered ?? 0), 0);
  const remainingQuantity = metricsPendingOrders ? null : orders.reduce((total, order) => total + (order.remains ?? 0), 0);
  res.json(GetDashboardResponse.parse({ activeOrders: active.length, completedOrders: completed.length, totalOrders: orders.length, needsAttention: needsAttention.length, deliveredQuantity, remainingQuantity, metricsPendingOrders, recentOrders: orders.slice(0, 5), lastSyncAt: lastSync?.toISOString() ?? null }));
});

export default router;