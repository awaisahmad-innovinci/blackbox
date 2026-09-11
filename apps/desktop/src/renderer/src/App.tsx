import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConfirmProvider } from "./components/confirm-provider";
import { AppShell } from "./app/AppShell";
import { SignInPage } from "./features/auth/SignInPage";
import { BarcodeScanProvider } from "./lib/barcode-scan";
import { SessionProvider } from "./lib/session/session-context";
import { useSession } from "./lib/session/context";
import { BrandFormPage } from "./features/brands/BrandFormPage";
import { BrandsListPage } from "./features/brands/BrandsListPage";
import { CategoriesListPage } from "./features/categories/CategoriesListPage";
import { CategoryFormPage } from "./features/categories/CategoryFormPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { InventoryInOutReportPage } from "./features/inventory/InventoryInOutReportPage";
import { InventoryOutDetailPage } from "./features/inventory/InventoryOutDetailPage";
import { InventoryOutListPage } from "./features/inventory/InventoryOutListPage";
import { InventoryOutPage } from "./features/inventory/InventoryOutPage";
import { VendorReturnDetailPage } from "./features/inventory/VendorReturnDetailPage";
import { VendorReturnFormPage } from "./features/inventory/VendorReturnFormPage";
import { VendorReturnsListPage } from "./features/inventory/VendorReturnsListPage";
import { ProductFormPage } from "./features/products/ProductFormPage";
import { ProductProfilePage } from "./features/products/ProductProfilePage";
import { ProductsListPage } from "./features/products/ProductsListPage";
import { GoodsReceiptProfilePage } from "./features/purchasing/GoodsReceiptProfilePage";
import { GoodsReceiptsListPage } from "./features/purchasing/GoodsReceiptsListPage";
import { PurchaseOrderFormPage } from "./features/purchasing/PurchaseOrderFormPage";
import { PurchaseOrderProfilePage } from "./features/purchasing/PurchaseOrderProfilePage";
import { PurchaseOrdersListPage } from "./features/purchasing/PurchaseOrdersListPage";
import { ReceivePurchaseOrderPage } from "./features/purchasing/ReceivePurchaseOrderPage";
import { SkuProfilePage } from "./features/skus/SkuProfilePage";
import { VendorGroupFormPage } from "./features/vendor-groups/VendorGroupFormPage";
import { VendorGroupsListPage } from "./features/vendor-groups/VendorGroupsListPage";
import { VendorFormPage } from "./features/vendors/VendorFormPage";
import { VendorProfilePage } from "./features/vendors/VendorProfilePage";
import { VendorsListPage } from "./features/vendors/VendorsListPage";
import { WarehouseFormPage } from "./features/warehouses/WarehouseFormPage";
import { WarehousesListPage } from "./features/warehouses/WarehousesListPage";

export default function App() {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <AuthenticatedApp />
      </ConfirmProvider>
    </SessionProvider>
  );
}

function AuthenticatedApp() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="bg-background text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Restoring session…
      </div>
    );
  }

  if (status === "signed-out") {
    return <SignInPage />;
  }

  return (
    <BarcodeScanProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsListPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id" element={<ProductProfilePage />} />
          <Route path="products/:id/edit" element={<ProductFormPage />} />
          <Route path="brands" element={<BrandsListPage />} />
          <Route path="brands/new" element={<BrandFormPage />} />
          <Route path="brands/:id/edit" element={<BrandFormPage />} />
          <Route path="categories" element={<CategoriesListPage />} />
          <Route path="categories/new" element={<CategoryFormPage />} />
          <Route path="categories/:id/edit" element={<CategoryFormPage />} />
          <Route path="vendors" element={<VendorsListPage />} />
          <Route path="vendors/new" element={<VendorFormPage />} />
          <Route path="vendors/:id" element={<VendorProfilePage />} />
          <Route path="vendors/:id/edit" element={<VendorFormPage />} />
          <Route path="vendor-groups" element={<VendorGroupsListPage />} />
          <Route path="vendor-groups/new" element={<VendorGroupFormPage />} />
          <Route
            path="vendor-groups/:id/edit"
            element={<VendorGroupFormPage />}
          />
          <Route path="skus/:id" element={<SkuProfilePage />} />
          <Route
            path="inventory/reports"
            element={<InventoryInOutReportPage />}
          />
          <Route path="inventory/out" element={<InventoryOutListPage />} />
          <Route path="inventory/out/new" element={<InventoryOutPage />} />
          <Route
            path="inventory/out/:id"
            element={<InventoryOutDetailPage />}
          />
          <Route path="inventory/returns" element={<VendorReturnsListPage />} />
          <Route
            path="inventory/returns/new"
            element={<VendorReturnFormPage />}
          />
          <Route
            path="inventory/returns/:id"
            element={<VendorReturnDetailPage />}
          />
          <Route path="purchase-orders" element={<PurchaseOrdersListPage />} />
          <Route
            path="purchase-orders/new"
            element={<PurchaseOrderFormPage />}
          />
          <Route
            path="purchase-orders/:id"
            element={<PurchaseOrderProfilePage />}
          />
          <Route
            path="purchase-orders/:id/edit"
            element={<PurchaseOrderFormPage />}
          />
          <Route
            path="purchase-orders/:id/receive"
            element={<ReceivePurchaseOrderPage />}
          />
          <Route path="goods-receipts" element={<GoodsReceiptsListPage />} />
          <Route
            path="goods-receipts/:id"
            element={<GoodsReceiptProfilePage />}
          />
          <Route
            path="purchasing"
            element={<Navigate to="/purchase-orders" replace />}
          />
          <Route path="warehouses" element={<WarehousesListPage />} />
          <Route path="warehouses/new" element={<WarehouseFormPage />} />
          <Route path="warehouses/:id/edit" element={<WarehouseFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </BarcodeScanProvider>
  );
}
