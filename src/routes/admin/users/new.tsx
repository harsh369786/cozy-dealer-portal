import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
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
import { inviteUser } from "@/services/admin/users";

export const Route = createFileRoute("/admin/users/new")({
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("dealer");
  const [saving, setSaving] = useState(false);

  const handleInvite = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) {
      toast.error("Name and a valid 10-digit phone are required");
      return;
    }
    setSaving(true);
    try {
      const user = await inviteUser({ name, phone, role });
      toast.success("WhatsApp invite sent", {
        description: `${user.name} is pending until they sign up with this number.`,
      });
      await navigate({ to: "/admin/users/$userId", params: { userId: user.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPermissionGate permission="users:write">
      <AdminPageHeader
        title="Invite user"
        description="Send a WhatsApp invite. Status stays pending until they complete signup."
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
          <AdminPrimaryButton onClick={handleInvite} disabled={saving}>
            <MessageCircle className="mr-2 h-4 w-4" />
            {saving ? "Sending invite…" : "Send WhatsApp invite"}
          </AdminPrimaryButton>
          <p className="text-xs text-muted-foreground">
            A utility WhatsApp message with signup instructions will be sent. The user appears as{" "}
            <strong>Pending invite</strong> until they register with this phone number.
          </p>
        </div>
      </AdminSection>
    </AdminPermissionGate>
  );
}
