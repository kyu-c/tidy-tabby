import tidyTabby from "@/assets/tidy-tabby.png";
import OpenTabsTable from "@/components/OpenTabsTable";
import Settings from "@/components/Settings";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CloseAllTabsMessage } from "@/lib/chrome";
import { useState } from "react";
import CloseAllTabsButton from "./components/CloseAllTabsButton";

function App() {
  const [tableKey, setTableKey] = useState(0);
  return (
    <ThemeProvider>
      <div className="flex w-[600px] h-[500px] p-3 bg-slate-100 dark:bg-transparent">
        <div className="flex flex-col items-center w-full h-full rounded-xl p-3 bg-white dark:bg-transparent gap-2">
          <div className="flex justify-between w-full">
            <img src={tidyTabby} alt="TidyTabby" className="w-8 h-8" />
            <div className="text-lg font-bold">TidyTabby</div>
            <Settings />
          </div>
          <div className="h-[360px] w-full ">
            <OpenTabsTable key={tableKey} />
          </div>
          <CloseAllTabsButton
            onClick={() => {
              chrome.runtime.sendMessage({
                kind: "closeAllTabs",
              } satisfies CloseAllTabsMessage);
              // Give some time for the tabs to close
              setTimeout(() => {
                setTableKey((prev) => prev + 1);
              }, 500);
            }}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
