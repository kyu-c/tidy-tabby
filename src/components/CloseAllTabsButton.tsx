import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "./ui/button";
import vacuum from "@/assets/vacuum.png";

export default function CloseAllTabsButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={onClick}>
            <img src={vacuum} alt="Vacuum" className="h-6 w-6" />
            Close all tabs
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Close all tabs (except pinned, locked, and current tab)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
