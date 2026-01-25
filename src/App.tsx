import { useEffect, useState } from "react";
import tidyTabby from "@/assets/tidy-tabby.png";
import CloseAllTabsButton from "@/components/CloseAllTabsButton";
import CloseInactiveButton from "@/components/CloseInactiveButton";
import OpenTabsTable from "@/components/OpenTabsTable";
import Settings from "@/components/Settings";
import SettingsPage from "@/components/SettingsPage";
import SetupWizard from "@/components/SetupWizard";
import { ThemeProvider } from "@/components/ThemeProvider";
import type {
  CleanupInactiveTabsMessage,
  CloseAllTabsMessage,
} from "@/lib/chrome";
import { storageKeys } from "@/lib/chrome";
import { CURRENT_WIZARD_VERSION } from "@/lib/constants";

type View = "loading" | "wizard" | "tabs" | "settings";

function App() {
  const [tableKey, setTableKey] = useState(0);
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    chrome.storage.local.get(storageKeys.wizardVersion, (result) => {
      const storedVersion = result[storageKeys.wizardVersion] as
        | number
        | undefined;
      if (storedVersion === CURRENT_WIZARD_VERSION) {
        setView("tabs");
      } else {
        setView("wizard");
      }
    });
  }, []);

  const renderContent = () => {
    switch (view) {
      case "loading":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <img
              src={tidyTabby}
              alt="TidyTabby"
              className="w-24 h-24 animate-pulse"
            />
          </div>
        );

      case "wizard":
        return <SetupWizard onComplete={() => setView("tabs")} />;

      case "settings":
        return <SettingsPage onBack={() => setView("tabs")} />;

      case "tabs":
        return (
          <>
            <div className="flex justify-between w-full">
              <img src={tidyTabby} alt="TidyTabby" className="w-20 h-20 ml-3" />
              <div className="flex text-5xl font-bold items-center font-darumadropone text-orange-400">
                TidyTabby
              </div>
              <div className="ml-14">
                <Settings onOpenSettings={() => setView("settings")} />
              </div>
            </div>
            <div className="w-full mt-4">
              <OpenTabsTable key={tableKey} />
            </div>
            <div className="flex flex-col gap-3">
              <CloseInactiveButton
                onClick={() => {
                  chrome.runtime.sendMessage({
                    kind: "cleanupInactiveTabs",
                  } satisfies CleanupInactiveTabsMessage);
                  setTimeout(() => {
                    setTableKey((prev) => prev + 1);
                  }, 500);
                }}
              />
              <CloseAllTabsButton
                onClick={() => {
                  chrome.runtime.sendMessage({
                    kind: "closeAllTabs",
                  } satisfies CloseAllTabsMessage);
                  setTimeout(() => {
                    setTableKey((prev) => prev + 1);
                  }, 500);
                }}
              />
            </div>
          </>
        );
    }
  };

  return (
    <ThemeProvider>
      <div className="flex w-[600px] p-3 bg-slate-100 dark:bg-transparent">
        <div className="flex flex-col items-center w-full h-full rounded-xl p-3 bg-white dark:bg-transparent">
          {renderContent()}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
