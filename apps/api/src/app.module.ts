import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DbModule } from "./db/db.module";
import { DevicesModule } from "./devices/devices.module";
import { InventoryModule } from "./inventory/inventory.module";
import { PermissionsCatalogModule } from "./permissions/permissions-catalog.module";
import { RbacModule } from "./rbac/rbac.module";
import { RolesModule } from "./roles/roles.module";
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
