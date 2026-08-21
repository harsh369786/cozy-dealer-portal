import { AdminImageFileUpload } from "@/components/admin/admin-image-file-upload";

export function CampaignImageUpload({
  imageUrl,
  onChange,
  disabled,
}: {
  imageUrl?: string;
  onChange: (next: { imageUrl?: string }) => void;
  disabled?: boolean;
}) {
  return (
    <AdminImageFileUpload
      id="campaign-image-file"
      label="Campaign image"
      imageUrl={imageUrl}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
