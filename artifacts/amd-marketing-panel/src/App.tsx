import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FilePlus2,
  History,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  getGetDashboardQueryKey,
  getGetOrdersQueryKey,
  useCreateOrder,
  useGetCurrentUser,
  useGetDashboard,
  useGetOrders,
  useGetServices,
  useLogin,
  useLogout,
  useRefillOrder,
  useSyncOrderStatus,
} from '@workspace/api-client-react';
import type { CurrentUser, Order } from '@workspace/api-client-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import amdLogo from '@/assets/amd-logo-cropped.png';
import './index.css';

const queryClient = new QueryClient();

function AmdLogo({ className = '' }: { className?: string }) {
  return <img src={amdLogo} alt="AMD Marketing Digital" className={`block object-contain ${className}`} />;
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Resumen operativo',
  '/nuevo-pedido': 'Nuevo pedido',
  '/pedidos-en-proceso': 'Pedidos en proceso',
  '/historial': 'Historial',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin sincronización';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace('.', '');
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-3)}` : id;
}

function isCompleted(order: Order) {
  const status = order.status.toLowerCase();
  return ['completed', 'complete', 'completado', 'finalizado', 'finished', 'delivered', 'entregado'].some((term) => status.includes(term));
}

function statusLabel(status: string) {
  const value = status.toLowerCase();
  if (value.includes('complete') || value.includes('complet') || value.includes('final') || value.includes('entreg')) return 'Completado';
  if (value.includes('process') || value.includes('progreso') || value.includes('active') || value.includes('curso')) return 'En proceso';
  if (value.includes('pending') || value.includes('pendiente')) return 'Pendiente';
  if (value.includes('cancel')) return 'Cancelado';
  return status;
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes('cancel')) return 'danger';
  if (isCompleted({ status } as Order)) return 'success';
  if (value.includes('pending') || value.includes('pendiente')) return 'warning';
  return 'active';
}

function ErrorState({ onRetry, compact = false }: { onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={`border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] ${compact ? 'p-5' : 'p-10'} text-center rounded-xl`}>
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]">
        <AlertCircle size={19} />
      </div>
      <p className="font-semibold text-[hsl(var(--foreground))]">No pudimos cargar la información</p>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Comprueba la conexión y vuelve a intentarlo.</p>
      {onRetry && (
        <button data-testid="button-retry" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm font-semibold transition hover:bg-[hsl(var(--secondary))]">
          <RefreshCw size={14} /> Reintentar
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof PackageCheck; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-12 text-center rounded-xl">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
        <Icon size={21} />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
      {action}
    </div>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton h-[76px] rounded-xl" />
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  const styles = {
    success: 'bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))] border-[hsl(var(--accent)/.2)]',
    warning: 'bg-[hsl(var(--primary)/.11)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/.2)]',
    danger: 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/.2)]',
    active: 'bg-[hsl(193_60%_72%/.1)] text-[hsl(193_60%_72%)] border-[hsl(193_60%_72%/.15)]',
  };
  return <span data-testid={`status-order-${status}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${styles[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(status)}</span>;
}

function OrderLine({ order, onSync, onRefill, syncing }: { order: Order; onSync?: (id: string) => void; onRefill?: (id: string) => void; syncing?: boolean }) {
  return (
    <div data-testid={`row-order-${order.id}`} className="group grid gap-4 border-b border-[hsl(var(--border)/.7)] px-5 py-4 transition last:border-0 hover:bg-[hsl(var(--secondary)/.36)] md:grid-cols-[minmax(210px,1.5fr)_minmax(150px,1fr)_120px_145px] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">#{shortId(order.id)}</span>
          <StatusChip status={order.status} />
        </div>
        <p data-testid={`text-service-${order.id}`} className="mt-2 truncate font-semibold">{order.serviceName}</p>
        <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{order.platform} · {order.contentType}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-[hsl(var(--muted-foreground))]">Avance</span>
          <span data-testid={`text-progress-${order.id}`} className="mono font-medium text-[hsl(var(--foreground))]">{order.progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
          <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, order.progress))}%` }} />
        </div>
      </div>
      <div className="text-sm md:text-right">
        <p className="mono font-medium">{order.quantity.toLocaleString('es-ES')}</p>
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{order.elapsed}</p>
      </div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        {order.refillAvailable && onRefill ? <button data-testid={`button-refill-${order.id}`} onClick={() => onRefill(order.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/.1)]">Solicitar recarga</button> : <span />}
        {onSync && (
          <button data-testid={`button-sync-${order.id}`} onClick={() => onSync(order.id)} disabled={syncing} title="Sincronizar estado" className="grid h-8 w-8 place-items-center rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--primary)/.5)] hover:text-[hsl(var(--primary))] disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}

function Sidebar({ user, onClose }: { user: CurrentUser; onClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const navItems = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/nuevo-pedido', label: 'Nuevo pedido', icon: FilePlus2 },
    { href: '/pedidos-en-proceso', label: 'En proceso', icon: Activity },
    { href: '/historial', label: 'Historial', icon: History },
  ];
  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation('/login');
      },
    });
  };
  return (
    <aside className="flex h-full w-[132px] shrink-0 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-2 py-4">
      <div className="flex items-center justify-center px-2 pb-7">
        <Link href="/dashboard" data-testid="link-brand" onClick={onClose} className="flex items-center gap-3">
          <AmdLogo className="h-[31px] w-[74px]" />
        </Link>
        {onClose && <button data-testid="button-close-menu" onClick={onClose} className="rounded-md p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"><PanelLeftClose size={17} /></button>}
      </div>
      <div className="px-1 pb-3 text-center"><p className="mono text-[8px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Operaciones</p></div>
      <nav className="space-y-1.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          const compactLabel = label === 'Nuevo pedido' ? 'Nuevo' : label === 'En proceso' ? 'Proceso' : label;
          return <Link key={href} href={href} onClick={onClose} data-testid={`link-nav-${href.slice(1)}`} className={`group relative flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition ${active ? 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'}`}><Icon size={18} strokeWidth={active ? 2.3 : 1.8} /><span className="text-[9px] font-extrabold uppercase tracking-[.08em]">{compactLabel}</span>{href === '/pedidos-en-proceso' && <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />}</Link>;
        })}
      </nav>
      <div className="mt-auto">
        <div className="mb-3 rounded-xl border border-[hsl(var(--border)/.8)] bg-[hsl(var(--card)/.45)] p-2.5 text-center">
          <div className="mb-1.5 flex justify-center text-[hsl(var(--accent))]"><ShieldCheck size={15} /></div>
          <p className="text-[9px] font-extrabold uppercase tracking-[.08em] text-[hsl(var(--accent))]">Sesion</p>
          <p data-testid="text-sidebar-email" className="mt-1 truncate text-[9px] text-[hsl(var(--muted-foreground))]" title={user.email}>{user.email}</p>
        </div>
        <button data-testid="button-logout" onClick={handleLogout} disabled={logout.isPending} className="flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--destructive)/.08)] hover:text-[hsl(var(--destructive))] disabled:opacity-50"><LogOut size={17} /><span className="text-[9px] font-extrabold uppercase tracking-[.08em]">{logout.isPending ? 'Saliendo' : 'Salir'}</span></button>
      </div>
    </aside>
  );
}

function Shell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-noise min-h-[100dvh] bg-[hsl(var(--background))]">
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block"><Sidebar user={user} /></div>
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)}><div className="h-full w-[min(84vw,280px)]" onClick={(event) => event.stopPropagation()}><Sidebar user={user} onClose={() => setMenuOpen(false)} /></div></div>}
       <main className="min-h-[100dvh] md:pl-[132px]">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.9)] px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3"><button data-testid="button-open-menu" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] md:hidden"><Menu size={19} /></button><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">AMD / {location === '/dashboard' ? '01' : '02'}</p><h1 data-testid="text-page-title" className="mt-0.5 text-base font-extrabold">{pageTitles[location] || 'Página'}</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />Sistema operativo</div><div className="grid h-8 w-8 place-items-center rounded-full border border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.1)] text-xs font-bold text-[hsl(var(--primary))]" title={user.email}>{user.email.slice(0, 1).toUpperCase()}</div></div>
        </header>
        <div className="mx-auto max-w-[1480px] p-5 md:p-9">{children}</div>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">{eyebrow}</p><h2 className="text-2xl font-extrabold tracking-[-.035em] md:text-[30px]">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p></div>{action}</div>;
}

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  if (isLoading) return <><PageIntro eyebrow="01 / Control" title="Resumen operativo" description="Lectura rápida del estado de tus pedidos y actividad reciente." /><LoadingRows count={5} /></>;
  if (isError || !data) return <><PageIntro eyebrow="01 / Control" title="Resumen operativo" description="Lectura rápida del estado de tus pedidos y actividad reciente." /><ErrorState onRetry={() => void refetch()} /></>;
  const stats = [
    { label: 'Pedidos activos', value: data.activeOrders, detail: 'en seguimiento', icon: Activity, accent: 'primary' },
    { label: 'Requieren atención', value: data.needsAttention, detail: data.needsAttention ? 'revisar ahora' : 'todo en orden', icon: CircleHelp, accent: data.needsAttention ? 'warning' : 'accent' },
    { label: 'Completados', value: data.completedOrders, detail: `${data.totalOrders} pedidos totales`, icon: CheckCircle2, accent: 'accent' },
  ];
  return <div className="fade-up"><PageIntro eyebrow="01 / Control" title="Resumen operativo" description="Lectura rápida del estado de tus pedidos y actividad reciente." action={<Link href="/nuevo-pedido" data-testid="link-new-order-dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))] transition hover:brightness-105"><Plus size={17} /> Nuevo pedido</Link>} />
    <div className="mb-7 grid gap-3 md:grid-cols-3">{stats.map(({ label, value, detail, icon: Icon, accent }, index) => <div key={label} className={`fade-up fade-up-${index + 1} relative overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5`}><div className={`mb-5 grid h-9 w-9 place-items-center rounded-lg ${accent === 'primary' || accent === 'warning' ? 'bg-[hsl(var(--primary)/.11)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent)/.11)] text-[hsl(var(--accent))]'}`}><Icon size={17} /></div><p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</p><div className="mt-1 flex items-end justify-between"><p data-testid={`text-stat-${label}`} className="text-3xl font-extrabold tracking-[-.05em]">{value}</p><p className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{detail}</p></div><div className={`absolute -right-8 -top-10 h-28 w-28 rounded-full border ${accent === 'accent' ? 'border-[hsl(var(--accent)/.12)]' : 'border-[hsl(var(--primary)/.12)]'}`} /></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
      <section className="overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))]"><div className="flex items-center justify-between border-b border-[hsl(var(--border)/.8)] px-5 py-4"><div><h3 className="font-bold">Actividad reciente</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Últimas actualizaciones registradas</p></div><Link href="/pedidos-en-proceso" data-testid="link-see-active" className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--primary))] hover:underline">Ver activos <ArrowRight size={13} /></Link></div>{data.recentOrders?.length ? data.recentOrders.map((order) => <OrderLine key={order.id} order={order} />) : <div className="p-5"><EmptyState icon={PackageCheck} title="Aún no hay actividad" description="Los pedidos nuevos aparecerán aquí en cuanto se registren." action={<Link href="/nuevo-pedido" data-testid="link-empty-new-order" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--primary))]">Crear primer pedido <ArrowRight size={14} /></Link>} /></div>}</section>
      <section className="rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><div className="mb-5 flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Estado del sistema</p><h3 className="mt-1 font-bold">Sincronización</h3></div><Zap size={17} className="text-[hsl(var(--primary))]" /></div><div className="rounded-lg border border-[hsl(var(--accent)/.2)] bg-[hsl(var(--accent)/.06)] p-4"><div className="flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))]"><span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />Operativo</div><p data-testid="text-last-sync" className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Última sincronización<br /><span className="font-semibold text-[hsl(var(--foreground))]">{formatDate(data.lastSyncAt)}</span></p></div><div className="mt-5 space-y-3 border-t border-[hsl(var(--border)/.8)] pt-5"><div className="flex justify-between text-xs"><span className="text-[hsl(var(--muted-foreground))]">Pedidos registrados</span><span className="mono font-medium">{data.totalOrders}</span></div><div className="flex justify-between text-xs"><span className="text-[hsl(var(--muted-foreground))]">Tasa de finalización</span><span className="mono font-medium">{data.totalOrders ? Math.round((data.completedOrders / data.totalOrders) * 100) : 0}%</span></div></div></section>
    </div>
  </div>;
}

function NewOrderPage() {
  const { data: services, isLoading, isError, refetch } = useGetServices();
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [serviceId, setServiceId] = useState('');
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState('');
  const [errors, setErrors] = useState<{ service?: string; link?: string; quantity?: string }>({});
  const [success, setSuccess] = useState('');
  const selected = useMemo(() => services?.find((service) => service.id === serviceId), [services, serviceId]);
  const validate = () => {
    const next: typeof errors = {};
    if (!serviceId) next.service = 'Selecciona un servicio.';
    if (!link.trim() || !/^https?:\/\/.+/i.test(link.trim())) next.link = 'Introduce un enlace válido, incluyendo https://.';
    const amount = Number(quantity);
    if (!quantity || !Number.isInteger(amount) || amount < (selected?.minQuantity ?? 1) || amount > (selected?.maxQuantity ?? Number.MAX_SAFE_INTEGER)) next.quantity = selected ? `Indica una cantidad entre ${selected.minQuantity.toLocaleString('es-ES')} y ${selected.maxQuantity.toLocaleString('es-ES')}.` : 'Indica una cantidad válida.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    createOrder.mutate({ data: { serviceId, link: link.trim(), quantity: Number(quantity) } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setSuccess('Pedido creado correctamente. Abriendo seguimiento…');
        window.setTimeout(() => setLocation('/pedidos-en-proceso'), 500);
      },
    });
  };
  if (isLoading) return <><PageIntro eyebrow="02 / Alta" title="Nuevo pedido" description="Configura una nueva solicitud para ponerla en seguimiento." /><LoadingRows count={3} /></>;
  if (isError || !services) return <><PageIntro eyebrow="02 / Alta" title="Nuevo pedido" description="Configura una nueva solicitud para ponerla en seguimiento." /><ErrorState onRetry={() => void refetch()} /></>;
  return <div className="fade-up"><PageIntro eyebrow="02 / Alta" title="Nuevo pedido" description="Configura una nueva solicitud para ponerla en seguimiento." /><div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.7fr)]"><section className="rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 md:p-7"><div className="mb-7 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]"><Target size={17} /></div><div><h3 className="font-bold">Detalles del pedido</h3><p className="text-xs text-[hsl(var(--muted-foreground))]">Todos los campos son necesarios</p></div></div><div className="space-y-5"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Servicio</span><div className="relative"><select data-testid="select-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setErrors((current) => ({ ...current, service: undefined, quantity: undefined })); }} className={`w-full appearance-none rounded-lg border bg-[hsl(var(--secondary)/.6)] px-3.5 py-3 text-sm outline-none transition focus:border-[hsl(var(--primary))] ${errors.service ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]'}`}><option value="">Selecciona el servicio que necesitas</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.platform}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))]" /></div>{errors.service && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.service}</span>}</label><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Enlace de destino</span><div className="relative"><Link2 size={16} className="absolute left-3.5 top-3.5 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-order-link" value={link} onChange={(event) => { setLink(event.target.value); setErrors((current) => ({ ...current, link: undefined })); }} placeholder="https://..." className={`w-full rounded-lg border bg-[hsl(var(--secondary)/.6)] py-3 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))] ${errors.link ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]'}`} /></div>{errors.link && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.link}</span>}</label><label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Cantidad</span>{selected && <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">mín. {selected.minQuantity.toLocaleString('es-ES')} / máx. {selected.maxQuantity.toLocaleString('es-ES')}</span>}</div><input data-testid="input-order-quantity" type="number" min={selected?.minQuantity ?? 1} max={selected?.maxQuantity} value={quantity} onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })); }} placeholder="0" className={`w-full rounded-lg border bg-[hsl(var(--secondary)/.6)] px-3.5 py-3 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))] ${errors.quantity ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]'}`} />{errors.quantity && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.quantity}</span>}</label></div>{createOrder.isError && <p className="mt-5 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">No se pudo crear el pedido. Revisa los datos e inténtalo de nuevo.</p>}{success && <p className="mt-5 rounded-lg border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.08)] p-3 text-sm text-[hsl(var(--accent))]">{success}</p>}<div className="mt-7 flex justify-end"><button data-testid="button-submit-order" onClick={submit} disabled={createOrder.isPending || Boolean(success)} className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{createOrder.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}{createOrder.isPending ? 'Creando pedido…' : 'Crear pedido'}</button></div></section><aside className="h-fit rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Vista previa</p>{selected ? <div className="mt-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-bold">{selected.name}</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{selected.platform} · {selected.contentType}</p></div><Sparkles size={16} className="text-[hsl(var(--primary))]" /></div><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{selected.description}</p><div className="mt-6 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[hsl(var(--secondary))] p-3"><Clock3 size={14} className="mb-2 text-[hsl(var(--primary))]" /><p className="text-[10px] text-[hsl(var(--muted-foreground))]">Tiempo estimado</p><p className="mt-1 text-xs font-bold">{selected.estimatedTime}</p></div><div className="rounded-lg bg-[hsl(var(--secondary))] p-3"><RefreshCw size={14} className="mb-2 text-[hsl(var(--accent))]" /><p className="text-[10px] text-[hsl(var(--muted-foreground))]">Recarga</p><p className="mt-1 text-xs font-bold">{selected.supportsRefill ? 'Disponible' : 'No disponible'}</p></div></div></div> : <div className="flex min-h-[205px] flex-col items-center justify-center text-center"><div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"><PackageCheck size={18} /></div><p className="text-sm font-semibold">Selecciona un servicio</p><p className="mt-1 max-w-[220px] text-xs leading-5 text-[hsl(var(--muted-foreground))]">Verás aquí sus condiciones antes de confirmar.</p></div>}</aside></div></div>;
}

function ActiveOrdersPage() {
  const { data: orders, isLoading, isError, refetch } = useGetOrders();
  const sync = useSyncOrderStatus();
  const refill = useRefillOrder();
  const queryClient = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const active = useMemo(() => orders?.filter((order) => !isCompleted(order)) ?? [], [orders]);
  const syncOrder = (id: string) => { setSyncingId(id); sync.mutate({ data: { orderId: id } }, { onSuccess: () => { setNotice('Estado actualizado correctamente.'); void queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setSyncingId(null); }, onError: () => setSyncingId(null) }); };
  const refillOrder = (id: string) => { if (!window.confirm('¿Quieres solicitar una recarga para este pedido?')) return; refill.mutate({ data: { orderId: id } }, { onSuccess: () => { setNotice('Solicitud de recarga enviada.'); void queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } }); };
  if (isLoading) return <><PageIntro eyebrow="03 / Seguimiento" title="Pedidos en proceso" description="Supervisa el avance y sincroniza los estados con el proveedor." /><LoadingRows count={5} /></>;
  if (isError || !orders) return <><PageIntro eyebrow="03 / Seguimiento" title="Pedidos en proceso" description="Supervisa el avance y sincroniza los estados con el proveedor." /><ErrorState onRetry={() => void refetch()} /></>;
  return <div className="fade-up"><PageIntro eyebrow="03 / Seguimiento" title="Pedidos en proceso" description="Supervisa el avance y sincroniza los estados con el proveedor." action={<button data-testid="button-sync-all" onClick={() => active.forEach((order) => syncOrder(order.id))} disabled={sync.isPending || !active.length} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-bold transition hover:bg-[hsl(var(--secondary))] disabled:opacity-50"><RefreshCw size={15} className={sync.isPending ? 'animate-spin' : ''} /> Sincronizar todo</button>} />{notice && <div data-testid="status-operation" className="mb-5 flex items-center gap-2 rounded-lg border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.07)] px-4 py-3 text-sm text-[hsl(var(--accent))]"><Check size={16} />{notice}<button data-testid="button-dismiss-notice" onClick={() => setNotice('')} className="ml-auto p-1"><X size={15} /></button></div>}<section className="overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))]"><div className="grid border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--secondary)/.35)] px-5 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))] md:grid-cols-[minmax(210px,1.5fr)_minmax(150px,1fr)_120px_145px]"><span>Pedido / servicio</span><span>Avance</span><span className="md:text-right">Cantidad</span><span /></div>{active.length ? active.map((order) => <OrderLine key={order.id} order={order} onSync={syncOrder} onRefill={refillOrder} syncing={syncingId === order.id} />) : <div className="p-5"><EmptyState icon={CheckCircle2} title="No hay pedidos activos" description="Cuando registres un pedido, su avance aparecerá en este espacio." action={<Link href="/nuevo-pedido" data-testid="link-empty-active-order" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--primary))]">Crear pedido <ArrowRight size={14} /></Link>} /></div>}</section><div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><RefreshCw size={13} /> La sincronización consulta el estado actual del proveedor.</div></div>;
}

function HistoryPage() {
  const { data: orders, isLoading, isError, refetch } = useGetOrders();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const completed = useMemo(() => (orders ?? []).filter(isCompleted).filter((order) => filter === 'todos' || statusLabel(order.status).toLowerCase() === filter).filter((order) => `${order.id} ${order.serviceName} ${order.platform} ${order.link}`.toLowerCase().includes(search.toLowerCase())), [orders, filter, search]);
  if (isLoading) return <><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><LoadingRows count={5} /></>;
  if (isError || !orders) return <><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><ErrorState onRetry={() => void refetch()} /></>;
  return <div className="fade-up"><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row"><div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1"><button data-testid="button-filter-all" onClick={() => setFilter('todos')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${filter === 'todos' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>Todos</button><button data-testid="button-filter-completed" onClick={() => setFilter('completado')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${filter === 'completado' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>Completados</button></div><div className="relative sm:w-64"><Search size={15} className="absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-search-history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedidos..." className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]" /></div></div><section className="overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))]">{completed.length ? completed.map((order) => <div key={order.id} data-testid={`row-history-${order.id}`} className="grid gap-3 border-b border-[hsl(var(--border)/.7)] px-5 py-4 transition last:border-0 hover:bg-[hsl(var(--secondary)/.32)] md:grid-cols-[minmax(190px,1.2fr)_minmax(160px,1fr)_120px_150px] md:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">#{shortId(order.id)}</span><StatusChip status={order.status} /></div><p className="mt-2 truncate text-sm font-semibold">{order.serviceName}</p><p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{order.platform} · {order.contentType}</p></div><div className="flex min-w-0 items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Link2 size={13} /><span className="truncate">{order.link}</span><a data-testid={`link-order-${order.id}`} href={order.link} target="_blank" rel="noreferrer" className="shrink-0 text-[hsl(var(--primary))] hover:underline"><ExternalLink size={13} /></a></div><div className="text-sm md:text-right"><span className="mono font-medium">{order.quantity.toLocaleString('es-ES')}</span><span className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">unidades</span></div><div className="flex items-center justify-between gap-2 md:justify-end"><div className="text-right"><p className="text-xs font-semibold">{formatDate(order.createdAt)}</p><p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">Creado</p></div><button data-testid={`button-copy-link-${order.id}`} onClick={() => void navigator.clipboard?.writeText(order.link)} title="Copiar enlace" className="grid h-8 w-8 place-items-center rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><Copy size={14} /></button></div></div>) : <div className="p-5"><EmptyState icon={History} title="Sin pedidos en el historial" description={search ? 'No encontramos coincidencias con esa búsqueda.' : 'Los pedidos completados se archivarán aquí automáticamente.'} action={search ? <button data-testid="button-clear-history-search" onClick={() => setSearch('')} className="mt-5 text-sm font-bold text-[hsl(var(--primary))]">Limpiar búsqueda</button> : undefined} /></div>}</section></div>;
}

function LoginPage({ currentUser }: { currentUser?: CurrentUser }) {
  const [, setLocation] = useLocation();
  const login = useLogin();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (currentUser) setLocation('/dashboard'); }, [currentUser, setLocation]);
  const submit = () => {
    if (!email.trim() || !password) { setError('Introduce tu correo y contraseña.'); return; }
    setError('');
    login.mutate({ data: { email: email.trim(), password } }, { onSuccess: (user) => { queryClient.setQueryData(getGetCurrentUserQueryKey(), user); void queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); setLocation('/dashboard'); }, onError: () => setError('No hemos podido validar tus credenciales. Revisa los datos e inténtalo de nuevo.') });
  };
  return (
    <div className="app-noise grid min-h-[100dvh] bg-[hsl(var(--background))] lg:grid-cols-[1.08fr_.92fr]">
      <div className="relative hidden overflow-hidden border-r border-[hsl(var(--border))] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 top-24 h-[420px] w-[420px] rounded-full border border-[hsl(var(--primary)/.12)]" />
        <div className="absolute -left-10 top-38 h-[300px] w-[300px] rounded-full border border-[hsl(var(--primary)/.08)]" />
        <div className="relative flex items-center gap-3">
          <p className="text-sm font-extrabold tracking-[.18em]">AMD <span className="font-medium tracking-normal text-[hsl(var(--muted-foreground))]">/ Marketing digital</span></p>
        </div>
        <div className="relative max-w-xl">
          <p className="mono mb-5 text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Centro de operaciones privado</p>
          <h1 className="text-5xl font-extrabold leading-[1.02] tracking-[-.06em] xl:text-6xl">Precisión para cada <span className="text-[hsl(var(--primary))]">pedido.</span></h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-[hsl(var(--muted-foreground))]">Una vista clara para coordinar servicios, anticipar incidencias y mantener cada entrega bajo control.</p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3 border-t border-[hsl(var(--border))] pt-5">
            {['Visibilidad', 'Control', 'Ritmo'].map((label, index) => <div key={label}><p className="mono text-lg">{`0${index + 1}`}</p><p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{label}</p></div>)}
          </div>
        </div>
        <p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">AMD / Acceso restringido</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[390px] fade-up">
          <div className="mb-10 lg:hidden">
            <p className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Acceso privado</p>
          </div>
          <p className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Bienvenida de nuevo</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em]">Inicia sesión</h2>
          <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Accede al panel para continuar gestionando tus pedidos.</p>
           <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Correo electrónico</span><input data-testid="input-login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="tu@correo.com" autoComplete="email" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))]" /></label>
            <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Contraseña</span><span className="text-[10px] text-[hsl(var(--muted-foreground))]">Acceso sin registro</span></div><input data-testid="input-login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="••••••••" autoComplete="current-password" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))]" /></label>
          {error && <p data-testid="status-login-error" className="mt-4 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm leading-5 text-[hsl(var(--destructive))]">{error}</p>}
            {error && <p data-testid="status-login-error" className="mt-4 rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm leading-5 text-[hsl(var(--destructive))]">{error}</p>}
            <button type="submit" formNoValidate data-testid="button-login" disabled={login.isPending} className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{login.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{login.isPending ? 'Validando…' : 'Entrar al panel'}</button>
           <div className="mt-7 flex items-start gap-2 border-t border-[hsl(var(--border))] pt-5 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[hsl(var(--accent))]" />Sesión protegida. Este acceso está reservado para personal autorizado.</div>
           </form>
        </div>
      </div>
    </div>
  );
}

function BootScreen() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))]"><div className="w-52"><div className="skeleton mb-3 h-8 w-10 rounded-lg" /><div className="skeleton mb-2 h-3 w-full rounded" /><div className="skeleton h-3 w-2/3 rounded" /></div></div>;
}

function Router() {
  const [location, setLocation] = useLocation();
  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  useEffect(() => { if (location !== '/login' && !currentUser.isLoading && currentUser.isError) setLocation('/login'); }, [location, currentUser.isLoading, currentUser.isError, setLocation]);
  if (location === '/login') return <LoginPage currentUser={currentUser.data} />;
  if (currentUser.isLoading) return <BootScreen />;
  if (currentUser.isError || !currentUser.data) return <BootScreen />;
  return <Shell user={currentUser.data}><Switch><Route path="/"><DashboardPage /></Route><Route path="/dashboard"><DashboardPage /></Route><Route path="/nuevo-pedido"><NewOrderPage /></Route><Route path="/pedidos-en-proceso"><ActiveOrdersPage /></Route><Route path="/historial"><HistoryPage /></Route><Route component={NotFound} /></Switch></Shell>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;