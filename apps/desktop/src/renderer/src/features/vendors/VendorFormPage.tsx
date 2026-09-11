import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  CreateVendorRequest,
  EntityStatus,
  PaymentTerms,
  VendorContactInput,
  VendorDetail,
  VendorGroup,
} from "@blackbox/shared";
import {
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  emailError,
  liveEmailError,
  livePersonNameError,
  livePhone11DigitError,
  personNameError,
  phone11DigitError,
  normalizeStoredText,
} from "@blackbox/shared";
import { FORM_FIELD_FULL, FORM_GRID } from "@renderer/lib/form-layout";
import { FormSelectWithAction } from "@renderer/components/form-select-with-action";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { handleEnterPickerFocus } from "@blackbox/ui/lib/form-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { loadVendor } from "@renderer/lib/local-db/entity-source";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { allocateVendorCode } from "@renderer/lib/document-numbers";
import { useSession } from "@renderer/lib/session/context";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { AddTaxonomyDialog } from "@renderer/features/taxonomy/AddTaxonomyDialog";
import type { TaxonomyKind } from "@renderer/features/taxonomy/create-taxonomy";
import {
  type TaxonomyCreatedDetail,
  useTaxonomyCreatedListener,
} from "@renderer/lib/taxonomy-created-sync";

type ContactForm = {
  name: string;
  phone: string;
  email: string;
};

type FormState = {
  name: string;
  vendorCode: string;
  groupId: string;
  status: EntityStatus;
  primaryContact: ContactForm;
  otherContact: ContactForm;
  managerContact: ContactForm;
  salespersonContact: ContactForm;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  salesTarget: string;
  creditLimit: string;
  paymentTerms: PaymentTerms | "";
  taxNumber: string;
};

const emptyContact = (): ContactForm => ({ name: "", phone: "", email: "" });

function blankForm(): FormState {
  return {
    name: "",
    vendorCode: "",
    groupId: "",
    status: "active",
    primaryContact: emptyContact(),
    otherContact: emptyContact(),
    managerContact: emptyContact(),
    salespersonContact: emptyContact(),
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    salesTarget: "",
    creditLimit: "",
    paymentTerms: "",
    taxNumber: "",
  };
}

function contactFromDetail(
  detail: VendorDetail,
  type: "PRIMARY" | "OTHER" | "MANAGER" | "SALESPERSON",
): ContactForm {
  const c = detail.contacts.find((x) => x.contactType === type);
  return {
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
  };
}

function toContactInput(c: ContactForm): VendorContactInput | undefined {
  if (!c.name.trim() && !c.phone.trim() && !c.email.trim()) return undefined;
  return {
    name: c.name.trim() ? normalizeStoredText(c.name) : null,
    phone: c.phone.trim() || null,
    email: c.email.trim() || null,
  };
}

function liveContactErrors(
  value: ContactForm,
): Partial<Record<keyof ContactForm, string>> {
  const next: Partial<Record<keyof ContactForm, string>> = {};
  const nameLive = livePersonNameError(value.name);
  if (nameLive) next.name = nameLive;
  const phoneLive = livePhone11DigitError(value.phone);
  if (phoneLive) next.phone = phoneLive;
  const mailLive = liveEmailError(value.email);
  if (mailLive) next.email = mailLive;
  return next;
}

function ContactFields({
  title,
  value,
  onChange,
  required = false,
  errors,
}: {
  title: string;
  value: ContactForm;
  onChange: (next: ContactForm) => void;
  required?: boolean;
  errors?: Partial<Record<keyof ContactForm, string>>;
}) {
  const live = liveContactErrors(value);
  const shown = {
    name: live.name ?? (value.name.trim() ? undefined : errors?.name),
    phone: live.phone ?? (value.phone.trim() ? undefined : errors?.phone),
    email: live.email ?? errors?.email,
  };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Name{required ? " *" : ""}</Label>
          <Input
            value={value.name}
            aria-invalid={Boolean(shown.name)}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            onBlur={(e) =>
              onChange({ ...value, name: normalizeStoredText(e.target.value) })
            }
          />
          {shown.name ? (
            <p className="text-destructive text-xs">{shown.name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Phone{required ? " *" : ""}</Label>
          <Input
            value={value.phone}
            inputMode="numeric"
            maxLength={11}
            aria-invalid={Boolean(shown.phone)}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
          {shown.phone ? (
            <p className="text-destructive text-xs">{shown.phone}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              11 digits, e.g. 03049636186
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            value={value.email}
            aria-invalid={Boolean(shown.email)}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
          {shown.email ? (
            <p className="text-destructive text-xs">{shown.email}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function VendorFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useSession();
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createTaxonomyKind, setCreateTaxonomyKind] =
    useState<TaxonomyKind | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function onVendorGroupCreated(row: VendorGroup) {
    setGroups((prev) =>
      prev.some((g) => g.id === row.id) ? prev : [...prev, row],
    );
    setForm((prev) => ({ ...prev, groupId: row.id }));
    setCreateTaxonomyKind(null);
  }

  const handleGlobalTaxonomyCreated = useCallback(
    ({ kind, row }: TaxonomyCreatedDetail) => {
      if (kind !== "vendor_group") return;
      setGroups((prev) =>
        prev.some((g) => g.id === row.id) ? prev : [...prev, row as VendorGroup],
      );
      setForm((prev) => ({ ...prev, groupId: row.id }));
    },
    [],
  );

  useTaxonomyCreatedListener(handleGlobalTaxonomyCreated);

  useEffect(() => {
    void vendorGroupsApi.list().then(setGroups).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isEdit) return;
    const tenantName = user?.tenantName?.trim() ?? "";
    if (!tenantName) return;
    void allocateVendorCode(tenantName).then((code) => {
      setForm((prev) => ({ ...prev, vendorCode: code }));
    });
  }, [isEdit, user?.tenantName]);

  useEffect(() => {
    if (loading || isEdit) return;
    requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
  }, [loading, isEdit]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadVendor(id)
      .then((detail) => {
        if (cancelled) return;
        setForm({
          name: detail.name,
          vendorCode: detail.vendorCode,
          groupId: detail.groupId ?? "",
          status: detail.status,
          primaryContact: contactFromDetail(detail, "PRIMARY"),
          otherContact: contactFromDetail(detail, "OTHER"),
          managerContact: contactFromDetail(detail, "MANAGER"),
          salespersonContact: contactFromDetail(detail, "SALESPERSON"),
          address: detail.address ?? "",
          city: detail.city ?? "",
          state: detail.state ?? "",
          country: detail.country ?? "",
          postalCode: detail.postalCode ?? "",
          salesTarget:
            detail.salesTarget == null ? "" : String(detail.salesTarget),
          creditLimit:
            detail.creditLimit == null ? "" : String(detail.creditLimit),
          paymentTerms: detail.paymentTerms ?? "",
          taxNumber: detail.taxNumber ?? "",
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load vendor"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Vendor name is required";
    if (!isEdit && !form.vendorCode.trim()) {
      next.vendorCode = "Vendor code is being assigned…";
    }

    const requiredContacts = [
      ["primaryContact", form.primaryContact, "Primary contact"],
      ["managerContact", form.managerContact, "Manager"],
    ] as const;
    for (const [key, contact, label] of requiredContacts) {
      const nameErr = personNameError(contact.name);
      if (nameErr) {
        next[`${key}.name`] =
          nameErr === "Name is required" ? `${label} name is required` : nameErr;
      }
      const phoneErr = phone11DigitError(contact.phone);
      if (phoneErr) {
        next[`${key}.phone`] =
          phoneErr === "Phone number is required"
            ? `${label} phone is required`
            : phoneErr;
      }
    }

    for (const [key, contact] of Object.entries({
      primaryContact: form.primaryContact,
      otherContact: form.otherContact,
      managerContact: form.managerContact,
      salespersonContact: form.salespersonContact,
    })) {
      const optional = key === "otherContact" || key === "salespersonContact";
      if (
        optional &&
        !contact.name.trim() &&
        !contact.phone.trim() &&
        !contact.email.trim()
      ) {
        continue;
      }
      if (optional && contact.name.trim()) {
        const nameErr = personNameError(contact.name);
        if (nameErr) next[`${key}.name`] = nameErr;
      }
      if (optional && contact.phone.trim()) {
        const phoneErr = phone11DigitError(contact.phone, { required: false });
        if (phoneErr) next[`${key}.phone`] = phoneErr;
      }
      const mailErr = emailError(contact.email, { required: false });
      if (mailErr) next[`${key}.email`] = mailErr;
    }
    if (
      form.salesTarget &&
      (Number.isNaN(Number(form.salesTarget)) || Number(form.salesTarget) < 0)
    ) {
      next.salesTarget = "Enter a non-negative number";
    }
    if (
      form.creditLimit &&
      (Number.isNaN(Number(form.creditLimit)) || Number(form.creditLimit) < 0)
    ) {
      next.creditLimit = "Enter a non-negative number";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSave() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    let vendorCode = form.vendorCode.trim();
    if (!vendorCode && !isEdit) {
      vendorCode = await allocateVendorCode(user?.tenantName ?? "");
    }
    const body: CreateVendorRequest = {
      name: normalizeStoredText(form.name),
      ...(isEdit || vendorCode ? { vendorCode } : {}),
      groupId: form.groupId || null,
      status: form.status,
      primaryContact: {
        name: normalizeStoredText(form.primaryContact.name),
        phone: form.primaryContact.phone.trim(),
        email: form.primaryContact.email.trim() || null,
      },
      otherContact: toContactInput(form.otherContact),
      managerContact: {
        name: normalizeStoredText(form.managerContact.name),
        phone: form.managerContact.phone.trim(),
        email: form.managerContact.email.trim() || null,
      },
      salespersonContact: toContactInput(form.salespersonContact),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      postalCode: form.postalCode.trim() || null,
      salesTarget: form.salesTarget ? Number(form.salesTarget) : null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      paymentTerms: form.paymentTerms || null,
      taxNumber: form.taxNumber.trim() || null,
      notes: "",
    };

    let saved: VendorDetail;
    try {
      if (await isDeviceBound()) {
        const localId = isEdit && id ? id : crypto.randomUUID();
        const now = new Date().toISOString();
        const contacts: VendorDetail["contacts"] = [];
        const addContact = (
          type: VendorDetail["contacts"][number]["contactType"],
          c: ContactForm,
        ) => {
          if (!c.name.trim() && !c.phone.trim() && !c.email.trim()) return;
          contacts.push({
            id: crypto.randomUUID(),
            contactType: type,
            name: c.name.trim() ? normalizeStoredText(c.name) : null,
            phone: c.phone.trim() || null,
            email: c.email.trim() || null,
          });
        };
        addContact("PRIMARY", form.primaryContact);
        addContact("OTHER", form.otherContact);
        addContact("MANAGER", form.managerContact);
        addContact("SALESPERSON", form.salespersonContact);
        saved = {
          id: localId,
          name: body.name,
          vendorCode,
          groupId: body.groupId ?? null,
          groupName: groups.find((g) => g.id === body.groupId)?.name ?? null,
          status: body.status ?? "active",
          address: body.address ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          country: body.country ?? null,
          postalCode: body.postalCode ?? null,
          salesTarget: body.salesTarget ?? null,
          creditLimit: body.creditLimit ?? null,
          paymentTerms: body.paymentTerms ?? null,
          taxNumber: body.taxNumber ?? null,
          notes: body.notes ?? "",
          contacts,
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "vendor",
          entityId: localId,
          operation: saved.status === "inactive" ? "DELETE" : "UPSERT",
          payload: saved as unknown as Record<string, unknown>,
        });
        void syncNow();
        setSaving(false);
        navigate(`/vendors/${localId}`, {
          state: { vendor: saved, flash: "Vendor created successfully." },
          replace: true,
        });
        return;
      }
      saved = isEdit && id
        ? await vendorsApi.update(id, body)
        : await vendorsApi.create(body);
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to save vendor"));
      return;
    }

    let cacheWarning = false;
    try {
      await window.blackbox?.localDb?.upsertVendor(saved);
    } catch {
      cacheWarning = true;
    }

    setSaving(false);
    const success = isEdit
      ? "Vendor updated successfully."
      : "Vendor created successfully.";
    navigate(`/vendors/${saved.id}`, {
      state: {
        vendor: saved,
        flash: cacheWarning
          ? `${success} Local cache update is pending.`
          : success,
      },
      replace: true,
    });
  }

  usePageKeyboard({
    onSave: () => void onSave(),
    enabled: !loading,
  });

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? "Edit Vendor" : "Add Vendor"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Basic info, contacts, address, and commercial terms.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Vendor Information</h2>
        <div className={FORM_GRID}>
          <div className={`space-y-1.5 ${FORM_FIELD_FULL}`}>
            <Label htmlFor="vendor-name">Vendor Name *</Label>
            <Input
              ref={nameRef}
              id="vendor-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={(e) =>
                setForm({ ...form, name: normalizeStoredText(e.target.value) })
              }
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-xs">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Vendor Code</Label>
            <Input
              value={form.vendorCode}
              readOnly={!isEdit}
              disabled={!isEdit}
              onChange={(e) =>
                isEdit
                  ? setForm({ ...form, vendorCode: e.target.value })
                  : undefined
              }
            />
            {!isEdit ? (
              <p className="text-muted-foreground text-xs">
                Assigned automatically from your business name.
              </p>
            ) : null}
            {fieldErrors.vendorCode ? (
              <p className="text-destructive text-xs">{fieldErrors.vendorCode}</p>
            ) : null}
          </div>
          <FormSelectWithAction
            id="group"
            label="Vendor Group"
            actionLabel="+ New group"
            onAction={() => setCreateTaxonomyKind("vendor_group")}
            data-enter-picker=""
            value={form.groupId}
            onFocus={handleEnterPickerFocus}
            onChange={(e) => setForm({ ...form, groupId: e.target.value })}
          >
            <option value="">Select group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </FormSelectWithAction>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              data-enter-picker=""
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.status}
              onFocus={handleEnterPickerFocus}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as EntityStatus })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-medium">Contacts</h2>
        <ContactFields
          title="Primary Contact"
          required
          value={form.primaryContact}
          onChange={(primaryContact) => setForm({ ...form, primaryContact })}
          errors={{
            name: fieldErrors["primaryContact.name"],
            phone: fieldErrors["primaryContact.phone"],
            email: fieldErrors["primaryContact.email"],
          }}
        />
        <ContactFields
          title="Other Contact"
          value={form.otherContact}
          onChange={(otherContact) => setForm({ ...form, otherContact })}
          errors={{ email: fieldErrors["otherContact.email"] }}
        />
        <ContactFields
          title="Manager"
          required
          value={form.managerContact}
          onChange={(managerContact) => setForm({ ...form, managerContact })}
          errors={{
            name: fieldErrors["managerContact.name"],
            phone: fieldErrors["managerContact.phone"],
            email: fieldErrors["managerContact.email"],
          }}
        />
        <ContactFields
          title="Salesperson"
          value={form.salespersonContact}
          onChange={(salespersonContact) =>
            setForm({ ...form, salespersonContact })
          }
          errors={{ email: fieldErrors["salespersonContact.email"] }}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Address</h2>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Textarea
            rows={3}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div className={FORM_GRID}>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>State / Province</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Postal Code</Label>
            <Input
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Commercial Information</h2>
        <div className={FORM_GRID}>
          <div className="space-y-1.5">
            <Label>Sales Target</Label>
            <Input
              inputMode="decimal"
              value={form.salesTarget}
              onChange={(e) => setForm({ ...form, salesTarget: e.target.value })}
            />
            {fieldErrors.salesTarget ? (
              <p className="text-destructive text-xs">{fieldErrors.salesTarget}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Credit Limit</Label>
            <Input
              inputMode="decimal"
              value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
            />
            {fieldErrors.creditLimit ? (
              <p className="text-destructive text-xs">{fieldErrors.creditLimit}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <select
              data-enter-picker=""
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.paymentTerms}
              onFocus={handleEnterPickerFocus}
              onChange={(e) =>
                setForm({
                  ...form,
                  paymentTerms: e.target.value as PaymentTerms | "",
                })
              }
            >
              <option value="">Select terms</option>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TERMS_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tax Number</Label>
            <Input
              value={form.taxNumber}
              onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
              data-enter-submit=""
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void onSave();
              }}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-3 border-t pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(isEdit && id ? `/vendors/${id}` : "/vendors")}
        >
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Vendor"}
        </Button>
      </div>

      <KeyboardHints hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SAVE]} />

      {createTaxonomyKind ? (
        <AddTaxonomyDialog
          open
          kind={createTaxonomyKind}
          returnFocusTo="group"
          onClose={() => setCreateTaxonomyKind(null)}
          onCreated={onVendorGroupCreated}
        />
      ) : null}
    </div>
  );
}
