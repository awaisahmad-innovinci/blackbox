import { useEffect, useState } from "react";
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
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { loadVendor } from "@renderer/lib/local-db/entity-source";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";

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
  notes: string;
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
    notes: "",
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
    name: c.name.trim() || null,
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
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void vendorGroupsApi.list().then(setGroups).catch(() => undefined);
  }, []);

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
          notes: detail.notes ?? "",
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
    if (!form.vendorCode.trim()) next.vendorCode = "Vendor code is required";

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
    const body: CreateVendorRequest = {
      name: form.name.trim(),
      vendorCode: form.vendorCode.trim(),
      groupId: form.groupId || null,
      status: form.status,
      primaryContact: {
        name: form.primaryContact.name.trim(),
        phone: form.primaryContact.phone.trim(),
        email: form.primaryContact.email.trim() || null,
      },
      otherContact: toContactInput(form.otherContact),
      managerContact: {
        name: form.managerContact.name.trim(),
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
      notes: form.notes.trim(),
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
            name: c.name.trim() || null,
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
          vendorCode: body.vendorCode,
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

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Vendor Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-xs">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Vendor Code *</Label>
            <Input
              value={form.vendorCode}
              onChange={(e) => setForm({ ...form, vendorCode: e.target.value })}
            />
            {fieldErrors.vendorCode ? (
              <p className="text-destructive text-xs">{fieldErrors.vendorCode}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Vendor Group</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.status}
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.paymentTerms}
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
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
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
    </div>
  );
}
