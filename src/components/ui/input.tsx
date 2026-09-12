import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md bg-overlay px-3 text-base text-fg outline-none",
        "placeholder:text-subtle",
        "transition-[box-shadow,background-color] duration-(--motion-quick) ease-(--ease-out)",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
