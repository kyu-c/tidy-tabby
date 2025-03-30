import broom from "@/assets/broom.png";
import { Button } from "@/components/ui/button";

export default function CloseInactiveButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>
      <img src={broom} alt="Broom" className="h-6 w-6" />
      Close inactive tabs
    </Button>
  );
}
