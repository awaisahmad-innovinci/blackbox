import { useNavigate } from "react-router-dom";
import { Button } from "@blackbox/ui/button";

export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => (to ? navigate(to) : navigate(-1))}
    >
      ← Back
    </Button>
  );
}
