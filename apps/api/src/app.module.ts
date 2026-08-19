import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { OptionalJwtAuthGuard } from "./auth/optional-jwt-auth.guard";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { RequestTenantInterceptor } from "./common/request-tenant.interceptor";
import { DbModule } from "./db/db.module";
import { DevicesModule } from "./devices/devices.module";
import { InventoryModule } from "./inventory/inventory.module";
import { PermissionsCatalogModule } from "./permissions/permissions-catalog.module";
import { RbacModule } from "./rbac/rbac.module";
import { RolesModule } from "./roles/roles.module";
import { SyncModule } from "./sync/sync.module";
import { TenantsModule } from "./tenants/tenants.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.local"],
    }),
    DbModule,
    RbacModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PermissionsCatalogModule,
    DevicesModule,
    InventoryModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: OptionalJwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestTenantInterceptor },
  ],
})
export class AppModule {}
