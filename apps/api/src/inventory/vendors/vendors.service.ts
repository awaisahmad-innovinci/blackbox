import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  PaginatedVendors,
  PaymentTerms,
  VendorContact,
  VendorContactInput,
  VendorContactType,
  VendorDetail,
  VendorListItem,
} from "@blackbox/shared";
import { VENDOR_CONTACT_TYPES } from "@blackbox/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  Vendor,
  VendorContact as VendorContactEntity,
  VendorGroup,
  VendorSku,
} from "../../db/entities";
import { isUniqueViolation } from "../../common/db-errors";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { allocateVendorCode } from "../common/allocate-document-number";
import {
  CreateVendorDto,
  ListVendorsQueryDto,
  UpdateVendorDto,
} from "./dto/vendor.dto";

function emptyContact(input?: VendorContactInput): boolean {
  if (!input) return true;
  return !input.name?.trim() && !input.phone?.trim() && !input.email?.trim();
}

function toNum(value: string | null): number | null {
  if (value == null || value === "") return null;
  return Number(value);
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(VendorContactEntity)
    private readonly contacts: Repository<VendorContactEntity>,
    @InjectRepository(VendorGroup)
    private readonly groups: Repository<VendorGroup>,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
  ) {}

  async list(query: ListVendorsQueryDto): Promise<PaginatedVendors> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.vendors
      .createQueryBuilder("v")
      .leftJoin("v.group", "g")
      .where("v.tenant_id = :tenantId", { tenantId });

    const status = query.status ?? "active";
    if (status !== "all") {
      qb.andWhere("v.status = :status", { status });
    }
    if (query.groupId) {
      qb.andWhere("v.group_id = :groupId", { groupId: query.groupId });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(v.name) LIKE :term OR LOWER(v.vendor_code) LIKE :term OR LOWER(COALESCE(v.city, '')) LIKE :term)",
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("v.name", "ASC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const primaryByVendor = new Map<
      string,
      { name: string | null; phone: string | null }
    >();
    const skuCounts = new Map<string, number>();

    if (ids.length > 0) {
      const primaries = await this.contacts
        .createQueryBuilder("c")
        .where("c.tenant_id = :tenantId", { tenantId })
        .andWhere("c.vendor_id IN (:...ids)", { ids })
        .andWhere("c.contact_type = :type", { type: "PRIMARY" })
        .getMany();
      for (const c of primaries) {
        primaryByVendor.set(c.vendorId, { name: c.name, phone: c.phone });
      }

      const counts = await this.vendorSkus
        .createQueryBuilder("vs")
        .select("vs.vendor_id", "vendorId")
        .addSelect("COUNT(*)", "cnt")
        .where("vs.tenant_id = :tenantId", { tenantId })
        .andWhere("vs.vendor_id IN (:...ids)", { ids })
        .andWhere("vs.status = :status", { status: "active" })
        .groupBy("vs.vendor_id")
        .getRawMany<{ vendorId: string; cnt: string }>();
      for (const row of counts) {
        skuCounts.set(row.vendorId, Number(row.cnt));
      }
    }

    const groupNames = new Map<string, string>();
    const groupIds = [
      ...new Set(rows.map((r) => r.groupId).filter(Boolean) as string[]),
    ];
    if (groupIds.length > 0) {
      const groups = await this.groups
        .createQueryBuilder("g")
        .where("g.id IN (:...groupIds)", { groupIds })
        .getMany();
      for (const g of groups) groupNames.set(g.id, g.name);
    }

    const items: VendorListItem[] = rows.map((v) => {
      const primary = primaryByVendor.get(v.id);
      return {
        id: v.id,
        name: v.name,
        vendorCode: v.vendorCode,
        groupId: v.groupId,
        groupName: v.groupId ? (groupNames.get(v.groupId) ?? null) : null,
        status: v.status as EntityStatus,
        city: v.city,
        primaryContactName: primary?.name ?? null,
        primaryContactPhone: primary?.phone ?? null,
        suppliedSkuCount: skuCounts.get(v.id) ?? 0,
      };
    });

    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<VendorDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const vendor = await this.vendors.findOne({
      where: { id, tenantId },
      relations: { group: true, contacts: true },
    });
    if (!vendor) throw new NotFoundException("Vendor not found");
    return this.toDetail(vendor);
  }

  async create(dto: CreateVendorDto): Promise<VendorDetail> {
    const tenantId = this.fixedTenant.tenantId;
    this.assertRequiredContacts(dto);
    if (dto.groupId) await this.assertGroup(tenantId, dto.groupId);

    let saved: string;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const vendorCode =
          dto.vendorCode?.trim() ||
          (await allocateVendorCode(manager, tenantId));
        await this.assertUniqueCode(tenantId, vendorCode);
        const vendor = manager.create(Vendor, {
          tenantId,
          name: dto.name.trim(),
          vendorCode,
          groupId: dto.groupId ?? null,
          status: dto.status ?? "active",
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          state: dto.state?.trim() || null,
          country: dto.country?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          salesTarget:
            dto.salesTarget == null ? null : String(dto.salesTarget),
          creditLimit:
            dto.creditLimit == null ? null : String(dto.creditLimit),
          paymentTerms: dto.paymentTerms ?? null,
          taxNumber: dto.taxNumber?.trim() || null,
          notes: dto.notes?.trim() ?? "",
        });
        const created = await manager.save(vendor);
        await this.replaceContacts(manager, tenantId, created.id, dto);
        return created.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Vendor code already exists for this store");
      }
      throw error;
    }

    return this.getById(saved);
  }

  async update(id: string, dto: UpdateVendorDto): Promise<VendorDetail> {
    const tenantId = this.fixedTenant.tenantId;
    this.assertRequiredContacts(dto);
    const existing = await this.vendors.findOne({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Vendor not found");

    const vendorCode = dto.vendorCode?.trim() || existing.vendorCode;
    if (vendorCode !== existing.vendorCode) {
      await this.assertUniqueCode(tenantId, vendorCode, id);
    }
    if (dto.groupId) await this.assertGroup(tenantId, dto.groupId);

    try {
      await this.dataSource.transaction(async (manager) => {
        existing.name = dto.name.trim();
        existing.vendorCode = vendorCode;
        existing.groupId = dto.groupId ?? null;
        existing.status = dto.status ?? existing.status;
        existing.address = dto.address?.trim() || null;
        existing.city = dto.city?.trim() || null;
        existing.state = dto.state?.trim() || null;
        existing.country = dto.country?.trim() || null;
        existing.postalCode = dto.postalCode?.trim() || null;
        existing.salesTarget =
          dto.salesTarget == null ? null : String(dto.salesTarget);
        existing.creditLimit =
          dto.creditLimit == null ? null : String(dto.creditLimit);
        existing.paymentTerms = dto.paymentTerms ?? null;
        existing.taxNumber = dto.taxNumber?.trim() || null;
        existing.notes = dto.notes?.trim() ?? "";
        await manager.save(existing);
        await this.replaceContacts(manager, tenantId, id, dto);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Vendor code already exists for this store");
      }
      throw error;
    }

    return this.getById(id);
  }

  private async assertUniqueCode(
    tenantId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.vendors
      .createQueryBuilder("v")
      .where("v.tenant_id = :tenantId", { tenantId })
      .andWhere("LOWER(v.vendor_code) = LOWER(:code)", { code: code.trim() });
    if (excludeId) qb.andWhere("v.id <> :excludeId", { excludeId });
    const found = await qb.getOne();
    if (found) {
      throw new ConflictException("Vendor code already exists for this store");
    }
  }

  private assertRequiredContacts(dto: CreateVendorDto): void {
    if (!dto.primaryContact?.name?.trim() || !dto.primaryContact.phone?.trim()) {
      throw new BadRequestException(
        "Primary contact name and phone are required",
      );
    }
    if (!dto.managerContact?.name?.trim() || !dto.managerContact.phone?.trim()) {
      throw new BadRequestException(
        "Manager contact name and phone are required",
      );
    }
  }

  private async assertGroup(tenantId: string, groupId: string): Promise<void> {
    const group = await this.groups.findOne({
      where: { id: groupId, tenantId, status: "active" },
    });
    if (!group) {
      throw new BadRequestException("Vendor group not found or inactive");
    }
  }

  private async replaceContacts(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    dto: CreateVendorDto,
  ): Promise<void> {
    await manager.delete(VendorContactEntity, { tenantId, vendorId });

    const mapping: { type: VendorContactType; input?: VendorContactInput }[] =
      [
        { type: "PRIMARY", input: dto.primaryContact },
        { type: "OTHER", input: dto.otherContact },
        { type: "MANAGER", input: dto.managerContact },
        { type: "SALESPERSON", input: dto.salespersonContact },
      ];

    for (const { type, input } of mapping) {
      if (emptyContact(input)) continue;
      const row = manager.create(VendorContactEntity, {
        tenantId,
        vendorId,
        contactType: type,
        name: input?.name?.trim() || null,
        phone: input?.phone?.trim() || null,
        email: input?.email?.trim() || null,
      });
      await manager.save(row);
    }
  }

  private toDetail(vendor: Vendor): VendorDetail {
    const contacts: VendorContact[] = (vendor.contacts ?? [])
      .slice()
      .sort(
        (a, b) =>
          VENDOR_CONTACT_TYPES.indexOf(a.contactType as VendorContactType) -
          VENDOR_CONTACT_TYPES.indexOf(b.contactType as VendorContactType),
      )
      .map((c) => ({
        id: c.id,
        contactType: c.contactType as VendorContactType,
        name: c.name,
        phone: c.phone,
        email: c.email,
      }));

    return {
      id: vendor.id,
      name: vendor.name,
      vendorCode: vendor.vendorCode,
      groupId: vendor.groupId,
      groupName: vendor.group?.name ?? null,
      status: vendor.status as EntityStatus,
      address: vendor.address,
      city: vendor.city,
      state: vendor.state,
      country: vendor.country,
      postalCode: vendor.postalCode,
      salesTarget: toNum(vendor.salesTarget),
      creditLimit: toNum(vendor.creditLimit),
      paymentTerms: (vendor.paymentTerms as PaymentTerms | null) ?? null,
      taxNumber: vendor.taxNumber,
      notes: vendor.notes,
      contacts,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
    };
  }
}
