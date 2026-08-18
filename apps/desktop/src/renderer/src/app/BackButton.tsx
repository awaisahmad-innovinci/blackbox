import { useNavigate } from "react-router-dom";
import { Button } from "@blackbox/ui/button";

export function BackButton() {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
      ← Back
    </Button>
  );
}
