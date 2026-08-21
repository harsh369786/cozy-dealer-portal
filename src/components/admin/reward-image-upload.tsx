import { AdminImageFileUpload } from "@/components/admin/admin-image-file-upload";

export function RewardImageUpload({
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
      id="reward-image-file"
      label="Reward image"
      imageUrl={imageUrl}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
