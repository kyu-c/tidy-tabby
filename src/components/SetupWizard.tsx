import { useState } from "react";
import tidyTabby from "@/assets/tidy-tabby.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { storageKeys } from "@/lib/chrome";
import {
  CURRENT_WIZARD_VERSION,
  DEFAULT_TIMEOUT_HOURS,
  DEFAULT_TIMEOUT_MINUTES,
} from "@/lib/constants";

type SetupWizardProps = {
  onComplete: () => void;
};

type Step = "welcome" | "timeout" | "smartTimeout";

const STEPS: Step[] = ["welcome", "timeout", "smartTimeout"];

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [autoClose, setAutoClose] = useState(true);
  const [hours, setHours] = useState(DEFAULT_TIMEOUT_HOURS);
  const [minutes, setMinutes] = useState(DEFAULT_TIMEOUT_MINUTES);
  const [smartTimeout, setSmartTimeout] = useState(true);

  const totalSteps = autoClose ? 3 : 1;
  const currentStepIndex = STEPS.indexOf(step) + 1;
  const progress = (currentStepIndex / totalSteps) * 100;

  const handleNext = () => {
    if (!autoClose) {
      handleFinish();
      return;
    }
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const handleFinish = async () => {
    if (autoClose) {
      await chrome.storage.local.set({
        [storageKeys.wizardVersion]: CURRENT_WIZARD_VERSION,
        [storageKeys.autoClose]: true,
        [storageKeys.timeoutMinutes]: hours * 60 + minutes,
        [storageKeys.smartTimeout]: smartTimeout,
      });
    } else {
      await chrome.storage.local.set({
        [storageKeys.wizardVersion]: CURRENT_WIZARD_VERSION,
        [storageKeys.autoClose]: false,
      });
    }
    onComplete();
  };

  return (
    <div className="w-full">
      <Progress value={progress} className="mb-6" />

      <div className="h-[360px] flex flex-col">
        {step === "welcome" && (
          <div className="flex flex-col items-center flex-1">
            <img src={tidyTabby} alt="TidyTabby" className="w-24 h-24 mb-4" />
            <h1 className="text-4xl font-bold text-orange-400 font-darumadropone mb-2">
              Welcome to TidyTabby!
            </h1>
            <p className="text-center text-base text-muted-foreground mb-6">
              TidyTabby helps keep your browser tidy by automatically closing
              inactive tabs. We recommend enabling this feature for the best
              experience.
            </p>

            <div className="flex items-center justify-between w-full p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-base font-medium">
                  Enable Auto-Close
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically close tabs after a period of inactivity
                </p>
              </div>
              <Switch checked={autoClose} onCheckedChange={setAutoClose} />
            </div>

            <div className="mt-auto w-full">
              <Button onClick={handleNext} size="xl" className="w-full">
                {autoClose ? "Next" : "Get Started"}
              </Button>
            </div>
          </div>
        )}

        {step === "timeout" && (
          <div className="flex flex-col flex-1">
            <h2 className="text-xl font-bold mb-2">Set Inactivity Timeout</h2>
            <p className="text-base text-muted-foreground mb-6">
              How long should tabs stay open? Tabs that haven't been viewed for
              this duration will be automatically closed.
            </p>

            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={hours}
                  onChange={(e) =>
                    setHours(
                      Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                    )
                  }
                  className="w-20 text-center text-lg"
                />
                <span className="text-muted-foreground">hours</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step={5}
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(
                      Math.max(
                        0,
                        Math.min(59, Number.parseInt(e.target.value, 10) || 0),
                      ),
                    )
                  }
                  className="w-20 text-center text-lg"
                />
                <span className="text-muted-foreground">minutes</span>
              </div>
            </div>

            <div className="mt-auto flex gap-3">
              <Button
                variant="outline"
                size="xl"
                onClick={handleBack}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleNext}
                size="xl"
                className="flex-1"
                disabled={hours === 0 && minutes === 0}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {step === "smartTimeout" && (
          <div className="flex flex-col flex-1">
            <h2 className="text-xl font-bold mb-2">Smart Timeout</h2>
            <p className="text-base text-muted-foreground mb-6">
              Smart Timeout extends the timeout for tabs you visit frequently.
            </p>

            <div className="flex items-center justify-between w-full p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-base font-medium">
                  Enable Smart Timeout
                </Label>
                <p className="text-sm text-muted-foreground">
                  Frequently visited tabs get extended timeouts
                </p>
              </div>
              <Switch
                checked={smartTimeout}
                onCheckedChange={setSmartTimeout}
              />
            </div>

            <div className="mt-auto flex gap-3">
              <Button
                variant="outline"
                size="xl"
                onClick={handleBack}
                className="flex-1"
              >
                Back
              </Button>
              <Button onClick={handleFinish} size="xl" className="flex-1">
                Finish
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
