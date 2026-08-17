"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { cn } from "@blackbox/ui/lib/utils";

export function PasswordInput({
  className,
  id,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
