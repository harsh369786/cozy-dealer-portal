import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/lib/mock/distributor/types";
import { createUser } from "@/services/admin/users";

export const Route = createFileRoute("/admin/users/new")({
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("dealer");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) {
      toast.error("Name and a valid 10-digit phone are required");
      return;
    }
    setSaving(true);
    try {
      const user = await createUser({ name, phone, role });
      toast.success("User created", {
        description: `${user.name} can sign in immediately with OTP.`,
      });
      await navigate({ to: "/admin/users/$userId", params: { userId: user.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

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
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
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
          <AdminPrimaryButton onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </AdminPrimaryButton>
          <p className="text-xs text-muted-foreground">
            Staging OTP is <strong>123456</strong> for all test phones.
          </p>
        </div>
      </AdminSection>
    </AdminPermissionGate>
  );
}
