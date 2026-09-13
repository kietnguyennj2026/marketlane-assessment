"use client";

import { useEffect, useState } from "react";
import { demoProfile } from "@/lib/profile";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { products, vendors, money, type Product } from "@/lib/catalog";

type Cart = Record<string, number>;
type Order = {
  id: string;
  status: "paid" | "declined" | "pending" | "expired";
  total: number;
  createdAt: string;
  provider: string;
  checkoutUrl?: string | null;
  lines: {
    productId: string;
    name: string;
    quantity: number;
    total: number;
    vendorId: string;
  }[];
  allocations: { vendorId: string; gross: number; fee: number; net: number }[];
};

type SessionData = {
  orders: Order[];
  inventory: Record<string, number>;
  provider: string;
};
type CheckoutData = { order: Order; checkoutUrl: string | null };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

export default function Marketplace() {
  const [view, setView] = useState("shop");
  const [category, setCategory] = useState("All goods");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [vendor, setVendor] = useState("forma");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState("approved");
  const [provider, setProvider] = useState("demo");
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [checkoutKey, setCheckoutKey] = useState("");

  async function refresh() {
    const data = await api<SessionData>("session");
    setOrders(data.orders);
    setInventory(data.inventory);
    setProvider(data.provider);
    setReady(true);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    try {
      const saved = JSON.parse(localStorage.getItem("marketlane-cart") || "{}");
      if (saved && typeof saved === "object")
        setCart(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([id, quantity]) =>
                products.some((p) => p.id === id) &&
                Number.isInteger(quantity) &&
                Number(quantity) > 0 &&
                Number(quantity) <= 10,
            ),
          ) as Cart,
        );
    } catch {
      /* An old cart should not stop the shop. */
    }
    if (new URLSearchParams(location.search).has("order")) {
      setView("orders");
      setCart({});
    }
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("marketlane-cart", JSON.stringify(cart));
      } catch {
        /* Checkout still works when storage is disabled. */
      }
    }
  }, [cart, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  function changeQuantity(id: string, delta: number) {
    const available =
      inventory[id] ?? products.find((p) => p.id === id)?.stock ?? 0;
    setCart((current) => {
      const next = { ...current };
      const value = Math.max(
        0,
        Math.min(10, available, (next[id] || 0) + delta),
      );
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
    // Reuse the key only while retrying the same checkout request.
    setCheckoutKey("");
    setError("");
  }
  function add(product: Product) {
    changeQuantity(product.id, 1);
    setNotice(`${product.name} added to your bag`);
  }
  const cartLines = products.filter((p) => cart[p.id] > 0);
  const count = cartLines.reduce((sum, p) => sum + cart[p.id], 0);
  const total = cartLines.reduce((sum, p) => sum + p.price * cart[p.id], 0);
  const visible = products.filter(
    (p) =>
      (category === "All goods" || p.category === category) &&
      `${p.name} ${vendors.find((v) => v.id === p.vendorId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  async function checkout() {
    setBusy(true);
    setError("");
    const key = checkoutKey || crypto.randomUUID();
    setCheckoutKey(key);
    try {
      const result = await api<CheckoutData>("checkout", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          items: cartLines.map((p) => ({
            productId: p.id,
            quantity: cart[p.id],
          })),
          outcome,
        }),
      });
      await refresh();
      if (result.checkoutUrl) {
        location.assign(result.checkoutUrl);
        return;
      }
      if (result.order.status === "declined") {
        setError(
          "Payment declined in the demo. Your bag is saved and no stock was deducted. Choose Approved and try again.",
        );
        setCheckoutKey("");
      } else {
        setReceipt(result.order);
        setCart({});
        setCartOpen(false);
        setCheckoutKey("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedVendor = vendors.find((v) => v.id === vendor)!;
  const vendorOrders = orders.filter((o) =>
    o.lines.some((l) => l.vendorId === vendor),
  );
  const paidAllocations = vendorOrders
    .filter((o) => o.status === "paid")
    .flatMap((o) => o.allocations.filter((a) => a.vendorId === vendor));

  return (
    <>
      <div className="demo-strip">
        <span>THE INDEPENDENT MARKETPLACE</span>
        <span>
          <CreditCard size={13} />{" "}
          {provider === "stripe" ? "Stripe test mode" : "Demo checkout"} · No
          real charges
        </span>
      </div>
      <header className="header">
        <a className="brand" href="/" aria-label="Marketlane home">
          <span className="brand-icon">m</span>marketlane
          <span className="brand-period">.</span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["shop", "Marketplace"],
            ["orders", "My orders"],
            ["vendor", "Vendor studio"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "nav-link active" : "nav-link"}
              onClick={() => {
                setView(id);
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <Button
          variant="outline"
          className="bag-button"
          onClick={() => {
            setError("");
            setCartOpen(true);
          }}
        >
          <ShoppingBag size={17} />
          <span>Bag</span>
          <b>{count}</b>
        </Button>
      </header>
      {error && !cartOpen && (
        <div role="alert" className="global-error">
          {error}{" "}
          {!ready && (
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                refresh().catch((e) => setError(e.message));
              }}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      {view === "shop" ? (
        <main className="shop-page">
          <section className="shop-heading">
            <div>
              <p className="eyebrow">GOOD THINGS. INDEPENDENT PEOPLE.</p>
              <h1>A little less ordinary.</h1>
              <p>Considered goods from small studios, all in one place.</p>
            </div>
            <div className="studio-note">
              <div className="avatars">
                {vendors.map((v) => (
                  <span key={v.id} style={{ background: v.color }}>
                    {v.initials}
                  </span>
                ))}
              </div>
              <span>
                3 independent studios
                <br />
                <strong>One simple checkout</strong>
              </span>
            </div>
          </section>
          <div className="catalog-toolbar">
            <div
              className="categories"
              role="group"
              aria-label="Product categories"
            >
              {["All goods", "Home", "Everyday", "Workspace"].map((c) => (
                <Button
                  key={c}
                  variant={category === c ? "default" : "ghost"}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
            <div className="search">
              <Search size={17} />
              <Input
                aria-label="Search products or studios"
                placeholder="Find your next good thing"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="results-label">
            <span>{visible.length} thoughtful finds</span>
            <span>Made by small businesses</span>
          </div>
          <div className="product-grid">
            {visible.map((p) => (
              <article key={p.id} className="product-card">
                <button
                  className="product-image"
                  onClick={() => setDetail(p)}
                  aria-label={`View ${p.name}`}
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    width={600}
                    height={650}
                    loading="eager"
                  />
                  <span className="product-tag">{p.tag}</span>
                  <span className="detail-cue">
                    <Plus size={19} />
                  </span>
                </button>
                <div className="product-info">
                  <span className="maker">
                    {vendors.find((v) => v.id === p.vendorId)?.name}
                  </span>
                  <div className="product-title">
                    <button onClick={() => setDetail(p)}>{p.name}</button>
                    <strong>{money(p.price)}</strong>
                  </div>
                  <div className="product-bottom">
                    <span>
                      {(inventory[p.id] ?? p.stock) > 0
                        ? `${inventory[p.id] ?? p.stock} available`
                        : "Sold out"}
                    </span>
                    <button
                      className="add-button"
                      disabled={
                        !ready ||
                        !(inventory[p.id] ?? p.stock) ||
                        (cart[p.id] || 0) >=
                          Math.min(10, inventory[p.id] ?? p.stock)
                      }
                      onClick={() => add(p)}
                      aria-label={`Add ${p.name} to bag`}
                    >
                      Add to bag <Plus size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!visible.length && (
            <div className="empty-state">
              <Search />
              <h2>No goods found</h2>
              <p>Try another word or browse all goods.</p>
              <Button
                onClick={() => {
                  setSearch("");
                  setCategory("All goods");
                }}
              >
                View all goods
              </Button>
            </div>
          )}
          <section className="makers-section">
            <div>
              <p className="eyebrow">THE PEOPLE BEHIND THE GOODS</p>
              <h2>Small studios. Big care.</h2>
            </div>
            <div className="makers-grid">
              {vendors.map((v) => (
                <div key={v.id} className="maker-card">
                  <span
                    className="maker-avatar"
                    style={{ background: v.color }}
                  >
                    {v.initials}
                  </span>
                  <div>
                    <h3>{v.name}</h3>
                    <p>{v.location}</p>
                    <span>{v.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : view === "orders" ? (
        <main className="dashboard-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">KIET’S MARKETLANE</p>
              <h1>My orders</h1>
              <p>Kiet Nguyen’s demo purchases, kept together.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              Refresh orders
            </Button>
          </div>
          {orders.length ? (
            <div className="order-list">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Package size={38} />
              <h2>Your next find starts here.</h2>
              <p>
                When you check out, your order and vendor breakdown will appear
                here.
              </p>
              <Button onClick={() => setView("shop")}>
                Explore the marketplace <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </main>
      ) : (
        <main className="dashboard-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">VENDOR STUDIO</p>
              <h1>Hello, {selectedVendor.name}.</h1>
              <p>A clear view of your corner of the marketplace.</p>
            </div>
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger aria-label="Choose vendor">
                <Store size={16} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem value={v.id} key={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sandbox-note">
            <LayoutDashboard size={17} />
            <span>
              Demo studio · Switch between vendors to see each share of your
              orders. This browser has its own demo data.
            </span>
          </div>
          <div className="metric-grid">
            {[
              [
                "Gross sales",
                money(paidAllocations.reduce((s, a) => s + a.gross, 0)),
                "Paid orders only",
              ],
              [
                "Platform fee",
                money(paidAllocations.reduce((s, a) => s + a.fee, 0)),
                "8% of each vendor's sales",
              ],
              [
                "Vendor earnings",
                money(paidAllocations.reduce((s, a) => s + a.net, 0)),
                "Demo ledger · no payouts",
              ],
              ["Orders", String(paidAllocations.length), "Completed payments"],
            ].map(([label, value, hint]) => (
              <div className="metric" key={label}>
                <p>{label}</p>
                <strong>{value}</strong>
                <span>{hint}</span>
              </div>
            ))}
          </div>
          <section className="dashboard-section">
            <h2>
              Your products{" "}
              <span>
                {products.filter((p) => p.vendorId === vendor).length}
              </span>
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Available stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) => p.vendorId === vendor)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="table-product">
                            <img src={p.image} alt="" width={44} height={44} />
                            <strong>{p.name}</strong>
                          </div>
                        </td>
                        <td>{money(p.price)}</td>
                        <td>{inventory[p.id] ?? p.stock}</td>
                        <td>
                          <span className="status neutral">
                            {(inventory[p.id] ?? p.stock) > 0
                              ? "Active"
                              : "Sold out"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="dashboard-section">
            <h2>Recent orders</h2>
            {vendorOrders.length ? (
              vendorOrders.map((o) => (
                <OrderCard key={o.id} order={o} vendorId={vendor} />
              ))
            ) : (
              <div className="inline-empty">
                Your studio's orders will appear after a demo checkout.
              </div>
            )}
          </section>
        </main>
      )}
      <footer>
        <a href="/" className="footer-brand">
          marketlane.
        </a>
        <span>Independent goods, together.</span>
        <span>Demo by {demoProfile.name} · USD · No real charges</span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="product-dialog">
          {detail && (
            <>
              <img
                className="detail-image"
                src={detail.image}
                alt={detail.name}
              />
              <div className="detail-info">
                <p className="eyebrow">
                  {vendors.find((v) => v.id === detail.vendorId)?.name}
                </p>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{detail.description}</DialogDescription>
                <strong className="detail-price">{money(detail.price)}</strong>
                <p className="muted">
                  {inventory[detail.id] ?? detail.stock} available · Sample
                  product
                </p>
                <Button
                  disabled={
                    !ready ||
                    !(inventory[detail.id] ?? detail.stock) ||
                    (cart[detail.id] || 0) >=
                      Math.min(10, inventory[detail.id] ?? detail.stock)
                  }
                  onClick={() => {
                    add(detail);
                    setDetail(null);
                  }}
                >
                  <ShoppingBag size={17} />
                  Add to bag
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={cartOpen}
        onOpenChange={(open) => {
          if (!busy) setCartOpen(open);
        }}
      >
        <DialogContent className="cart-dialog">
          <DialogTitle>
            Your bag <span className="muted">({count})</span>
          </DialogTitle>
          <DialogDescription>
            Good things from independent studios. One checkout.
          </DialogDescription>
          {cartLines.length ? (
            <>
              <div className="cart-items">
                {vendors
                  .filter((v) => cartLines.some((p) => p.vendorId === v.id))
                  .map((v) => (
                    <div key={v.id} className="cart-vendor">
                      <h3>
                        <Store size={14} />
                        {v.name}
                      </h3>
                      {cartLines
                        .filter((p) => p.vendorId === v.id)
                        .map((p) => (
                          <div className="cart-item" key={p.id}>
                            <img src={p.image} alt="" width={58} height={66} />
                            <div>
                              <strong>{p.name}</strong>
                              <span>{money(p.price)}</span>
                              <div className="quantity">
                                <button
                                  disabled={busy}
                                  aria-label={`Decrease ${p.name} quantity`}
                                  onClick={() => changeQuantity(p.id, -1)}
                                >
                                  <Minus size={13} />
                                </button>
                                <span>{cart[p.id]}</span>
                                <button
                                  disabled={
                                    busy ||
                                    cart[p.id] >=
                                      Math.min(10, inventory[p.id] ?? p.stock)
                                  }
                                  aria-label={`Increase ${p.name} quantity`}
                                  onClick={() => changeQuantity(p.id, 1)}
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                            <strong>{money(p.price * cart[p.id])}</strong>
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
              <div className="checkout-summary">
                <div>
                  <span>Subtotal</span>
                  <strong>{money(total)}</strong>
                </div>
                <div>
                  <span>Shipping & tax</span>
                  <span>Not applied in this demo</span>
                </div>
                <div className="checkout-total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <div className="payment-demo">
                <div>
                  <CreditCard size={19} />
                  <div>
                    <strong>
                      {provider === "stripe"
                        ? "Stripe test checkout"
                        : "Demo payment"}
                    </strong>
                    <p>No card details needed. No real money moves.</p>
                  </div>
                </div>
                {provider === "demo" && (
                  <Select
                    value={outcome}
                    onValueChange={(value) => {
                      setOutcome(value);
                      setCheckoutKey("");
                      setError("");
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label="Demo payment result">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved payment</SelectItem>
                      <SelectItem value="declined">Declined payment</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                className="checkout-button"
                disabled={busy || !ready}
                onClick={checkout}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Processing…
                  </>
                ) : (
                  <>
                    {provider === "stripe"
                      ? "Continue to Stripe test checkout"
                      : `Pay ${money(total)} in demo`}
                    <ArrowRight size={17} />
                  </>
                )}
              </Button>
              <p className="checkout-footnote">
                Each studio receives its share, less an 8% platform fee.
              </p>
            </>
          ) : (
            <div className="empty-state">
              <ShoppingBag size={38} />
              <h2>A good place for good things.</h2>
              <p>Your bag is empty. Find something you love.</p>
              <Button
                onClick={() => {
                  setCartOpen(false);
                  setView("shop");
                }}
              >
                Keep exploring
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!receipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent className="receipt-dialog">
          {receipt && (
            <>
              <CheckCircle2 className="success-icon" size={48} />
              <p className="eyebrow">ALL SET</p>
              <DialogTitle>Good things are coming.</DialogTitle>
              <DialogDescription>
                Your demo payment was approved. Nothing was charged.
              </DialogDescription>
              <OrderCard order={receipt} />
              <Button
                onClick={() => {
                  setReceipt(null);
                  setView("vendor");
                }}
              >
                View vendor earnings <ChevronRight size={16} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setReceipt(null);
                  setView("orders");
                }}
              >
                View my orders
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrderCard({ order, vendorId }: { order: Order; vendorId?: string }) {
  const allocations = order.allocations.filter(
    (a) => !vendorId || a.vendorId === vendorId,
  );
  return (
    <article className="order-card">
      <div className="order-card-head">
        <div>
          <strong>Order {order.id.slice(0, 8).toUpperCase()}</strong>
          <p>
            {new Date(order.createdAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span className={`status ${order.status}`}>
          {order.status === "paid"
            ? "Payment approved"
            : order.status === "pending"
              ? "Awaiting payment"
              : order.status === "declined"
                ? "Payment declined"
                : "Expired"}
        </span>
      </div>
      {order.lines
        .filter((l) => !vendorId || l.vendorId === vendorId)
        .map((line) => (
          <div className="order-line" key={line.productId}>
            <span>
              {line.name} <span className="muted">× {line.quantity}</span>
            </span>
            <strong>{money(line.total)}</strong>
          </div>
        ))}
      <div className="allocation-list">
        {allocations.map((a) => (
          <div key={a.vendorId}>
            <span>{vendors.find((v) => v.id === a.vendorId)?.name}</span>
            <span>
              {money(a.gross)}{" "}
              <span className="muted">− {money(a.fee)} fee</span> ={" "}
              <strong>{money(a.net)}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="order-total">
        <span>{vendorId ? "Vendor subtotal" : "Order total"}</span>
        <strong>{money(allocations.reduce((s, a) => s + a.gross, 0))}</strong>
      </div>
      {order.status === "pending" && order.checkoutUrl && (
        <a className="payment-resume" href={order.checkoutUrl}>
          Resume Stripe test checkout <ArrowRight size={14} />
        </a>
      )}
    </article>
  );
}
