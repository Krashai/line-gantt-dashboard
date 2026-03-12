import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: boolean | undefined;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
      status === true 
        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
        : status === false 
          ? "bg-rose-50 text-rose-700 border-rose-100" 
          : "bg-slate-50 text-slate-500 border-slate-100",
      className
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        status === true ? "bg-emerald-500 animate-pulse" : status === false ? "bg-rose-500" : "bg-slate-400"
      )} />
      {status === true ? "Bieg" : status === false ? "Postój" : "Offline"}
    </div>
  );
}
