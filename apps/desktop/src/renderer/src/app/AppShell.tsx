import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@blackbox/ui/lib/utils";
import { handleEnterToNextField } from "@blackbox/ui/lib/form-keyboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@blackbox/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/warehouses", label: "Warehouses" },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const vendorsActive =
    location.pathname.startsWith("/vendors") ||
    location.pathname.startsWith("/vendor-groups");
  const inventoryActive =
    location.pathname.startsWith("/products") ||
    location.pathname.startsWith("/skus") ||
    location.pathname.startsWith("/inventory") ||
    location.pathname.startsWith("/brands") ||
    location.pathname.startsWith("/categories");
  const purchasingActive =
    location.pathname.startsWith("/purchase-orders") ||
    location.pathname.startsWith("/purchasing");

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/80 bg-card/40 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Blackbox
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  inventoryActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Inventory
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => navigate("/products/new")}>
                  Add Product
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/products")}>
                  See Products
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/brands")}>
                  Brands
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/categories")}>
                  Categories
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/inventory/out")}>
                  Inventory Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  purchasingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Purchasing
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => navigate("/purchase-orders/new")}
                >
                  Create Purchase Order
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/purchase-orders")}>
                  Purchase Orders
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  vendorsActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Vendors
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => navigate("/vendors/new")}>
                  Add Vendor
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/vendors")}>
                  See Vendors
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/vendor-groups")}>
                  Vendor Groups
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-6 py-8"
        data-enter-nav=""
        onKeyDown={handleEnterToNextField}
      >
        <Outlet />
      </main>
    </div>
  );
}
