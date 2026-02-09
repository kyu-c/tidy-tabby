import { ArrowLeft, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeMenu } from "@/components/ThemeMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { storageKeys } from "@/lib/chrome";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

type SettingsPageProps = {
  onBack: () => void;
};

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [autoClose, setAutoClose] = useState(false);
  const [smartTimeout, setSmartTimeout] = useState(false);
  const [hours, setHours] = useState(3);
  const [minutes, setMinutes] = useState(0);
  const [excludedPatterns, setExcludedPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Load settings from storage
  useEffect(() => {
    let cancelled = false;

    chrome.storage.local.get(
      [
        storageKeys.timeoutMinutes,
        storageKeys.autoClose,
        storageKeys.smartTimeout,
        storageKeys.excludedPatterns,
      ],
      (result) => {
        if (cancelled) return;

        const totalMinutes = result[storageKeys.timeoutMinutes] as
          | number
          | undefined;
        if (totalMinutes !== undefined) {
          setHours(Math.floor(totalMinutes / 60));
          setMinutes(totalMinutes % 60);
        }

        setAutoClose(
          (result[storageKeys.autoClose] as boolean | undefined) ?? false,
        );
        setSmartTimeout(
          (result[storageKeys.smartTimeout] as boolean | undefined) ?? false,
        );
        setExcludedPatterns(
          (result[storageKeys.excludedPatterns] as string[] | undefined) ?? [],
        );
        setHydrated(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist settings to storage
  useEffect(() => {
    if (!hydrated) return;
    const totalMinutes = hours * 60 + minutes;
    chrome.storage.local.set({ [storageKeys.timeoutMinutes]: totalMinutes });
  }, [hours, hydrated, minutes]);

  useEffect(() => {
    if (!hydrated) return;
    chrome.storage.local.set({ [storageKeys.autoClose]: autoClose });
  }, [autoClose, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    chrome.storage.local.set({ [storageKeys.smartTimeout]: smartTimeout });
  }, [hydrated, smartTimeout]);

  useEffect(() => {
    if (!hydrated) return;
    chrome.storage.local.set({
      [storageKeys.excludedPatterns]: excludedPatterns,
    });
  }, [excludedPatterns, hydrated]);

  const addPattern = () => {
    const trimmed = newPattern.trim();
    if (trimmed && !excludedPatterns.includes(trimmed)) {
      setExcludedPatterns([...excludedPatterns, trimmed]);
      setNewPattern("");
    }
  };

  const removePattern = (pattern: string) => {
    setExcludedPatterns(excludedPatterns.filter((p) => p !== pattern));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPattern();
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Theme Section */}
        <div className="flex items-center justify-between">
          <Label className="text-base">Theme</Label>
          <ThemeMenu />
        </div>

        <hr className="border-border" />

        {/* Auto Close Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Auto Close</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically close inactive tabs after a set time
              </p>
            </div>
            <Switch
              checked={autoClose}
              onCheckedChange={(checked) => setAutoClose(checked)}
            />
          </div>

          {autoClose && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Close inactive tabs after</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hours"
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(e) =>
                      setHours(
                        Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      )
                    }
                    className="w-16 text-center"
                  />
                  <span className="text-sm text-muted-foreground">hrs</span>
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
                          Math.min(
                            59,
                            Number.parseInt(e.target.value, 10) || 0,
                          ),
                        ),
                      )
                    }
                    className="w-16 text-center"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Smart Timeout</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm text-muted-foreground mt-1 underline decoration-dotted cursor-help">
                          Extend timeout for frequently visited tabs
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Tabs you visit often will have longer</p>
                        <p>timeouts before being auto-closed.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={smartTimeout}
                  onCheckedChange={(checked) => setSmartTimeout(checked)}
                />
              </div>
            </>
          )}
        </div>

        <hr className="border-border" />

        {/* Excluded URLs Section */}
        <div className="space-y-4">
          <div>
            <Label className="text-base">Excluded URLs</Label>
            <p className="text-sm text-muted-foreground mt-1">
              URLs containing these patterns won't be closed
            </p>
          </div>

          {excludedPatterns.length > 0 && (
            <div className="space-y-2">
              {excludedPatterns.map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center justify-between p-2 bg-muted rounded-md"
                >
                  <span className="text-sm font-mono truncate">{pattern}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removePattern(pattern)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="e.g., mail.google.com"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button
              onClick={addPattern}
              disabled={!newPattern.trim()}
              variant="secondary"
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
