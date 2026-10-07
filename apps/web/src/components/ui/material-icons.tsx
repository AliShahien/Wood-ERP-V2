import type { CSSProperties, HTMLAttributes } from "react";
import { createElement } from "react";

type IconProps = HTMLAttributes<HTMLSpanElement> & { size?: number | string; strokeWidth?: number };

function icon(symbol: string) {
  return function MaterialIcon({ className = "", size, strokeWidth: _strokeWidth, style, ...props }: IconProps) {
    return createElement("span", {
      ...props,
      "aria-hidden": props["aria-label"] ? undefined : true,
      className: `material-symbols-rounded ${className}`.trim(),
      style: { ...(size ? { fontSize: size } : {}), ...style } as CSSProperties,
    }, symbol);
  };
}

export const BarChart3 = icon("monitoring");
export const Bell = icon("notifications");
export const Boxes = icon("category");
export const Calculator = icon("calculate");
export const ChevronLeft = icon("chevron_left");
export const ChevronRight = icon("chevron_right");
export const ClipboardCheck = icon("verified");
export const ClipboardList = icon("receipt_long");
export const Coins = icon("account_balance_wallet");
export const Contact = icon("groups");
export const DoorOpen = icon("door_front");
export const Factory = icon("precision_manufacturing");
export const FileDown = icon("download");
export const FileSpreadsheet = icon("table_view");
export const FileText = icon("description");
export const Hammer = icon("view_kanban");
export const History = icon("history");
export const KeyRound = icon("key");
export const Landmark = icon("account_balance");
export const Languages = icon("translate");
export const LayoutDashboard = icon("dashboard");
export const LayoutGrid = icon("grid_view");
export const ListTree = icon("account_tree");
export const LogOut = icon("logout");
export const Menu = icon("menu");
export const PackageCheck = icon("inventory_2");
export const PackageMinus = icon("outbox");
export const PackagePlus = icon("move_to_inbox");
export const Paperclip = icon("attach_file");
export const Pencil = icon("edit");
export const Plus = icon("add");
export const Power = icon("power_settings_new");
export const Printer = icon("print");
export const Receipt = icon("receipt");
export const Ruler = icon("straighten");
export const Search = icon("search");
export const Settings = icon("settings");
export const ShieldAlert = icon("gpp_bad");
export const ShieldCheck = icon("admin_panel_settings");
export const ShoppingCart = icon("shopping_bag");
export const SlidersHorizontal = icon("tune");
export const Star = icon("star");
export const Store = icon("storefront");
export const Tags = icon("sell");
export const Trash2 = icon("delete");
export const Truck = icon("local_shipping");
export const Upload = icon("upload");
export const UserRound = icon("account_circle");
export const Users = icon("manage_accounts");
export const Wallet = icon("payments");
export const Warehouse = icon("warehouse");
export const X = icon("close");
