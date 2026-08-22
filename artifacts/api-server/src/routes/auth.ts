import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetCurrentUserResponse } from "@workspace/api-zod";
import { createSession, deleteSession, getUserFromToken, SESSION_COOKIE, verifyPassword } from "../lib/auth";
import { hashPassword } from "../lib/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

let adminReady = false;
const ensureAdminUser = async () => {
  if (adminReady) return;
  const email = "asesoriamarketingdigitalmxl@gmail.com";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    adminReady = true;
    return;
  }
  const password = process.env.AMD_ADMIN_PASSWORD;
  if (!password) throw new Error("Private access is not configured");
  await db.insert(usersTable).values({ id: randomUUID(), email, passwordHash: await hashPassword(password) });
  adminReady = true;
};

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const user = await getUserFromToken(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    res.json(GetCurrentUserResponse.parse({ id: user.id, email: user.email }));
  } catch {
    res.status(503).json({ error: "Servicio temporalmente no disponible." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    await ensureAdminUser();
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase())).limit(1);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }
    const { token } = await createSession(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json(LoginResponse.parse({ id: user.id, email: user.email }));
  } catch {
    res.status(503).json({ error: "Servicio temporalmente no disponible." });
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await deleteSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).send();
});

export default router;