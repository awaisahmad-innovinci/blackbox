import { DropdownMenuItem } from "@blackbox/ui/dropdown-menu";

export function NavDropdownMenuItem({
  index,
  label,
  onSelect,
}: {
  index: number;
  label: string;
  onSelect: () => void;
}) {
  const shortcut = String(index + 1);
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      aria-keyshortcuts={shortcut}
    >
      <span className="text-muted-foreground mr-2 w-4 tabular-nums">
        {shortcut}
      </span>
      {label}
    </DropdownMenuItem>
  );
}
