import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  File,
  LockIcon,
  MusicIcon,
  PinIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type GetLockedTabsMessage,
  type GetTabTimeoutInfoMessage,
  type GetTabTimeoutInfoResponse,
  type LockTabMessage,
  storageKeys,
  type UnlockTabMessage,
} from "@/lib/chrome";
import { logger } from "@/lib/logger";
import { isUrlExcluded } from "@/lib/urls";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export interface Tab {
  id: number;
  title: string;
  favicon: string | undefined;
  locked: boolean;
  pinned: boolean;
  audible: boolean;
  excluded: boolean;
}

function PinIconWithToolTip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <PinIcon className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>The tab is pinned on your browser.</p>
          <p>It will be excluded from the cleanup.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MusicIconWithToolTip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <MusicIcon className="w-4 h-4 animate-bounce" />
        </TooltipTrigger>
        <TooltipContent>
          <p>The tab is currently playing audio.</p>
          <p>It will be excluded from the cleanup.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function ExcludedIconWithTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <ShieldCheckIcon className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>This tab matches an excluded URL pattern.</p>
          <p>It won't be auto-closed.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TimeRemaining({ tabId }: { tabId: number }) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    const fetchTimeRemaining = async () => {
      const response: GetTabTimeoutInfoResponse =
        await chrome.runtime.sendMessage({
          kind: "getTabTimeoutInfo",
          tabId,
        } satisfies GetTabTimeoutInfoMessage);
      setTimeRemaining(response.timeRemainingMs);
    };

    fetchTimeRemaining();
    const interval = setInterval(fetchTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [tabId]);

  if (timeRemaining === null) {
    return null;
  }

  return (
    <span className="text-xs text-muted-foreground ml-2">
      ({formatTimeRemaining(timeRemaining)})
    </span>
  );
}

async function getTabs(): Promise<Tab[]> {
  const lockedTabs = await chrome.runtime.sendMessage({
    kind: "getLockedTabs",
  } satisfies GetLockedTabsMessage);

  const result = await chrome.storage.local.get(storageKeys.excludedPatterns);
  const excludedPatterns: string[] = result[storageKeys.excludedPatterns] || [];

  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => tab.id)
    .map((tab) => ({
      id: tab.id!,
      title: tab.title ?? "No Title",
      favicon: tab.favIconUrl,
      locked: lockedTabs.lockedTabs.includes(tab.id!),
      pinned: tab.pinned,
      audible: tab.audible ?? false,
      excluded: isUrlExcluded(tab.url, excludedPatterns),
    }));
}

export default function OpenTabsTable() {
  const [tabs, setTabs] = useState<Tab[]>([]);

  useEffect(() => {
    getTabs().then(setTabs);
  }, []);

  const toggleLock = (id: number) => {
    const locked = tabs.find((tab) => tab.id === id)?.locked;
    if (locked === undefined) {
      logger.error("Tab not found:", id);
      return;
    }
    chrome.runtime.sendMessage({
      kind: locked ? "unlockTab" : "lockTab",
      tabId: id,
    } satisfies LockTabMessage | UnlockTabMessage);
    setTabs(
      tabs.map((tab) =>
        tab.id === id ? { ...tab, locked: !tab.locked } : tab,
      ),
    );
  };
  const closeTab = (id: number) => {
    chrome.tabs.remove(id);
    setTabs(tabs.filter((tab) => tab.id !== id));
  };

  const switchTab = (id: number) => {
    chrome.tabs.update(id, { active: true });
  };

  const columns: ColumnDef<Tab>[] = [
    {
      header: () => (
        <div className="flex items-center justify-center">
          <LockIcon className="ml-2 w-4 h-4" />
        </div>
      ),
      accessorKey: "locked",
      size: 40,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            id={`lock-${row.original.id}`}
            checked={row.original.locked}
            onCheckedChange={() => toggleLock(row.original.id)}
            aria-label={row.original.locked ? "Unlock tab" : "Lock tab"}
          />
        </div>
      ),
    },
    {
      header: "Tab",
      accessorKey: "title",
      size: 450,
      cell: ({ row }) => (
        <div className="flex items-center gap-2 group">
          <div className="relative h-5 w-5">
            {row.original.favicon ? (
              <img
                src={row.original.favicon}
                alt="favicon"
                className="object-contain"
              />
            ) : (
              <File className="h-5 w-5" />
            )}
          </div>
          <div className="flex justify-between w-full">
            <div className="flex items-center">
              <button
                type="button"
                className="truncate max-w-[350px] hover:underline block"
                onClick={() => switchTab(row.original.id)}
              >
                {row.original.title}
              </button>
              <TimeRemaining tabId={row.original.id} />
            </div>
            <div className="flex gap-1 mr-1">
              {row.original.excluded && <ExcludedIconWithTooltip />}
              {row.original.audible && <MusicIconWithToolTip />}
              {row.original.pinned && <PinIconWithToolTip />}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => closeTab(row.original.id)}
                className="invisible group-hover:visible size-5"
              >
                <XIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: tabs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
    autoResetPageIndex: false,
  });

  return (
    <div className="container mx-auto">
      <h1 className="text-xl font-bold mb-4 ml-2">Open Tabs</h1>
      <div className="rounded-md border">
        <Table className="w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: `${cell.column.getSize()}px` }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
