import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resolveAssetUrl } from "@/lib/asset-url";
import {
  ALLOWED_IMAGE_TYPES,
  formatMaxImageSize,
  readFileAsDataUrl,
  validateImageFile,
} from "@/lib/image-data-url";

type AdminImageFileUploadProps = {
  id: string;
  label: string;
  hint?: string;
  imageUrl?: string;
  onChange: (next: { imageUrl?: string }) => void;
  disabled?: boolean;
};

export function AdminImageFileUpload({
  id,
  label,
  hint = "Stored in the database when you save.",
  imageUrl,
  onChange,
  disabled,
}: AdminImageFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({ imageUrl: dataUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read image");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          disabled={disabled || loading}
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl"
          disabled={disabled || loading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          {loading ? "Reading…" : imageUrl ? "Replace image" : "Upload image"}
        </Button>
        {imageUrl && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            className="rounded-2xl"
            disabled={loading}
            onClick={() => onChange({ imageUrl: undefined })}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        JPEG, PNG, or WebP up to {formatMaxImageSize()}. {hint}
      </p>
      {imageUrl ? (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-border">
          <img src={resolveAssetUrl(imageUrl)} alt="Preview" className="max-h-48 w-full object-cover" />
          {!disabled && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 top-2 h-8 w-8 rounded-full"
              onClick={() => onChange({ imageUrl: undefined })}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
