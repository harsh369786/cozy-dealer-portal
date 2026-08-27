import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsyncData } from "@/hooks/use-async-data";
import type { UserRole } from "@/lib/mock/distributor/types";
import { createUser, getUserCreateOptions } from "@/services/admin/users";

export const Route = createFileRoute("/admin/users/new")({
  component: NewUserPage,
});

function NewUserPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("admin_staff");
  const [dealerId, setDealerId] = useState("");
  const [distributorId, setDistributorId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [linkExisting, setLinkExisting] = useState(false);
  const [sendWhatsAppInvite, setSendWhatsAppInvite] = useState(false);
  const [saving, setSaving] = useState(false);

  const optionsQuery = useAsyncData(() => getUserCreateOptions(), []);

  const handleCreate = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) {
      toast.error("Name and a valid 10-digit phone are required");
      return;
    }
    if (role === "dealer" && linkExisting && !dealerId) {
      toast.error("Select the dealer store to link this login to");
      return;
    }
    if (role === "dealer" && !linkExisting && !distributorId) {
      toast.error("Select which distributor this dealer belongs to");
      return;
    }
    if (role === "distributor" && linkExisting && !distributorId) {
      toast.error("Select the distributor to link this login to");
      return;
    }

    setSaving(true);
    try {
      const user = await createUser({
        name,
        phone,
        role,
        dealerId: role === "dealer" && linkExisting ? dealerId : null,
        distributorId:
          role === "distributor" && linkExisting
            ? distributorId
            : role === "dealer" && !linkExisting
              ? distributorId
              : null,
        storeName: role === "dealer" && !linkExisting ? storeName.trim() || name.trim() : null,
        sendWhatsAppInvite,
      });
      toast.success("User created", {
        description: sendWhatsAppInvite
          ? `${user.name} was created and a WhatsApp invite was queued for +91 ${phone}.`
          : `${user.name} can sign in immediately with OTP.`,
      });
      await navigate({ to: "/admin/users/$userId", params: { userId: user.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (optionsQuery.loading) return <PageSkeleton rows={3} />;
  if (optionsQuery.error || !optionsQuery.data) {
    return (
      <ErrorState
        message={optionsQuery.error ?? t("errors.failedToLoadUsers")}
        onRetry={optionsQuery.retry}
      />
    );
  }

  const { dealers, distributors } = optionsQuery.data;

  return (
    <AdminPermissionGate permission="users:write">
      <AdminPageHeader
        title="Create user"
        description="Add an active portal user. They can sign in with OTP on their phone number."
        actions={
          <Link to="/admin/users">
            <Button variant="outline" className="rounded-2xl font-bold">
              Cancel
            </Button>
          </Link>
        }
      />
      <AdminSection title="User details">
        <div className="grid max-w-lg gap-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 rounded-2xl" />
          </div>
          <div>
            <Label htmlFor="phone">Mobile number</Label>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-input bg-background px-4">
              <span className="text-sm font-semibold text-muted-foreground">+91</span>
              <Input
                id="phone"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                placeholder="98765 43210"
              />
            </div>
          </div>
          <div>
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as UserRole);
                setDealerId("");
                setDistributorId("");
                setStoreName("");
                setLinkExisting(false);
              }}
            >
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin_staff">Admin Staff</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
                <SelectItem value="sales_executive">Sales Executive</SelectItem>
                <SelectItem value="dealer">Dealer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "dealer" && (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
                <Checkbox
                  id="link-existing-dealer"
                  checked={linkExisting}
                  onCheckedChange={(checked) => {
                    setLinkExisting(checked === true);
                    setDealerId("");
                    setDistributorId("");
                  }}
                />
                <Label htmlFor="link-existing-dealer" className="cursor-pointer font-semibold">
                  Link to an existing dealer store
                </Label>
              </div>
              {linkExisting ? (
                <div>
                  <Label>Dealer store</Label>
                  <Select value={dealerId || undefined} onValueChange={setDealerId}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Select dealer store" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealers.map((dealer) => (
                        <SelectItem key={dealer.id} value={dealer.id}>
                          {dealer.name} ({dealer.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dealers.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No dealer stores found. Uncheck the option above to create a new store with this user.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="store-name">Store name</Label>
                    <Input
                      id="store-name"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="mt-1 rounded-2xl"
                      placeholder={name.trim() || "Same as full name"}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      A new dealer store is created for this person.
                    </p>
                  </div>
                  <div>
                    <Label>Belongs to distributor</Label>
                    <Select value={distributorId || undefined} onValueChange={setDistributorId}>
                      <SelectTrigger className="mt-1 rounded-2xl">
                        <SelectValue placeholder="Select distributor" />
                      </SelectTrigger>
                      <SelectContent>
                        {distributors.map((distributor) => (
                          <SelectItem key={distributor.id} value={distributor.id}>
                            {distributor.name}
                            {distributor.region ? ` · ${distributor.region}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {distributors.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No distributors yet. Create a distributor user first, then add dealers under them.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Every dealer belongs to a distributor network. This is the only extra choice needed.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {role === "distributor" && (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
                <Checkbox
                  id="link-existing-distributor"
                  checked={linkExisting}
                  onCheckedChange={(checked) => {
                    setLinkExisting(checked === true);
                    setDistributorId("");
                  }}
                />
                <Label htmlFor="link-existing-distributor" className="cursor-pointer font-semibold">
                  Link to an existing distributor
                </Label>
              </div>
              {linkExisting ? (
                <div>
                  <Label>Distributor</Label>
                  <Select value={distributorId || undefined} onValueChange={setDistributorId}>
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue placeholder="Select distributor" />
                    </SelectTrigger>
                    <SelectContent>
                      {distributors.map((distributor) => (
                        <SelectItem key={distributor.id} value={distributor.id}>
                          {distributor.name}
                          {distributor.region ? ` · ${distributor.region}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {distributors.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No distributors found. Uncheck the option above to create a new distributor with this user.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  A new distributor organization is created from this name. You do not need to pick an existing one.
                </p>
              )}
            </>
          )}

          <div className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
            <Checkbox
              id="send-whatsapp-invite"
              checked={sendWhatsAppInvite}
              onCheckedChange={(checked) => setSendWhatsAppInvite(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="send-whatsapp-invite" className="cursor-pointer font-semibold">
                Send signup invite via WhatsApp
              </Label>
              <p className="text-xs text-muted-foreground">
                Optional. Queues a WhatsApp message with the portal login link to{" "}
                {phone.length === 10 ? `+91 ${phone}` : "the mobile number above"}.
              </p>
            </div>
          </div>

          <AdminPrimaryButton
            onClick={handleCreate}
            disabled={
              saving ||
              (role === "dealer" && linkExisting && !dealerId) ||
              (role === "dealer" && !linkExisting && !distributorId) ||
              (role === "distributor" && linkExisting && !distributorId)
            }
          >
            {saving ? "Creating…" : "Create user"}
          </AdminPrimaryButton>
          {import.meta.env.DEV && (
            <p className="text-xs text-muted-foreground">
              Local OTP is <strong>123456</strong> for all test phones.
            </p>
          )}
        </div>
      </AdminSection>
    </AdminPermissionGate>
  );
}
