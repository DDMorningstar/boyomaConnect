"use client";
import { useActionState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { ImageUpload } from "@/components/forms/image-upload";
import { updateDisplayName, uploadAvatar } from "@/features/auth/actions";

export function ProfileForms({ name, avatar }: { name: string | null; avatar: string | null }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <div className="border-line bg-surface space-y-5 rounded-[var(--radius-card)] border p-4">
      <ImageUpload action={uploadAvatar} field="avatar" maxSide={512} label="Changer ma photo">
        <Avatar src={avatar} name={name} size={64} />
      </ImageUpload>
      <form action={action} className="space-y-2">
        <label htmlFor="display_name" className={labelClass}>
          Nom affiché
        </label>
        <div className="flex gap-2">
          <input
            id="display_name"
            name="display_name"
            defaultValue={name ?? ""}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    </div>
  );
}
