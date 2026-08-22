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
    <div className={`terminal-panel ${compact ? 'p-5' : 'p-10'} text-center`}>
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-md border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] text-[hsl(var(--destructive))]">
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
    <div className="border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 text-center rounded-md">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
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
    active: 'bg-[hsl(var(--info)/.1)] text-[hsl(var(--info))] border-[hsl(var(--info)/.2)]',
  };
  return <span data-testid={`status-order-${status}`} className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${styles[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(status)}</span>;
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
        <div className="h-1 overflow-hidden bg-[hsl(var(--secondary))]">
          <div className="h-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, order.progress))}%` }} />
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
    <aside className="flex h-full w-[96px] shrink-0 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-1.5 py-3">
      <div className="flex items-center justify-center px-1 pb-6">
        <Link href="/dashboard" data-testid="link-brand" onClick={onClose} className="flex items-center gap-3">
          <AmdLogo className="h-[25px] w-[60px]" />
        </Link>
        {onClose && <button data-testid="button-close-menu" onClick={onClose} className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"><PanelLeftClose size={15} /></button>}
      </div>
      <div className="px-0.5 pb-2.5 text-center"><p className="mono text-[7px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">Operaciones</p></div>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          const compactLabel = label === 'Nuevo pedido' ? 'Nuevo' : label === 'En proceso' ? 'Proceso' : label;
          return <Link key={href} href={href} onClick={onClose} data-testid={`link-nav-${href.slice(1)}`} className={`group relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-md px-0.5 py-1.5 text-center transition ${active ? 'border border-[hsl(var(--primary)/.32)] bg-[hsl(var(--primary)/.09)] text-[hsl(var(--primary))]' : 'border border-transparent text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'}`}><Icon size={16} strokeWidth={active ? 2.2 : 1.7} /><span className="text-[7px] font-extrabold uppercase tracking-[.08em]">{compactLabel}</span>{href === '/pedidos-en-proceso' && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />}</Link>;
        })}
      </nav>
      <div className="mt-auto">
        <div className="mb-2 rounded-md border border-[hsl(var(--border)/.8)] bg-[hsl(var(--card))] px-1.5 py-2 text-center">
          <div className="mb-1 flex justify-center text-[hsl(var(--accent))]"><ShieldCheck size={14} /></div>
          <p className="text-[8px] font-extrabold uppercase tracking-[.08em] text-[hsl(var(--accent))]">Sesion</p>
        </div>
        <button data-testid="button-logout" onClick={handleLogout} disabled={logout.isPending} className="flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--destructive)/.08)] hover:text-[hsl(var(--destructive))] disabled:opacity-50"><LogOut size={16} /><span className="text-[8px] font-extrabold uppercase tracking-[.08em]">{logout.isPending ? 'Saliendo' : 'Salir'}</span></button>
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
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)}><div className="h-full w-[96px]" onClick={(event) => event.stopPropagation()}><Sidebar user={user} onClose={() => setMenuOpen(false)} /></div></div>}
       <main className="min-h-[100dvh] md:pl-[96px]">
        <header className="sticky top-0 z-20 flex h-[54px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-5 md:px-8">
          <div className="flex items-center gap-3"><button data-testid="button-open-menu" onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] md:hidden"><Menu size={18} /></button><div className="flex items-center gap-3"><p className="mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">amd://{location.slice(1) || 'dashboard'}</p><span className="hidden h-3 w-px bg-[hsl(var(--border))] sm:block" /><h1 data-testid="text-page-title" className="hidden text-sm font-semibold sm:block">{pageTitles[location] || 'Página'}</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />Sistema online</div><div className="grid h-7 w-7 place-items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--foreground))]" title={user.email}>{user.email.slice(0, 1).toUpperCase()}</div></div>
        </header>
        <div className="mx-auto max-w-[1600px] p-5 md:p-8">{children}</div>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-5 border-b border-[hsl(var(--border))] pb-5 md:flex-row md:items-end"><div><p className="terminal-label mb-2 text-[hsl(var(--primary))]">{eyebrow}</p><h2 className="text-xl font-semibold tracking-[-.025em] md:text-2xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p></div>{action}</div>;
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
  return <div className="fade-up"><PageIntro eyebrow="01 / Control" title="Resumen operativo" description="Lectura rápida del estado de tus pedidos y actividad reciente." action={<Link href="/nuevo-pedido" data-testid="link-new-order-dashboard" className="inline-flex items-center justify-center gap-2 rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-3.5 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] transition hover:brightness-110"><Plus size={15} /> Nuevo pedido</Link>} />
    <div className="terminal-panel mb-6 grid gap-px overflow-hidden bg-[hsl(var(--border))] md:grid-cols-3">{stats.map(({ label, value, detail, icon: Icon, accent }, index) => <div key={label} className={`fade-up fade-up-${index + 1} bg-[hsl(var(--card))] p-5`}><div className="mb-6 flex items-center justify-between"><p className="terminal-label">{label}</p><Icon size={16} className={accent === 'accent' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'} /></div><div className="flex items-end justify-between gap-4"><p data-testid={`text-stat-${label}`} className="mono text-3xl font-medium tracking-[-.08em]">{value}</p><p className="pb-1 text-right text-[10px] text-[hsl(var(--muted-foreground))]">{detail}</p></div></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
      <section className="terminal-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><p className="terminal-label">Actividad</p><h3 className="mt-1 text-sm font-semibold">Actividad reciente</h3></div><Link href="/pedidos-en-proceso" data-testid="link-see-active" className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/.6)] hover:text-[hsl(var(--primary))]">Ver activos <ArrowRight size={12} /></Link></div>{data.recentOrders?.length ? data.recentOrders.map((order) => <OrderLine key={order.id} order={order} />) : <div className="p-5"><EmptyState icon={PackageCheck} title="Aún no hay actividad" description="Los pedidos nuevos aparecerán aquí en cuanto se registren." action={<Link href="/nuevo-pedido" data-testid="link-empty-new-order" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--primary))]">Crear primer pedido <ArrowRight size={14} /></Link>} /></div>}</section>
      <section className="terminal-panel p-5"><div className="mb-5 flex items-start justify-between"><div><p className="terminal-label">Estado del sistema</p><h3 className="mt-1 text-sm font-semibold">Sincronización</h3></div><Zap size={16} className="text-[hsl(var(--primary))]" /></div><div className="border border-[hsl(var(--primary)/.26)] bg-[hsl(var(--primary)/.06)] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-current" />Operativo</div><p data-testid="text-last-sync" className="mt-3 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Última sincronización<br /><span className="mono text-[hsl(var(--foreground))]">{formatDate(data.lastSyncAt)}</span></p></div><div className="mt-5 space-y-3 border-t border-[hsl(var(--border))] pt-5"><div className="flex justify-between text-xs"><span className="text-[hsl(var(--muted-foreground))]">Pedidos registrados</span><span className="mono font-medium">{data.totalOrders}</span></div><div className="flex justify-between text-xs"><span className="text-[hsl(var(--muted-foreground))]">Tasa de finalización</span><span className="mono font-medium">{data.totalOrders ? Math.round((data.completedOrders / data.totalOrders) * 100) : 0}%</span></div></div></section>
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
  return <div className="fade-up">
    <PageIntro eyebrow="02 / Alta" title="Nuevo pedido" description="Configura una nueva solicitud para ponerla en seguimiento." />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.7fr)]">
      <section className="terminal-panel p-5 md:p-6">
        <div className="mb-6 flex items-center gap-3 border-b border-[hsl(var(--border))] pb-4"><div className="grid h-8 w-8 place-items-center rounded-md border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><Target size={16} /></div><div><p className="terminal-label">Nueva solicitud</p><h3 className="mt-1 text-sm font-semibold">Detalles del pedido</h3></div></div>
        <div className="space-y-5">
          <label className="block"><span className="terminal-label mb-2 block">Servicio</span><div className="relative"><select data-testid="select-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setErrors((current) => ({ ...current, service: undefined, quantity: undefined })); }} className={`w-full appearance-none rounded-md border bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none transition focus:border-[hsl(var(--primary))] ${errors.service ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]'}`}><option value="">Selecciona el servicio que necesitas</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.platform}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-[hsl(var(--muted-foreground))]" /></div>{errors.service && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.service}</span>}</label>
          <label className="block"><span className="terminal-label mb-2 block">Enlace de destino</span><div className="relative"><Link2 size={15} className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-order-link" value={link} onChange={(event) => { setLink(event.target.value); setErrors((current) => ({ ...current, link: undefined })); }} placeholder="https://..." className={`w-full rounded-md border bg-[hsl(var(--background))] py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))] ${errors.link ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]'}`} /></div>{errors.link && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.link}</span>}</label>
          <label className="block"><div className="mb-2 flex items-center justify-between"><span className="terminal-label">Cantidad</span>{selected && <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">min {selected.minQuantity.toLocaleString('es-ES')} / max {selected.maxQuantity.toLocaleString('es-ES')}</span>}</div><input data-testid="input-order-quantity" type="number" min={selected?.minQuantity ?? 1} max={selected?.maxQuantity} value={quantity} onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })); }} placeholder="0" className={`w-full rounded-md border bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))] ${errors.quantity ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]'}`} />{errors.quantity && <span className="mt-1.5 block text-xs text-[hsl(var(--destructive))]">{errors.quantity}</span>}</label>
        </div>
        {createOrder.isError && <p className="mt-5 border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">No se pudo crear el pedido. Revisa los datos e inténtalo de nuevo.</p>}
        {success && <p className="mt-5 border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.08)] p-3 text-sm text-[hsl(var(--accent))]">{success}</p>}
        <div className="mt-6 flex justify-end"><button data-testid="button-submit-order" onClick={submit} disabled={createOrder.isPending || Boolean(success)} className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{createOrder.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}{createOrder.isPending ? 'Creando pedido…' : 'Crear pedido'}</button></div>
      </section>
      <aside className="terminal-panel h-fit p-5"><p className="terminal-label">Vista previa</p>{selected ? <div className="mt-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{selected.name}</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{selected.platform} · {selected.contentType}</p></div><Sparkles size={15} className="text-[hsl(var(--primary))]" /></div><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{selected.description}</p><div className="mt-5 grid grid-cols-2 gap-px border border-[hsl(var(--border))] bg-[hsl(var(--border))]"><div className="bg-[hsl(var(--card))] p-3"><Clock3 size={14} className="mb-2 text-[hsl(var(--primary))]" /><p className="terminal-label text-[8px]">Tiempo</p><p className="mt-1 text-xs font-medium">{selected.estimatedTime}</p></div><div className="bg-[hsl(var(--card))] p-3"><RefreshCw size={14} className="mb-2 text-[hsl(var(--accent))]" /><p className="terminal-label text-[8px]">Recarga</p><p className="mt-1 text-xs font-medium">{selected.supportsRefill ? 'Disponible' : 'No disponible'}</p></div></div></div> : <div className="flex min-h-[205px] flex-col items-center justify-center text-center"><PackageCheck size={18} className="mb-3 text-[hsl(var(--muted-foreground))]" /><p className="text-sm font-semibold">Selecciona un servicio</p><p className="mt-1 max-w-[220px] text-xs leading-5 text-[hsl(var(--muted-foreground))]">Verás aquí sus condiciones antes de confirmar.</p></div>}</aside>
    </div>
  </div>;
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
  return <div className="fade-up">
    <PageIntro eyebrow="03 / Seguimiento" title="Pedidos en proceso" description="Supervisa el avance y sincroniza los estados con el proveedor." action={<button data-testid="button-sync-all" onClick={() => active.forEach((order) => syncOrder(order.id))} disabled={sync.isPending || !active.length} className="inline-flex items-center justify-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2 text-xs font-bold transition hover:border-[hsl(var(--primary)/.6)] hover:text-[hsl(var(--primary))] disabled:opacity-50"><RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} /> Sincronizar todo</button>} />
    {notice && <div data-testid="status-operation" className="mb-4 flex items-center gap-2 border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.07)] px-4 py-3 text-xs text-[hsl(var(--accent))]"><Check size={15} />{notice}<button data-testid="button-dismiss-notice" onClick={() => setNotice('')} className="ml-auto p-1"><X size={14} /></button></div>}
    <section className="terminal-panel overflow-hidden"><div className="grid border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-5 py-3 terminal-label md:grid-cols-[minmax(210px,1.5fr)_minmax(150px,1fr)_120px_145px]"><span>Pedido / servicio</span><span>Avance</span><span className="md:text-right">Cantidad</span><span /></div>{active.length ? active.map((order) => <OrderLine key={order.id} order={order} onSync={syncOrder} onRefill={refillOrder} syncing={syncingId === order.id} />) : <div className="p-5"><EmptyState icon={CheckCircle2} title="No hay pedidos activos" description="Cuando registres un pedido, su avance aparecerá en este espacio." action={<Link href="/nuevo-pedido" data-testid="link-empty-active-order" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--primary))]">Crear pedido <ArrowRight size={14} /></Link>} /></div>}</section>
    <div className="mt-4 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]"><RefreshCw size={13} /> La sincronización consulta el estado actual del proveedor.</div>
  </div>;
}

function HistoryPage() {
  const { data: orders, isLoading, isError, refetch } = useGetOrders();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const completed = useMemo(() => (orders ?? []).filter(isCompleted).filter((order) => filter === 'todos' || statusLabel(order.status).toLowerCase() === filter).filter((order) => `${order.id} ${order.serviceName} ${order.platform} ${order.link}`.toLowerCase().includes(search.toLowerCase())), [orders, filter, search]);
  if (isLoading) return <><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><LoadingRows count={5} /></>;
  if (isError || !orders) return <><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><ErrorState onRetry={() => void refetch()} /></>;
  return <div className="fade-up"><PageIntro eyebrow="04 / Archivo" title="Historial" description="Consulta pedidos completados y anteriores en un solo lugar." /><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row"><div className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1"><button data-testid="button-filter-all" onClick={() => setFilter('todos')} className={`rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] transition ${filter === 'todos' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>Todos</button><button data-testid="button-filter-completed" onClick={() => setFilter('completado')} className={`rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] transition ${filter === 'completado' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>Completados</button></div><div className="relative sm:w-64"><Search size={14} className="absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-search-history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedidos..." className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]" /></div></div><section className="terminal-panel overflow-hidden">{completed.length ? completed.map((order) => <div key={order.id} data-testid={`row-history-${order.id}`} className="grid gap-3 border-b border-[hsl(var(--border))] px-5 py-4 transition last:border-0 hover:bg-[hsl(var(--secondary)/.45)] md:grid-cols-[minmax(190px,1.2fr)_minmax(160px,1fr)_120px_150px] md:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="mono text-[11px] text-[hsl(var(--muted-foreground))]">#{shortId(order.id)}</span><StatusChip status={order.status} /></div><p className="mt-2 truncate text-sm font-semibold">{order.serviceName}</p><p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{order.platform} · {order.contentType}</p></div><div className="flex min-w-0 items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Link2 size={13} /><span className="truncate">{order.link}</span><a data-testid={`link-order-${order.id}`} href={order.link} target="_blank" rel="noreferrer" className="shrink-0 text-[hsl(var(--primary))] hover:underline"><ExternalLink size={13} /></a></div><div className="text-sm md:text-right"><span className="mono font-medium">{order.quantity.toLocaleString('es-ES')}</span><span className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">unidades</span></div><div className="flex items-center justify-between gap-2 md:justify-end"><div className="text-right"><p className="text-xs font-semibold">{formatDate(order.createdAt)}</p><p className="mt-0.5 terminal-label text-[8px]">Creado</p></div><button data-testid={`button-copy-link-${order.id}`} onClick={() => void navigator.clipboard?.writeText(order.link)} title="Copiar enlace" className="grid h-8 w-8 place-items-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/.5)] hover:text-[hsl(var(--primary))]"><Copy size={14} /></button></div></div>) : <div className="p-5"><EmptyState icon={History} title="Sin pedidos en el historial" description={search ? 'No encontramos coincidencias con esa búsqueda.' : 'Los pedidos completados se archivarán aquí automáticamente.'} action={search ? <button data-testid="button-clear-history-search" onClick={() => setSearch('')} className="mt-5 text-sm font-bold text-[hsl(var(--primary))]">Limpiar búsqueda</button> : undefined} /></div>}</section></div>;
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
    <div className="grid min-h-[100dvh] bg-[hsl(var(--background))] lg:grid-cols-[1.2fr_.8fr]">
      <section className="terminal-grid relative hidden overflow-hidden border-r border-[hsl(var(--border))] p-10 lg:flex lg:flex-col">
        <div className="relative flex items-center gap-3 border-b border-[hsl(var(--border))] pb-5">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />
          <p className="mono text-xs font-medium uppercase tracking-[.15em]">AMD // Social delivery</p>
          <span className="ml-auto terminal-label">Private workspace</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <p className="terminal-label text-[hsl(var(--primary))]">Control plane / 01</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.04em]">Automatización social bajo control.</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-[hsl(var(--muted-foreground))]">Gestiona entregas, consulta estados y opera tus servicios desde una interfaz privada diseñada para ritmo y precisión.</p>
          <div className="terminal-panel mt-10 grid grid-cols-3 divide-x divide-[hsl(var(--border))]">
            {[['STATUS', 'ONLINE'], ['ENGINE', 'READY'], ['ACCESS', 'PRIVATE']].map(([label, value]) => <div key={label} className="p-4"><p className="terminal-label text-[9px]">{label}</p><p className="mono mt-2 text-xs text-[hsl(var(--foreground))]"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />{value}</p></div>)}
          </div>
        </div>
        <p className="relative terminal-label">AMD Marketing Digital // Restricted access</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[390px] fade-up">
          <div className="mb-7 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
            <p className="mono text-xs font-semibold uppercase tracking-[.16em]">Acceso privado</p>
            <span className="terminal-label text-[hsl(var(--primary))]">v1.0</span>
          </div>
          <p className="terminal-label text-[hsl(var(--primary))]">Autenticación</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Inicia sesión</h2>
          <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Identifícate para abrir tu espacio de operaciones.</p>
          <form className="terminal-panel mt-7 space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="block"><span className="terminal-label mb-2 block">Correo electrónico</span><input data-testid="input-login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" autoComplete="email" className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))]" /></label>
            <label className="block"><div className="mb-2 flex items-center justify-between"><span className="terminal-label">Contraseña</span><span className="terminal-label text-[9px]">Sin registro</span></div><input data-testid="input-login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--primary))]" /></label>
            {error && <p data-testid="status-login-error" className="border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.08)] p-3 text-xs leading-5 text-[hsl(var(--destructive))]">{error}</p>}
            <button type="submit" formNoValidate data-testid="button-login" disabled={login.isPending} className="flex w-full items-center justify-center gap-2 rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{login.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}{login.isPending ? 'Validando…' : 'Entrar al panel'}</button>
          </form>
          <div className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />Sesión protegida. Este acceso está reservado para personal autorizado.</div>
        </div>
      </section>
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