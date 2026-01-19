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
import { Switch } from "@/components/ui/switch";
import { ThemeMenu } from "@/components/ThemeMenu";
import { storageKeys } from "@/lib/chrome";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export default function Settings() {
  const [open, setOpen] = useState(false);
  const [autoClose, setAutoClose] = useState(false);
  const [smartTimeout, setSmartTimeout] = useState(false);
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

  useEffect(() => {
    chrome.storage.local.get(storageKeys.autoClose, (result) => {
      setAutoClose(result[storageKeys.autoClose] as boolean);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get(storageKeys.smartTimeout, (result) => {
      setSmartTimeout(result[storageKeys.smartTimeout] as boolean);
    });
  }, []);

  useEffect(() => {
    const totalMinutes = hours * 60 + minutes;
    chrome.storage.local.set({ [storageKeys.timeoutMinutes]: totalMinutes });
  }, [hours, minutes]);

  useEffect(() => {
    chrome.storage.local.set({ [storageKeys.autoClose]: autoClose });
  }, [autoClose]);

  useEffect(() => {
    chrome.storage.local.set({ [storageKeys.smartTimeout]: smartTimeout });
  }, [smartTimeout]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <img src={gear} alt="Settings" className="h-6 w-6" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-70">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>Theme</Label>
            <ThemeMenu />
          </div>
          <div className="flex items-center justify-between">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label>Auto Close</Label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Automatically close inactive tabs</p>
                  <p>after the specified timeout.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              checked={autoClose}
              onCheckedChange={(checked) => setAutoClose(checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label>Smart Timeout</Label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Extend timeout for frequently</p>
                  <p>accessed tabs.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              checked={smartTimeout}
              onCheckedChange={(checked) => setSmartTimeout(checked)}
            />
          </div>
          <div className="space-y-2">
            <h4 className="text-base font-medium leading-none">
              Inactive Tab Timeout
            </h4>
            <p className="text-sm text-muted-foreground">
              Set the duration after which inactive tabs will be closed.
            </p>

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
                      setHours(
                        Math.max(0, Number.parseInt(e.target.value) || 0),
                      )
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
