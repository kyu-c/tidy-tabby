import gear from "@/assets/gear.png";
import { Button } from "@/components/ui/button";

type SettingsProps = {
  onOpenSettings: () => void;
};

export default function Settings({ onOpenSettings }: SettingsProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onOpenSettings}>
      <img src={gear} alt="Settings" className="h-6 w-6" />
    </Button>
  );
}
