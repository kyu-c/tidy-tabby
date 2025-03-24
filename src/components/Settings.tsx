import { useState, useEffect } from "react";
import gear from "@/assets/gear.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeMenu } from "@/components/ThemeMenu";
import { storageKeys } from "@/lib/chrome";

export default function Settings() {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(3);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    chrome.storage.local.get(storageKeys.timeoutMinutes, (result) => {
      const totalMinutes = result[storageKeys.timeoutMinutes] as
        | number
        | undefined;
      if (totalMinutes) {
        setHours(Math.floor(totalMinutes / 60));
        setMinutes(totalMinutes % 60);
      }
    });
  }, []);

  // Save total minutes whenever hours or minutes change
  useEffect(() => {
    const totalMinutes = hours * 60 + minutes;
    chrome.storage.local.set({ [storageKeys.timeoutMinutes]: totalMinutes });
  }, [hours, minutes]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <img src={gear} alt="Settings" className="h-6 w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>Theme</Label>
            <ThemeMenu />
          </div>
          <div className="space-y-2">
            <h4 className="text-lg font-medium leading-none">
              Inactive Tab Timeout
            </h4>
            <p className="text-sm text-muted-foreground">
              Set the duration after which inactive tabs will be automatically
              closed.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min={0}
                  value={hours}
                  onChange={(e) =>
                    setHours(Math.max(0, Number.parseInt(e.target.value) || 0))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  step={5}
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(
                      Math.max(
                        0,
                        Math.min(59, Number.parseInt(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
