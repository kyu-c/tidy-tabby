import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "./ui/button";
import vacuum from "@/assets/vacuum.png";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function CloseAllTabsButton({
  onClick,
}: {
  onClick: () => void;
}) {
  const [isVacuuming, setIsVacuuming] = useState(false);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={cn(
              "animate-none",
              isVacuuming && "animate-vacuum"
            )}
            onClick={() => {
              setIsVacuuming(true);
              onClick();
              setTimeout(() => {
                setIsVacuuming(false);
              }, 500);
            }}
          >
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
